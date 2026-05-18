export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path.startsWith('/article/') && method === 'GET') return handleArticle(env, path.replace('/article/', ''));
    if (path.startsWith('/admin/edit/') && method === 'GET') return handleAdminEdit(request, env, path.replace('/admin/edit/', ''));
    if (path.startsWith('/admin/edit/') && method === 'POST') return handleAdminEditPost(request, env, path.replace('/admin/edit/', ''));
    if (path.startsWith('/admin/delete/') && method === 'POST') return handleAdminDelete(request, env, path.replace('/admin/delete/', ''));

    const routes = {
      'GET:/': () => handleHome(env, url),
      'GET:/login': () => handleLoginPage(),
      'POST:/login': () => handleLogin(request, env),
      'GET:/logout': () => handleLogout(request, env),
      'GET:/admin': () => handleAdmin(request, env),
      'GET:/admin/new': () => handleAdminNew(request, env),
      'POST:/admin/new': () => handleAdminNewPost(request, env),
    };

    const handler = routes[`${method}:${path}`];
    if (handler) return handler();
    return html(layout('404', `<div class="nf"><span>404</span><p>页面不存在</p><a href="/">返回首页</a></div>`, env));
  }
};

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}
async function isAuthenticated(request, env) {
  const token = getCookie(request, 'session');
  if (!token) return false;
  const session = await env.BLOG_KV.get(`session:${token}`, 'json');
  return session && Date.now() < session.expiresAt;
}
function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}
function redirect(path, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: path, ...headers } });
}
async function getIndex(env) { return (await env.BLOG_KV.get('articles:index', 'json')) || []; }
async function saveIndex(env, index) { await env.BLOG_KV.put('articles:index', JSON.stringify(index)); }
function slugify(text) { return text.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') || `post-${Date.now()}`; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function html(body) { return new Response(body, { headers: { 'content-type': 'text/html;charset=UTF-8' } }); }

async function handleHome(env, url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = parseInt(env.POSTS_PER_PAGE || '10');
  const index = await getIndex(env);
  const published = index.filter(a => a.published);
  const totalPages = Math.ceil(published.length / perPage) || 1;
  const articles = published.slice((page - 1) * perPage, page * perPage);
  const blogTitle = env.BLOG_TITLE || 'My Blog';

  let list = '';
  for (const a of articles) {
    const d = new Date(a.createdAt);
    const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    list += `<a href="/article/${a.slug}" class="p-item"><span class="p-title">${esc(a.title)}</span><time>${date}</time></a>`;
  }

  let pag = '';
  if (totalPages > 1) {
    pag = '<div class="pag">';
    if (page > 1) pag += `<a href="/?page=${page-1}">&laquo; 上一页</a>`;
    pag += `<span>${page} / ${totalPages}</span>`;
    if (page < totalPages) pag += `<a href="/?page=${page+1}">下一页 &raquo;</a>`;
    pag += '</div>';
  }

  const content = `<div class="home">
    <h1 class="site-title">${esc(blogTitle)}</h1>
    <p class="site-desc">${esc(env.BLOG_DESC || '记录与分享')}</p>
    <div class="p-list">${list || '<p class="empty">暂无文章</p>'}</div>
    ${pag}
  </div>`;
  return html(layout(blogTitle, content, env));
}

async function handleArticle(env, slug) {
  const article = await env.BLOG_KV.get(`article:${slug}`, 'json');
  if (!article || !article.published) return html(layout('404', '<div class="nf"><span>404</span><p>文章不存在</p><a href="/">返回</a></div>', env));
  const d = new Date(article.createdAt);
  const date = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
  const body = `<article class="post">
    <h1 class="post-title">${esc(article.title)}</h1>
    <div class="post-meta"><time>${date}</time></div>
    <div class="post-body" id="md-content"></div>
    <div class="post-nav"><a href="/">&larr; 返回首页</a></div>
  </article>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <script>document.getElementById('md-content').innerHTML=marked.parse(${JSON.stringify(article.content)});<\/script>`;
  return html(layout(article.title, body, env));
}

function handleLoginPage(error = '') {
  const body = `<div class="login-wrap">
    <div class="login-box">
      <h2>管理员登录</h2>
      ${error ? `<div class="err">${error}</div>` : ''}
      <form method="POST" action="/login">
        <input type="text" name="username" required placeholder="用户名" autocomplete="username">
        <input type="password" name="password" required placeholder="密码" autocomplete="current-password">
        <button type="submit">登录</button>
      </form>
    </div>
  </div>`;
  return html(layout('登录', body, {}));
}

async function handleLogin(request, env) {
  const form = await request.formData();
  if (form.get('username') !== env.ADMIN_USER || form.get('password') !== env.ADMIN_PASS) return handleLoginPage('用户名或密码错误');
  const token = generateToken();
  await env.BLOG_KV.put(`session:${token}`, JSON.stringify({ expiresAt: Date.now() + 86400000 }), { expirationTtl: 86400 });
  return redirect('/admin', { 'Set-Cookie': `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400` });
}

async function handleLogout(request, env) {
  const token = getCookie(request, 'session');
  if (token) await env.BLOG_KV.delete(`session:${token}`);
  return redirect('/', { 'Set-Cookie': 'session=; Path=/; Max-Age=0' });
}

async function handleAdmin(request, env) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  const index = await getIndex(env);
  let rows = '';
  for (const a of index) {
    const date = new Date(a.createdAt).toLocaleDateString('zh-CN');
    const st = a.published ? '<i class="dot green"></i>已发布' : '<i class="dot gray"></i>草稿';
    rows += `<div class="a-row">
      <div class="a-info"><strong>${esc(a.title)}</strong><small>${st} · ${date}</small></div>
      <div class="a-acts">
        <a href="/admin/edit/${a.slug}">编辑</a>
        <form method="POST" action="/admin/delete/${a.slug}" style="display:inline" onsubmit="return confirm('确定删除？')"><button class="del">删除</button></form>
      </div>
    </div>`;
  }
  const body = `<div class="admin">
    <div class="admin-top"><h2>文章管理</h2><div class="admin-acts"><a href="/admin/new" class="btn-p">写文章</a><a href="/" target="_blank">查看博客</a><a href="/logout">退出</a></div></div>
    <div class="admin-stats"><span><b>${index.length}</b> 总计</span><span><b>${index.filter(a=>a.published).length}</b> 已发布</span><span><b>${index.filter(a=>!a.published).length}</b> 草稿</span></div>
    <div class="a-list">${rows || '<p class="empty">暂无文章，开始写第一篇吧</p>'}</div>
  </div>`;
  return html(layout('管理后台', body, env));
}

