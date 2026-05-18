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
    return html(layout('404', `<div class="nf"><span>404</span><p>页面不存在</p><a href="/" class="btn">返回首页</a></div>`, env));
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
function redirect(path, headers = {}) { return new Response(null, { status: 302, headers: { Location: path, ...headers } }); }
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
  const blogDesc = env.BLOG_DESC || '记录与分享';

  let cards = '';
  for (const a of articles) {
    const d = new Date(a.createdAt);
    const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    cards += `<a href="/article/${a.slug}" class="card"><div class="card-body"><h3>${esc(a.title)}</h3><time>${date}</time></div><span class="card-arrow">&rarr;</span></a>`;
  }

  let pag = '';
  if (totalPages > 1) {
    pag = '<div class="pag">';
    if (page > 1) pag += `<a href="/?page=${page-1}">&laquo; 上一页</a>`;
    pag += `<span>${page} / ${totalPages}</span>`;
    if (page < totalPages) pag += `<a href="/?page=${page+1}">下一页 &raquo;</a>`;
    pag += '</div>';
  }

  return html(layout(blogTitle, `
    <div class="home-header"><h1>${esc(blogTitle)}</h1><p>${esc(blogDesc)}</p></div>
    <div class="card-list">${cards || '<div class="empty">暂无文章</div>'}</div>${pag}`, env));
}

async function handleArticle(env, slug) {
  const article = await env.BLOG_KV.get(`article:${slug}`, 'json');
  if (!article || !article.published) return html(layout('404', '<div class="nf"><span>404</span><p>文章不存在</p><a href="/" class="btn">返回</a></div>', env));
  const d = new Date(article.createdAt);
  const date = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
  return html(layout(article.title, `
    <article class="article">
      <a href="/" class="back">&larr; 所有文章</a>
      <h1>${esc(article.title)}</h1>
      <div class="meta">${date}</div>
      <div class="body" id="md-out"></div>
    </article>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
    <script>document.getElementById('md-out').innerHTML=marked.parse(${JSON.stringify(article.content)});<\/script>`, env));
}

function handleLoginPage(error = '') {
  return html(layout('登录', `
    <div class="login">
      <h2>管理员登录</h2>
      ${error ? `<div class="err">${error}</div>` : ''}
      <form method="POST" action="/login">
        <input type="text" name="username" required placeholder="用户名" autocomplete="username">
        <input type="password" name="password" required placeholder="密码" autocomplete="current-password">
        <button type="submit" class="btn btn-block">登录</button>
      </form>
    </div>`, {}));
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
    rows += `<div class="tbl-row">
      <div class="tbl-cell tbl-main"><span class="dot ${a.published?'green':''}"></span><strong>${esc(a.title)}</strong></div>
      <div class="tbl-cell tbl-date">${date}</div>
      <div class="tbl-cell tbl-acts"><a href="/admin/edit/${a.slug}">编辑</a><form method="POST" action="/admin/delete/${a.slug}" style="display:inline" onsubmit="return confirm('确定删除？')"><button class="link-del">删除</button></form></div>
    </div>`;
  }
  return html(layout('管理后台', `
    <div class="admin-wrap">
      <div class="admin-bar">
        <h2>文章管理 <small>${index.length}篇</small></h2>
        <div class="admin-acts"><a href="/admin/new" class="btn">写文章</a><a href="/" class="link" target="_blank">查看博客</a><a href="/logout" class="link">退出</a></div>
      </div>
      <div class="tbl">${rows || '<div class="empty">暂无文章</div>'}</div>
    </div>`, env));
}

async function handleAdminNew(request, env) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  return html(editorLayout('写文章', '', '', true, '/admin/new', env));
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
  return html(editorLayout('编辑文章', article.title, article.content, article.published, `/admin/edit/${slug}`, env));
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

