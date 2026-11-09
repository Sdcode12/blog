// Visitor accounts are independent of the existing administrator session.
const COOKIE = 'user_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
// Stay within the Workers production Web Crypto PBKDF2 iteration ceiling.
const PASSWORD_ITERATIONS = 100000;
const MAX_FORM_BYTES = 16384;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;
const encoder = new TextEncoder();

function escape(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

function cookieToken(request) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE) {
      const token = value.join('=');
      return /^[a-f0-9]{64}$/.test(token) ? token : null;
    }
  }
  return null;
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

async function passwordHash(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bytes = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations}, key, 256);
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

function equalHash(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function database(env) {
  // Auth reads must not accept a stale replica after logout or registration.
  return env.USER_DB.withSession('first-primary');
}

function sessionCookie(request, token, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function privateResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {status, headers:{
    'Content-Type':'text/html; charset=UTF-8',
    'Cache-Control':'no-store',
    'Referrer-Policy':'same-origin',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"frame-ancestors 'none'; form-action 'self'; base-uri 'self'",
    ...extraHeaders
  }});
}

function redirect(location, cookie) {
  return privateResponse(null, 303, {Location:location, ...(cookie ? {'Set-Cookie':cookie} : {})});
}

function isSameOrigin(request) {
  // Browsers send Origin for form POSTs; a same-origin Referer is a fallback.
  const source = request.headers.get('Origin') || request.headers.get('Referer');
  try {
    return !!source && new URL(source).origin === new URL(request.url).origin && request.headers.get('Sec-Fetch-Site') !== 'cross-site';
  } catch {
    return false;
  }
}

async function readForm(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    throw new Response('不支持的表单格式', {status:415});
  }
  if (Number(request.headers.get('Content-Length')) > MAX_FORM_BYTES) {
    throw new Response('提交内容过长', {status:413});
  }
  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();
  const chunks = [];
  let length = 0;
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_FORM_BYTES) {
      await reader.cancel();
      throw new Response('提交内容过长', {status:413});
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new URLSearchParams(new TextDecoder().decode(bytes));
}

async function enforceRateLimit(request, db, action, usernameKey) {
  const now = Date.now();
  const windowMs = action === 'register' ? 60 * 60 * 1000 : 15 * 60 * 1000;
  const limit = action === 'register' ? 5 : 10;
  // On Cloudflare this header is populated by the edge, not by the visitor.
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const buckets = [`${action}:ip:${await digest(ip)}`];
  if (action === 'login') buckets.push(`login:account:${await digest(usernameKey)}`);
  // Remove old counters and sessions; they remain invalid even before cleanup.
  await db.batch([
    db.prepare('DELETE FROM auth_rate_limits WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').bind(now)
  ]);
  const counts = await db.batch(buckets.map(bucket => db.prepare(`
    INSERT INTO auth_rate_limits (bucket, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1
    RETURNING attempts, expires_at
  `).bind(bucket, now + windowMs)));
  const exceeded = counts.find(result => result.results[0].attempts > limit);
  if (exceeded) {
    const retry = Math.max(1, Math.ceil((exceeded.results[0].expires_at - now) / 1000));
    throw new Response('操作过于频繁，请稍后再试。', {status:429, headers:{'Retry-After':String(retry)}});
  }
}