async function handleAdminNew(request, env) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  return html(layout('写文章', editorForm('', '', true, '/admin/new'), env));
}
async function handleAdminNewPost(request, env) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  const form = await request.formData();
  const title = form.get('title') || '无标题';
  const content = form.get('content') || '';
  const published = form.get('published') === 'on';
  const slug = slugify(title) + '-' + Date.now().toString(36);
  const now = new Date().toISOString();
  await env.BLOG_KV.put(`article:${slug}`, JSON.stringify({ title, content, slug, createdAt: now, updatedAt: now, published }));
  const index = await getIndex(env);
  index.unshift({ slug, title, createdAt: now, published });
  await saveIndex(env, index);
  return redirect('/admin');
}
async function handleAdminEdit(request, env, slug) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  const article = await env.BLOG_KV.get(`article:${slug}`, 'json');
  if (!article) return redirect('/admin');
  return html(layout('编辑文章', editorForm(article.title, article.content, article.published, `/admin/edit/${slug}`), env));
}
async function handleAdminEditPost(request, env, slug) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  const article = await env.BLOG_KV.get(`article:${slug}`, 'json');
  if (!article) return redirect('/admin');
  const form = await request.formData();
  article.title = form.get('title') || article.title;
  article.content = form.get('content') || '';
  article.published = form.get('published') === 'on';
  article.updatedAt = new Date().toISOString();
  await env.BLOG_KV.put(`article:${slug}`, JSON.stringify(article));
  const index = await getIndex(env);
  const i = index.findIndex(a => a.slug === slug);
  if (i >= 0) { index[i].title = article.title; index[i].published = article.published; }
  await saveIndex(env, index);
  return redirect('/admin');
}
async function handleAdminDelete(request, env, slug) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  await env.BLOG_KV.delete(`article:${slug}`);
  const index = await getIndex(env);
  await saveIndex(env, index.filter(a => a.slug !== slug));
  return redirect('/admin');
}