// 编辑器使用全屏布局，最大化利用空间
function editorLayout(pageTitle, title, content, published, action, env) {
  const blogTitle = (env && env.BLOG_TITLE) || 'My Blog';
  return `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pageTitle)}</title>
<style>${CSS_VARS}${CSS_EDITOR}</style></head>
<body class="editor-body">
<form method="POST" action="${action}" class="ed-form">
  <div class="ed-bar">
    <a href="/admin" class="ed-back">&larr; 返回</a>
    <input type="text" name="title" value="${esc(title)}" required placeholder="文章标题" class="ed-title">
    <div class="ed-acts">
      <label class="sw"><input type="checkbox" name="published" ${published?'checked':''}><span class="sw-t"></span><span>发布</span></label>
      <button type="submit" class="btn">保存</button>
    </div>
  </div>
  <div class="ed-main">
    <div class="ed-col"><div class="ed-tab">Markdown</div><textarea name="content" id="editor" placeholder="开始写作...">${esc(content)}</textarea></div>
    <div class="ed-col"><div class="ed-tab">预览</div><div id="preview" class="body"></div></div>
  </div>
</form>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<script>
const e=document.getElementById('editor'),p=document.getElementById('preview');
function u(){p.innerHTML=marked.parse(e.value)}
e.addEventListener('input',u);u();
e.addEventListener('keydown',function(ev){if(ev.key==='Tab'){ev.preventDefault();const s=this.selectionStart;this.value=this.value.substring(0,s)+'  '+this.value.substring(this.selectionEnd);this.selectionStart=this.selectionEnd=s+2;u()}});
</script></body></html>`;
}

const CSS_VARS = `
:root,[data-theme="light"]{--bg:#fff;--bg2:#f5f6f7;--fg:#1d1d1f;--fg2:#6e6e73;--fg3:#aeaeb2;--bd:#e5e5e7;--accent:#0071e3;--radius:6px;--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;--mono:ui-monospace,"SF Mono","Cascadia Code",monospace}
[data-theme="dark"]{--bg:#1c1c1e;--bg2:#2c2c2e;--fg:#f5f5f7;--fg2:#a1a1a6;--fg3:#636366;--bd:#38383a;--accent:#64d2ff}
[data-theme="github"]{--bg:#fff;--bg2:#f6f8fa;--fg:#1f2328;--fg2:#656d76;--fg3:#8b949e;--bd:#d0d7de;--accent:#0969da}
[data-theme="warm"]{--bg:#faf8f5;--bg2:#f0ece6;--fg:#2c2416;--fg2:#6b5d4d;--fg3:#a89a8a;--bd:#e6dfd6;--accent:#b35c00}
[data-theme="nord"]{--bg:#2e3440;--bg2:#3b4252;--fg:#eceff4;--fg2:#d8dee9;--fg3:#7b88a1;--bd:#434c5e;--accent:#88c0d0}
[data-theme="rose"]{--bg:#fff5f5;--bg2:#ffe4e6;--fg:#1a1a2e;--fg2:#6b4c5a;--fg3:#b08090;--bd:#f0d0d6;--accent:#e11d48}
`;

const CSS_EDITOR = `
*{margin:0;padding:0;box-sizing:border-box}
.editor-body{font-family:var(--font);background:var(--bg);color:var(--fg);height:100vh;display:flex;flex-direction:column}
.ed-form{display:flex;flex-direction:column;height:100%}
.ed-bar{display:flex;align-items:center;gap:.75rem;padding:.5rem .75rem;border-bottom:1px solid var(--bd);background:var(--bg2);flex-shrink:0}
.ed-back{color:var(--fg2);font-size:.8rem;text-decoration:none;white-space:nowrap}
.ed-back:hover{color:var(--accent)}
.ed-title{flex:1;border:none;background:none;font-size:1rem;font-weight:600;color:var(--fg);font-family:inherit;padding:.3rem .5rem;border-radius:var(--radius);min-width:0}
.ed-title:focus{outline:none;background:var(--bg)}
.ed-acts{display:flex;align-items:center;gap:.6rem;flex-shrink:0}
.ed-main{flex:1;display:grid;grid-template-columns:1fr 1fr;min-height:0}
@media(max-width:700px){.ed-main{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
.ed-col{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--bd)}
.ed-col:last-child{border-right:none}
.ed-tab{padding:.3rem .75rem;font-size:.7rem;color:var(--fg3);background:var(--bg2);border-bottom:1px solid var(--bd);text-transform:uppercase;letter-spacing:.04em;font-weight:600}
#editor{flex:1;width:100%;border:none;padding:.75rem;background:var(--bg);color:var(--fg);font-family:var(--mono);font-size:.85rem;line-height:1.65;resize:none}
#editor:focus{outline:none}
#preview{flex:1;padding:.75rem;overflow-y:auto;font-size:.9rem;line-height:1.7}
.sw{display:flex;align-items:center;gap:.3rem;cursor:pointer;font-size:.8rem;color:var(--fg2);white-space:nowrap}
.sw input{display:none}
.sw-t{width:26px;height:14px;background:var(--bd);border-radius:7px;position:relative;transition:background .2s}
.sw-t::after{content:'';position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fff;transition:transform .15s}
.sw input:checked+.sw-t{background:var(--accent)}
.sw input:checked+.sw-t::after{transform:translateX(12px)}
.btn{padding:.35rem .8rem;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:.8rem;cursor:pointer;font-family:inherit;font-weight:500}
.btn:hover{opacity:.85}
`;