async function createSession(request, db, userId) {
  const token = randomHex(32);
  const now = Date.now();
  const previous = cookieToken(request);
  const statements = [];
  if (previous) statements.push(db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').bind(await digest(previous)));
  statements.push(db.prepare('INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await digest(token), userId, now, now + SESSION_SECONDS * 1000));
  await db.batch(statements);
  return sessionCookie(request, token);
}

export async function getCurrentUser(request, env) {
  const token = cookieToken(request);
  if (!token || !env.USER_DB) return null;
  return database(env).prepare(`
    SELECT u.id, u.username, u.created_at FROM user_sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(await digest(token), Date.now()).first();
}

function formPage(mode, render, error = '', username = '', status = 200) {
  const register = mode === 'register';
  const title = register ? '创建账号' : '用户登录';
  const inputClass = 'w-full border border-outline-variant bg-transparent px-3 py-3 rounded-lg focus:ring-1 focus:ring-primary';
  const body = `<main class="max-w-[440px] mx-auto px-gutter py-12">
    <section class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 sm:p-8">
      <h1 class="font-headline-lg text-headline-lg mb-2">${title}</h1>
      <p class="text-on-surface-variant mb-6">${register ? '注册后即可拥有自己的博客账号。' : '欢迎回来，登录后查看你的个人中心。'}</p>
      ${error ? `<div role="alert" class="bg-error-container text-error p-3 rounded-lg mb-5">${escape(error)}</div>` : ''}
      <form method="POST" action="${register ? '/register' : '/user/login'}" class="space-y-5">
        <div><label for="username" class="block text-caption mb-2">用户名</label>
          <input id="username" name="username" type="text" value="${escape(username)}" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_]{3,32}" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="username-help" class="${inputClass}">
          <p id="username-help" class="text-caption text-on-surface-variant mt-2">3–32 位字母、数字或下划线，不区分大小写</p></div>
        <div><label for="password" class="block text-caption mb-2">密码</label>
          <input id="password" name="password" type="password" required minlength="12" maxlength="128" autocomplete="${register ? 'new-password' : 'current-password'}" aria-describedby="password-help" class="${inputClass}">
          <p id="password-help" class="text-caption text-on-surface-variant mt-2">12–128 个字符，建议使用独特的长密码</p></div>
        ${register ? `<div><label for="confirm-password" class="block text-caption mb-2">确认密码</label><input id="confirm-password" name="confirm_password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" class="${inputClass}"></div>` : ''}
        <button type="submit" class="w-full bg-primary text-on-primary py-3 rounded-lg hover:opacity-90">${register ? '注册并登录' : '登录'}</button>
      </form>
      <p class="text-caption text-on-surface-variant mt-6 text-center">${register ? '已有账号？<a href="/user/login" class="underline text-primary">去登录</a>' : '还没有账号？<a href="/register" class="underline text-primary">立即注册</a>'}</p>
      <p class="text-caption mt-4 text-center"><a href="/" class="text-on-surface-variant underline">返回博客</a></p>
    </section>
  </main>`;
  return privateResponse(render(title, body), status);
}

function accountPage(user, render) {
  const body = `<main class="max-w-[720px] mx-auto px-gutter py-12">
    <section class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 sm:p-8">
      <h1 class="font-headline-lg text-headline-lg mb-2">个人中心</h1>
      <p class="text-body-lg mb-8">你好，${escape(user.username)}</p>
      <dl class="space-y-4"><div><dt class="text-caption text-on-surface-variant">用户名</dt><dd class="mt-1">${escape(user.username)}</dd></div>
        <div><dt class="text-caption text-on-surface-variant">注册时间</dt><dd class="mt-1">${escape(new Date(user.created_at).toISOString().slice(0, 10))}（UTC）</dd></div>
        <div><dt class="text-caption text-on-surface-variant">账号类型</dt><dd class="mt-1">普通用户</dd></div></dl>
      <div class="mt-8 flex flex-wrap items-center gap-4"><a href="/" class="bg-primary text-on-primary px-6 py-3 rounded-lg">继续阅读</a>
        <form method="POST" action="/user/logout"><button type="submit" class="border border-outline-variant px-6 py-3 rounded-lg">退出登录</button></form></div>
    </section>
  </main>`;
  return privateResponse(render('个人中心', body, user));
}

async function submitForm(request, env, mode, render) {
  const form = await readForm(request);
  const username = (form.get('username') || '').trim();
  const usernameKey = username.toLowerCase();
  // Password whitespace is significant. Never trim or echo a password.
  const password = form.get('password') || '';
  if (!USERNAME_PATTERN.test(username) || password.length < 12 || password.length > 128) {
    return formPage(mode, render, '用户名需为 3–32 位字母、数字或下划线，密码需为 12–128 个字符。', username, 400);
  }
  if (mode === 'register' && password !== form.get('confirm_password')) {
    return formPage(mode, render, '两次输入的密码不一致。', username, 400);
  }
  const db = database(env);
  await enforceRateLimit(request, db, mode, usernameKey);
  let user;
  if (mode === 'register') {
    const salt = randomHex(16);
    const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
    const id = crypto.randomUUID();
    // The unique index is authoritative, including concurrent registrations.
    const inserted = await db.prepare(`
      INSERT INTO users (id, username, username_key, password_hash, password_salt, password_iterations, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(username_key) DO NOTHING RETURNING id
    `).bind(id, username, usernameKey, hash, salt, PASSWORD_ITERATIONS, Date.now()).first();
    if (!inserted) return formPage(mode, render, '该用户名已被使用，请换一个。', username, 409);
    user = {id};
  } else {
    user = await db.prepare('SELECT * FROM users WHERE username_key = ?').bind(usernameKey).first();
    // Do equivalent work for unknown accounts to avoid a cheap timing oracle.
    const hash = await passwordHash(password, user?.password_salt || '00000000000000000000000000000000', user?.password_iterations || PASSWORD_ITERATIONS);
    if (!user || !equalHash(hash, user.password_hash)) {
      return formPage(mode, render, '用户名或密码错误。', username, 401);
    }
  }
  return redirect('/account', await createSession(request, db, user.id));
}

export async function handleUserRequest(request, env, render) {
  const path = new URL(request.url).pathname;
  const allowed = {'/register':['GET', 'POST'], '/user/login':['GET', 'POST'], '/user/logout':['POST'], '/account':['GET']};
  if (!Object.hasOwn(allowed, path)) return null;
  if (!allowed[path].includes(request.method)) return privateResponse('请求方法不支持', 405, {Allow:allowed[path].join(', ')});
  if (request.method === 'POST' && !isSameOrigin(request)) return privateResponse('请从本站页面提交表单。', 403);
  if (!env.USER_DB) return privateResponse(render('账号服务暂不可用', '<main class="max-w-[720px] mx-auto px-gutter py-12"><h1 class="text-headline-md">账号服务暂不可用</h1><p class="mt-4">请稍后再试。</p><a class="underline mt-4 inline-block" href="/">返回博客</a></main>'), 503);
  try {
    if (path === '/user/logout') {
      const token = cookieToken(request);
      if (token) await database(env).prepare('DELETE FROM user_sessions WHERE token_hash = ?').bind(await digest(token)).run();
      return redirect('/user/login', sessionCookie(request, '', 0));
    }
    if (request.method === 'POST') return await submitForm(request, env, path === '/register' ? 'register' : 'login', render);
    const user = await getCurrentUser(request, env);
    if (path === '/account') return user ? accountPage(user, render) : redirect('/user/login', sessionCookie(request, '', 0));
    return user ? redirect('/account') : formPage(path === '/register' ? 'register' : 'login', render);
  } catch (error) {
    if (error instanceof Response) {
      const headers = error.headers.has('Retry-After') ? {'Retry-After':error.headers.get('Retry-After')} : {};
      return privateResponse(render('请求未完成', `<main class="max-w-[440px] mx-auto px-gutter py-12"><p role="alert">${escape(await error.text())}</p><a class="underline mt-4 inline-block" href="${path === '/register' ? '/register' : '/user/login'}">返回</a></main>`), error.status, headers);
    }
    // Never expose database errors, submitted passwords, or tokens to visitors.
    return privateResponse(render('账号服务暂不可用', '<main class="max-w-[720px] mx-auto px-gutter py-12"><h1 class="text-headline-md">账号服务暂不可用</h1><p class="mt-4">请稍后再试。</p><a class="underline mt-4 inline-block" href="/">返回博客</a></main>'), 503);
  }
}