function editorForm(title, content, published, action) {
  return `<div class="editor">
    <form method="POST" action="${action}">
      <div class="ed-top">
        <a href="/admin">&larr; 返回</a>
        <div class="ed-acts">
          <label class="sw"><input type="checkbox" name="published" ${published?'checked':''}><span class="sw-s"></span>发布</label>
          <button type="submit" class="btn-p">保存</button>
        </div>
      </div>
      <input type="text" name="title" value="${esc(title)}" required placeholder="文章标题..." class="ed-title">
      <div class="ed-split">
        <div class="ed-pane"><div class="ed-label">Markdown 编辑</div><textarea name="content" id="editor" placeholder="开始写作...">${esc(content)}</textarea></div>
        <div class="ed-pane"><div class="ed-label">预览</div><div id="preview" class="post-body"></div></div>
      </div>
    </form>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <script>
    const e=document.getElementById('editor'),p=document.getElementById('preview');
    function u(){p.innerHTML=marked.parse(e.value)}
    e.addEventListener('input',u);u();
    e.addEventListener('keydown',function(ev){if(ev.key==='Tab'){ev.preventDefault();const s=this.selectionStart;this.value=this.value.substring(0,s)+'  '+this.value.substring(this.selectionEnd);this.selectionStart=this.selectionEnd=s+2;u()}});
  <\/script>`;
}