function layout(title, content, env) {
  const blogTitle = (env && env.BLOG_TITLE) || 'My Blog';
  return `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS_VARS}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font);background:var(--bg);color:var(--fg);line-height:1.65;font-size:15px;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}

.nav{border-bottom:1px solid var(--bd);background:var(--bg)}
.nav-in{max-width:960px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:44px;padding:0 1rem}
.nav-brand{font-weight:700;color:var(--fg);text-decoration:none;font-size:.9rem}
.nav-r{display:flex;align-items:center;gap:.2rem}
.nav-r a,.nav-r button{color:var(--fg2);font-size:.78rem;padding:.25rem .5rem;border-radius:var(--radius);border:none;background:none;cursor:pointer;text-decoration:none;font-family:inherit}
.nav-r a:hover,.nav-r button:hover{background:var(--bg2);color:var(--fg);text-decoration:none}

.main{flex:1;max-width:960px;width:100%;margin:0 auto;padding:1rem}

/* 首页 */
.home-header{margin-bottom:1rem}
.home-header h1{font-size:1.3rem;font-weight:700}
.home-header p{color:var(--fg2);font-size:.85rem}
.card-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.6rem}
.card{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;border:1px solid var(--bd);border-radius:var(--radius);color:var(--fg);text-decoration:none;transition:border-color .15s,box-shadow .15s}
.card:hover{border-color:var(--accent);box-shadow:0 2px 8px rgba(0,0,0,.05);text-decoration:none}
.card h3{font-size:.9rem;font-weight:600;margin-bottom:.15rem}
.card time{font-size:.75rem;color:var(--fg3)}
.card-arrow{color:var(--fg3);font-size:.9rem;transition:transform .15s}
.card:hover .card-arrow{transform:translateX(3px);color:var(--accent)}
.pag{display:flex;align-items:center;justify-content:center;gap:1rem;margin-top:1rem;font-size:.8rem}
.pag span{color:var(--fg3)}
.empty{color:var(--fg3);text-align:center;padding:2rem;font-size:.9rem}

/* 文章 */
.article{max-width:700px;margin:0 auto}
.article h1{font-size:1.5rem;font-weight:700;margin:.5rem 0}
.article .back{font-size:.8rem;color:var(--fg2)}
.article .meta{color:var(--fg3);font-size:.8rem;margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid var(--bd)}
.body{line-height:1.8;font-size:.95rem}
.body h1,.body h2,.body h3{margin:1.2rem 0 .4rem;font-weight:600}
.body h1{font-size:1.3rem}.body h2{font-size:1.15rem}.body h3{font-size:1rem}
.body p{margin:.5rem 0}
.body ul,.body ol{margin:.5rem 0;padding-left:1.3rem}
.body li{margin:.15rem 0}
.body pre{background:var(--bg2);border:1px solid var(--bd);padding:.6rem .8rem;border-radius:var(--radius);overflow-x:auto;margin:.7rem 0;font-family:var(--mono);font-size:.82rem;line-height:1.6}
.body code{font-family:var(--mono);background:var(--bg2);padding:.1rem .3rem;border-radius:3px;font-size:.82em}
.body pre code{background:none;padding:0}
.body blockquote{border-left:3px solid var(--bd);padding:.3rem .7rem;margin:.7rem 0;color:var(--fg2)}
.body img{max-width:100%;border-radius:var(--radius)}
.body table{width:100%;border-collapse:collapse;margin:.7rem 0;font-size:.85rem}
.body th,.body td{padding:.35rem .5rem;border:1px solid var(--bd);text-align:left}
.body th{background:var(--bg2);font-weight:600}
.body hr{border:none;border-top:1px solid var(--bd);margin:1.2rem 0}
.body a{color:var(--accent)}

/* 登录 */
.login{max-width:300px;margin:2rem auto}
.login h2{font-size:1rem;margin-bottom:.8rem}
.login input{display:block;width:100%;padding:.45rem .6rem;margin-bottom:.5rem;border:1px solid var(--bd);border-radius:var(--radius);background:var(--bg);color:var(--fg);font-size:.85rem;font-family:inherit}
.login input:focus{outline:none;border-color:var(--accent)}
.err{color:#d32f2f;font-size:.8rem;margin-bottom:.5rem;padding:.3rem .5rem;background:#ffeef0;border-radius:var(--radius)}

/* 后台 */
.admin-wrap{width:100%}
.admin-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem}
.admin-bar h2{font-size:1rem;font-weight:700}
.admin-bar small{color:var(--fg3);font-weight:400;font-size:.8rem}
.admin-acts{display:flex;align-items:center;gap:.5rem;font-size:.8rem}
.link{color:var(--fg2);font-size:.8rem}
.tbl{border:1px solid var(--bd);border-radius:var(--radius);overflow:hidden}
.tbl-row{display:flex;align-items:center;padding:.5rem .75rem;border-bottom:1px solid var(--bd);gap:.5rem}
.tbl-row:last-child{border-bottom:none}
.tbl-row:hover{background:var(--bg2)}
.tbl-main{flex:1;display:flex;align-items:center;gap:.5rem;min-width:0}
.tbl-main strong{font-size:.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%;background:var(--fg3);flex-shrink:0}
.dot.green{background:#34c759}
.tbl-date{color:var(--fg3);font-size:.75rem;flex-shrink:0;width:80px}
.tbl-acts{display:flex;gap:.3rem;flex-shrink:0}
.tbl-acts a{font-size:.75rem;color:var(--accent);padding:.15rem .4rem;border:1px solid var(--bd);border-radius:var(--radius)}
.tbl-acts a:hover{border-color:var(--accent);text-decoration:none}
.link-del{background:none;border:1px solid var(--bd);color:var(--fg3);padding:.15rem .4rem;border-radius:var(--radius);cursor:pointer;font-size:.75rem;font-family:inherit}
.link-del:hover{color:#d32f2f;border-color:#d32f2f}

/* 按钮 */
.btn{display:inline-block;padding:.35rem .75rem;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:.8rem;cursor:pointer;text-decoration:none;font-family:inherit;font-weight:500}
.btn:hover{opacity:.85;text-decoration:none}
.btn-block{width:100%;text-align:center;padding:.5rem}

/* 主题面板 */
.tp{display:none;position:fixed;top:44px;right:0;width:180px;background:var(--bg);border:1px solid var(--bd);border-radius:0 0 0 var(--radius);padding:.5rem;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,.1)}
.tp.open{display:block}
.tp-title{font-size:.7rem;color:var(--fg3);margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.tp button{display:block;width:100%;text-align:left;padding:.35rem .5rem;border:none;background:none;border-radius:var(--radius);cursor:pointer;font-size:.8rem;color:var(--fg);font-family:inherit}
.tp button:hover{background:var(--bg2)}
.tp button.on{background:var(--bg2);font-weight:600;color:var(--accent)}

/* 404 */
.nf{text-align:center;padding:3rem 0}
.nf span{font-size:2.5rem;font-weight:700;color:var(--fg3);opacity:.3}
.nf p{color:var(--fg2);margin:.3rem 0 1rem;font-size:.9rem}

.foot{text-align:center;padding:1rem 0;color:var(--fg3);font-size:.7rem;border-top:1px solid var(--bd);margin-top:auto}
</style></head>
<body>
<nav class="nav"><div class="nav-in">
  <a href="/" class="nav-brand">${esc(blogTitle)}</a>
  <div class="nav-r"><a href="/">首页</a><button onclick="document.querySelector('.tp').classList.toggle('open')">主题</button></div>
</div></nav>
<div class="main">${content}</div>
<footer class="foot">Powered by Cloudflare Workers</footer>
<div class="tp" id="tp">
  <div class="tp-title">选择主题</div>
  <button data-t="light">明亮</button>
  <button data-t="dark">暗夜</button>
  <button data-t="github">GitHub</button>
  <button data-t="warm">暖色</button>
  <button data-t="nord">Nord</button>
  <button data-t="rose">玫瑰</button>
</div>
<script>
function setT(t){document.documentElement.setAttribute('data-theme',t);localStorage.setItem('theme',t);document.querySelectorAll('.tp button').forEach(b=>b.classList.toggle('on',b.dataset.t===t))}
document.querySelectorAll('.tp button').forEach(b=>b.addEventListener('click',()=>{setT(b.dataset.t);document.querySelector('.tp').classList.remove('open')}));
(()=>{const t=localStorage.getItem('theme')||'light';setT(t)})();
document.addEventListener('click',e=>{const tp=document.querySelector('.tp');if(tp.classList.contains('open')&&!tp.contains(e.target)&&!e.target.closest('.nav-r button'))tp.classList.remove('open')});
</script></body></html>`;
}