function layout(title, content, env) {
  const blogTitle = (env && env.BLOG_TITLE) || 'My Blog';
  return `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
/* === 主题系统 === */
/* 默认：极简白 */
:root,[data-theme="minimal"]{
  --bg:#fff;--bg2:#f7f7f8;--fg:#222;--fg2:#555;--fg3:#999;
  --bd:#eee;--accent:#333;--accent2:#555;--link:#0066cc;
  --code-bg:#f5f5f5;--radius:4px;--font:system-ui,-apple-system,sans-serif;--font-mono:ui-monospace,'SF Mono',monospace;
}
/* 暗夜 */
[data-theme="dark"]{
  --bg:#1a1a1a;--bg2:#242424;--fg:#e0e0e0;--fg2:#aaa;--fg3:#666;
  --bd:#333;--accent:#e0e0e0;--accent2:#ccc;--link:#6cb6ff;
  --code-bg:#2a2a2a;
}
/* GitHub */
[data-theme="github"]{
  --bg:#ffffff;--bg2:#f6f8fa;--fg:#1f2328;--fg2:#656d76;--fg3:#8b949e;
  --bd:#d1d9e0;--accent:#1f2328;--accent2:#656d76;--link:#0969da;
  --code-bg:#f6f8fa;
}
/* 暖色 */
[data-theme="warm"]{
  --bg:#fdf6e3;--bg2:#eee8d5;--fg:#073642;--fg2:#586e75;--fg3:#93a1a1;
  --bd:#eee8d5;--accent:#073642;--accent2:#586e75;--link:#268bd2;
  --code-bg:#eee8d5;
}
/* 紫夜 */
[data-theme="purple"]{
  --bg:#13111c;--bg2:#1c1a29;--fg:#e2dff0;--fg2:#a9a5c0;--fg3:#6c6888;
  --bd:#2d2a3e;--accent:#e2dff0;--accent2:#a9a5c0;--link:#b4a5ff;
  --code-bg:#1c1a29;
}
/* 绿意 */
[data-theme="green"]{
  --bg:#f0f5f0;--bg2:#e4ede4;--fg:#1a2e1a;--fg2:#3d5c3d;--fg3:#7a9a7a;
  --bd:#d0e0d0;--accent:#1a2e1a;--accent2:#3d5c3d;--link:#1a7a3a;
  --code-bg:#e4ede4;
}

*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font);background:var(--bg);color:var(--fg);line-height:1.7;font-size:15px;-webkit-font-smoothing:antialiased}
a{color:var(--link);text-decoration:none}
a:hover{text-decoration:underline}

/* 导航 */
.nav{border-bottom:1px solid var(--bd);padding:0 1rem}
.nav-in{max-width:680px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:48px}
.nav-brand{font-weight:700;color:var(--fg);text-decoration:none;font-size:.95rem}
.nav-r{display:flex;align-items:center;gap:.25rem}
.nav-r a,.nav-r button{color:var(--fg2);font-size:.8rem;padding:.3rem .5rem;border-radius:var(--radius);border:none;background:none;cursor:pointer;text-decoration:none;font-family:inherit}
.nav-r a:hover,.nav-r button:hover{background:var(--bg2);color:var(--fg);text-decoration:none}

/* 主题选择器 */
.theme-panel{display:none;position:fixed;top:0;right:0;bottom:0;width:220px;background:var(--bg);border-left:1px solid var(--bd);padding:1rem;z-index:999;box-shadow:-4px 0 12px rgba(0,0,0,.08)}
.theme-panel.open{display:block}
.theme-panel h4{font-size:.8rem;color:var(--fg3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.75rem}
.theme-panel .t-item{display:block;width:100%;text-align:left;padding:.5rem .6rem;border:1px solid var(--bd);border-radius:var(--radius);margin-bottom:.4rem;cursor:pointer;font-size:.85rem;background:var(--bg2);color:var(--fg);font-family:inherit;transition:border-color .15s}
.theme-panel .t-item:hover{border-color:var(--fg3)}
.theme-panel .t-item.active{border-color:var(--link);background:var(--bg)}
.theme-overlay{display:none;position:fixed;inset:0;z-index:998}
.theme-overlay.open{display:block}

/* 主体 */
.wrap{max-width:680px;margin:0 auto;padding:1.5rem 1rem 3rem}

/* 首页 */
.site-title{font-size:1.4rem;font-weight:700;margin-bottom:.2rem}
.site-desc{color:var(--fg2);font-size:.9rem;margin-bottom:1.5rem}
.p-list{border-top:1px solid var(--bd)}
.p-item{display:flex;align-items:baseline;justify-content:space-between;padding:.6rem 0;border-bottom:1px solid var(--bd);color:var(--fg);text-decoration:none;gap:1rem}
.p-item:hover{background:var(--bg2);text-decoration:none}
.p-item .p-title{font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p-item time{color:var(--fg3);font-size:.8rem;font-variant-numeric:tabular-nums;flex-shrink:0}
.pag{display:flex;align-items:center;justify-content:center;gap:1rem;margin-top:1.5rem;font-size:.85rem}
.pag a{color:var(--link)}
.pag span{color:var(--fg3)}
.empty{color:var(--fg3);padding:2rem 0;text-align:center}

/* 文章 */
.post{padding:0}
.post-title{font-size:1.6rem;font-weight:700;line-height:1.3;margin-bottom:.5rem}
.post-meta{color:var(--fg3);font-size:.85rem;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid var(--bd)}
.post-body{line-height:1.8}
.post-body h1,.post-body h2,.post-body h3{margin:1.5rem 0 .5rem;font-weight:600}
.post-body h1{font-size:1.4rem}.post-body h2{font-size:1.2rem}.post-body h3{font-size:1.05rem}
.post-body p{margin:.6rem 0}
.post-body ul,.post-body ol{margin:.6rem 0;padding-left:1.5rem}
.post-body li{margin:.2rem 0}
.post-body pre{background:var(--code-bg);border:1px solid var(--bd);padding:.8rem 1rem;border-radius:var(--radius);overflow-x:auto;margin:.8rem 0;font-family:var(--font-mono);font-size:.85rem;line-height:1.6}
.post-body code{font-family:var(--font-mono);background:var(--code-bg);padding:.1rem .35rem;border-radius:3px;font-size:.85em}
.post-body pre code{background:none;padding:0}
.post-body blockquote{border-left:3px solid var(--bd);padding:.4rem .8rem;margin:.8rem 0;color:var(--fg2)}
.post-body img{max-width:100%;border-radius:var(--radius)}
.post-body table{width:100%;border-collapse:collapse;margin:.8rem 0;font-size:.9rem}
.post-body th,.post-body td{padding:.4rem .6rem;border:1px solid var(--bd);text-align:left}
.post-body th{background:var(--bg2);font-weight:600}
.post-body hr{border:none;border-top:1px solid var(--bd);margin:1.5rem 0}
.post-body a{color:var(--link)}
.post-nav{margin-top:2rem;padding-top:1rem;border-top:1px solid var(--bd)}

/* 登录 */
.login-wrap{display:flex;justify-content:center;padding:3rem 0}
.login-box{width:100%;max-width:320px}
.login-box h2{font-size:1.1rem;margin-bottom:1rem}
.login-box input{display:block;width:100%;padding:.55rem .7rem;margin-bottom:.7rem;border:1px solid var(--bd);border-radius:var(--radius);background:var(--bg);color:var(--fg);font-size:.9rem;font-family:inherit}
.login-box input:focus{outline:none;border-color:var(--link)}
.login-box button{width:100%;padding:.55rem;background:var(--fg);color:var(--bg);border:none;border-radius:var(--radius);font-size:.9rem;cursor:pointer;font-family:inherit}
.login-box button:hover{opacity:.85}
.err{color:#d32f2f;font-size:.85rem;margin-bottom:.7rem;padding:.4rem .6rem;background:#ffeef0;border-radius:var(--radius)}

/* 后台 */
.admin{padding:0}
.admin-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem}
.admin-top h2{font-size:1.1rem;font-weight:700}
.admin-acts{display:flex;gap:.5rem;align-items:center;font-size:.85rem}
.admin-acts a{color:var(--fg2);padding:.3rem .6rem;border:1px solid var(--bd);border-radius:var(--radius)}
.admin-acts a:hover{border-color:var(--fg3);text-decoration:none}
.btn-p{background:var(--fg)!important;color:var(--bg)!important;border-color:var(--fg)!important;font-weight:500}
.admin-stats{display:flex;gap:1.5rem;margin-bottom:1rem;font-size:.85rem;color:var(--fg2)}
.admin-stats b{color:var(--fg);font-size:1rem}
.a-list{border-top:1px solid var(--bd)}
.a-row{display:flex;align-items:center;justify-content:space-between;padding:.6rem 0;border-bottom:1px solid var(--bd);gap:.5rem}
.a-info{flex:1;min-width:0}
.a-info strong{display:block;font-size:.9rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.a-info small{color:var(--fg3);font-size:.8rem;display:flex;align-items:center;gap:.4rem}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%}
.dot.green{background:#2d9d78}
.dot.gray{background:var(--fg3)}
.a-acts{display:flex;gap:.4rem;font-size:.8rem;flex-shrink:0}
.a-acts a{color:var(--link);padding:.2rem .5rem;border:1px solid var(--bd);border-radius:var(--radius)}
.a-acts a:hover{text-decoration:none;border-color:var(--link)}
.del{background:none;border:1px solid var(--bd);color:var(--fg3);padding:.2rem .5rem;border-radius:var(--radius);cursor:pointer;font-size:.8rem;font-family:inherit}
.del:hover{color:#d32f2f;border-color:#d32f2f}

/* 编辑器 */
.editor{padding:0}
.ed-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
.ed-top a{color:var(--fg2);font-size:.85rem}
.ed-acts{display:flex;align-items:center;gap:.75rem}
.ed-title{width:100%;padding:.5rem 0;border:none;border-bottom:1px solid var(--bd);background:none;color:var(--fg);font-size:1.3rem;font-weight:700;font-family:inherit;margin-bottom:1rem}
.ed-title:focus{outline:none;border-color:var(--link)}
.ed-split{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--bd);border-radius:var(--radius);overflow:hidden}
@media(max-width:700px){.ed-split{grid-template-columns:1fr}}
.ed-pane{display:flex;flex-direction:column;min-height:420px}
.ed-pane:first-child{border-right:1px solid var(--bd)}
@media(max-width:700px){.ed-pane:first-child{border-right:none;border-bottom:1px solid var(--bd)}}
.ed-label{padding:.4rem .7rem;background:var(--bg2);font-size:.75rem;color:var(--fg3);border-bottom:1px solid var(--bd);font-weight:500;text-transform:uppercase;letter-spacing:.03em}
#editor{flex:1;width:100%;padding:.8rem;border:none;background:var(--bg);color:var(--fg);font-family:var(--font-mono);font-size:.85rem;line-height:1.6;resize:none}
#editor:focus{outline:none}
#preview{flex:1;padding:.8rem;overflow-y:auto}

/* 开关 */
.sw{display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem;color:var(--fg2)}
.sw input{display:none}
.sw-s{width:28px;height:16px;background:var(--bd);border-radius:8px;position:relative;transition:background .2s}
.sw-s::after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .2s}
.sw input:checked+.sw-s{background:var(--link)}
.sw input:checked+.sw-s::after{transform:translateX(12px)}

/* 404 */
.nf{text-align:center;padding:4rem 0}
.nf span{font-size:3rem;font-weight:700;color:var(--fg3);opacity:.4}
.nf p{color:var(--fg2);margin:.5rem 0 1rem}

/* 页脚 */
.foot{text-align:center;padding:1.5rem 0;color:var(--fg3);font-size:.75rem;border-top:1px solid var(--bd);margin-top:2rem}

@media(max-width:640px){
  .site-title{font-size:1.2rem}
  .post-title{font-size:1.3rem}
  .admin-top{flex-direction:column;align-items:flex-start}
  .a-row{flex-direction:column;align-items:flex-start;gap:.3rem}
}
</style></head>
<body>
<nav class="nav"><div class="nav-in">
  <a href="/" class="nav-brand">${esc(blogTitle)}</a>
  <div class="nav-r">
    <a href="/">首页</a>
    <button onclick="openTheme()">主题</button>
  </div>
</div></nav>
<div class="wrap">${content}</div>
<footer class="foot">Powered by Cloudflare Workers</footer>
<div class="theme-overlay" onclick="closeTheme()"></div>
<div class="theme-panel" id="tp">
  <h4>选择主题</h4>
  <button class="t-item" data-t="minimal">极简白</button>
  <button class="t-item" data-t="dark">暗夜</button>
  <button class="t-item" data-t="github">GitHub</button>
  <button class="t-item" data-t="warm">暖色</button>
  <button class="t-item" data-t="purple">紫夜</button>
  <button class="t-item" data-t="green">绿意</button>
</div>
<script>
function openTheme(){document.getElementById('tp').classList.add('open');document.querySelector('.theme-overlay').classList.add('open');updateActive()}
function closeTheme(){document.getElementById('tp').classList.remove('open');document.querySelector('.theme-overlay').classList.remove('open')}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);localStorage.setItem('theme',t);updateActive()}
function updateActive(){const c=localStorage.getItem('theme')||'minimal';document.querySelectorAll('.t-item').forEach(b=>{b.classList.toggle('active',b.dataset.t===c)})}
document.querySelectorAll('.t-item').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.t)));
(()=>{const t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)})();
</script></body></html>`;
}