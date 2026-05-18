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
    return html(page('404', `<div class="nf"><h1>404</h1><p>页面不存在</p><a href="/" class="btn-primary">返回首页</a></div>`, env));
  }
};

function getCookie(req, name) { const c = req.headers.get('Cookie')||''; const m = c.match(new RegExp(`${name}=([^;]+)`)); return m?m[1]:null; }
async function isAuth(req, env) { const t = getCookie(req,'session'); if(!t) return false; const s = await env.BLOG_KV.get(`session:${t}`,'json'); return s && Date.now()<s.expiresAt; }
function genToken() { const a=new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a,b=>b.toString(16).padStart(2,'0')).join(''); }
function redir(p, h={}) { return new Response(null,{status:302,headers:{Location:p,...h}}); }
async function getIndex(env) { return (await env.BLOG_KV.get('articles:index','json'))||[]; }
async function saveIndex(env, idx) { await env.BLOG_KV.put('articles:index',JSON.stringify(idx)); }
function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9一-鿿]+/g,'-').replace(/^-|-$/g,'')||`post-${Date.now()}`; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function html(b) { return new Response(b,{headers:{'content-type':'text/html;charset=UTF-8'}}); }

async function handleHome(env, url) {
  const pg = parseInt(url.searchParams.get('page')||'1');
  const pp = parseInt(env.POSTS_PER_PAGE||'10');
  const idx = await getIndex(env);
  const pub = idx.filter(a=>a.published);
  const tp = Math.ceil(pub.length/pp)||1;
  const arts = pub.slice((pg-1)*pp, pg*pp);
  const title = env.BLOG_TITLE||'Chronicle';
  const desc = env.BLOG_DESC||'关于设计与技术的深度思考';

  let featured = '', list = '';
  for (let i=0; i<arts.length; i++) {
    const a = arts[i];
    const d = new Date(a.createdAt);
    const date = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
    if (i === 0 && pg === 1) {
      featured = `<article class="featured"><a href="/article/${a.slug}"><div class="featured-body"><span class="label">最新发布</span><h2>${esc(a.title)}</h2><time>${date}</time><span class="read-more">阅读全文 &rarr;</span></div></a></article>`;
    } else {
      list += `<article class="post-item"><a href="/article/${a.slug}"><time>${date}</time><h3>${esc(a.title)}</h3><span class="arrow">&rarr;</span></a></article>`;
    }
  }

  let pag = '';
  if (tp > 1) {
    pag = '<nav class="pag">';
    if (pg > 1) pag += `<a href="/?page=${pg-1}">&laquo; 上一页</a>`;
    pag += `<span>${pg} / ${tp}</span>`;
    if (pg < tp) pag += `<a href="/?page=${pg+1}">下一页 &raquo;</a>`;
    pag += '</nav>';
  }

  const content = `
    <section class="hero"><h1>${esc(title)}</h1><p>${esc(desc)}</p></section>
    ${featured}
    <section class="post-list">${list||'<p class="empty">暂无文章</p>'}</section>
    ${pag}`;
  return html(page(title, content, env));
}

async function handleArticle(env, slug) {
  const art = await env.BLOG_KV.get(`article:${slug}`,'json');
  if (!art||!art.published) return html(page('404','<div class="nf"><h1>404</h1><p>文章不存在</p><a href="/" class="btn-primary">返回</a></div>',env));
  const d = new Date(art.createdAt);
  const date = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
  const body = `
    <article class="article-view">
      <a href="/" class="back-link">&larr; 所有文章</a>
      <header><h1>${esc(art.title)}</h1><div class="meta"><time>${date}</time></div></header>
      <div class="article-content" id="md-out"></div>
    </article>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
    <script>document.getElementById('md-out').innerHTML=marked.parse(${JSON.stringify(art.content)});<\/script>`;
  return html(page(art.title, body, env));
}

function handleLoginPage(err='') {
  return html(page('登录',`
    <div class="login-page"><div class="login-card">
      <h2>管理员登录</h2><p class="login-sub">请输入凭据以继续</p>
      ${err?`<div class="alert">${err}</div>`:''}
      <form method="POST" action="/login">
        <div class="field"><label>用户名</label><input type="text" name="username" required autocomplete="username" placeholder="输入用户名"></div>
        <div class="field"><label>密码</label><input type="password" name="password" required autocomplete="current-password" placeholder="输入密码"></div>
        <button type="submit" class="btn-primary btn-full">登录</button>
      </form>
    </div></div>`,{}));
}

async function handleLogin(req, env) {
  const f = await req.formData();
  if (f.get('username')!==env.ADMIN_USER||f.get('password')!==env.ADMIN_PASS) return handleLoginPage('用户名或密码错误');
  const t = genToken();
  await env.BLOG_KV.put(`session:${t}`,JSON.stringify({expiresAt:Date.now()+86400000}),{expirationTtl:86400});
  return redir('/admin',{'Set-Cookie':`session=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`});
}
async function handleLogout(req, env) { const t=getCookie(req,'session'); if(t) await env.BLOG_KV.delete(`session:${t}`); return redir('/',{'Set-Cookie':'session=; Path=/; Max-Age=0'}); }

async function handleAdmin(req, env) {
  if (!(await isAuth(req,env))) return redir('/login');
  const idx = await getIndex(env);
  let rows = '';
  for (const a of idx) {
    const date = new Date(a.createdAt).toLocaleDateString('zh-CN');
    const st = a.published ? '<span class="badge badge-pub">已发布</span>' : '<span class="badge badge-draft">草稿</span>';
    rows += `<tr><td class="td-title"><strong>${esc(a.title)}</strong></td><td>${st}</td><td class="td-date">${date}</td><td class="td-acts"><a href="/admin/edit/${a.slug}" class="act-btn">编辑</a><form method="POST" action="/admin/delete/${a.slug}" style="display:inline" onsubmit="return confirm('确定删除此文章？')"><button class="act-btn act-del">删除</button></form></td></tr>`;
  }
  const body = `
    <div class="admin-layout"><aside class="admin-side">
      <div class="side-brand"><h3>${esc(env.BLOG_TITLE||'Chronicle')}</h3><span>管理后台</span></div>
      <nav class="side-nav"><a href="/admin" class="active">文章管理</a><a href="/" target="_blank">查看博客</a><a href="/logout">退出登录</a></nav>
    </aside><main class="admin-main">
      <div class="admin-header"><h2>内容库</h2><a href="/admin/new" class="btn-primary">写文章</a></div>
      <div class="admin-stats"><div class="stat"><b>${idx.length}</b><span>总计</span></div><div class="stat"><b>${idx.filter(a=>a.published).length}</b><span>已发布</span></div><div class="stat"><b>${idx.filter(a=>!a.published).length}</b><span>草稿</span></div></div>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>文章标题</th><th>状态</th><th>日期</th><th>操作</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="empty">暂无文章，开始写第一篇吧</td></tr>'}</tbody></table></div>
    </main></div>`;
  return html(page('管理后台', body, env, true));
}

async function handleAdminNew(req, env) { if(!(await isAuth(req,env))) return redir('/login'); return html(editorPage('','',true,'/admin/new',env)); }
async function handleAdminNewPost(req, env) {
  if(!(await isAuth(req,env))) return redir('/login');
  const f=await req.formData(); const title=f.get('title')||'无标题'; const content=f.get('content')||''; const published=f.get('published')==='on';
  const slug=slugify(title)+'-'+Date.now().toString(36); const now=new Date().toISOString();
  await env.BLOG_KV.put(`article:${slug}`,JSON.stringify({title,content,slug,createdAt:now,updatedAt:now,published}));
  const idx=await getIndex(env); idx.unshift({slug,title,createdAt:now,published}); await saveIndex(env,idx); return redir('/admin');
}
async function handleAdminEdit(req, env, slug) { if(!(await isAuth(req,env))) return redir('/login'); const a=await env.BLOG_KV.get(`article:${slug}`,'json'); if(!a) return redir('/admin'); return html(editorPage(a.title,a.content,a.published,`/admin/edit/${slug}`,env)); }
async function handleAdminEditPost(req, env, slug) {
  if(!(await isAuth(req,env))) return redir('/login'); const a=await env.BLOG_KV.get(`article:${slug}`,'json'); if(!a) return redir('/admin');
  const f=await req.formData(); a.title=f.get('title')||a.title; a.content=f.get('content')||''; a.published=f.get('published')==='on'; a.updatedAt=new Date().toISOString();
  await env.BLOG_KV.put(`article:${slug}`,JSON.stringify(a)); const idx=await getIndex(env); const i=idx.findIndex(x=>x.slug===slug);
  if(i>=0){idx[i].title=a.title;idx[i].published=a.published;} await saveIndex(env,idx); return redir('/admin');
}
async function handleAdminDelete(req, env, slug) { if(!(await isAuth(req,env))) return redir('/login'); await env.BLOG_KV.delete(`article:${slug}`); const idx=await getIndex(env); await saveIndex(env,idx.filter(a=>a.slug!==slug)); return redir('/admin'); }

function editorPage(title, content, published, action, env) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>编辑器</title>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${THEME_CSS}
.ed-wrap{display:flex;height:100vh;overflow:hidden}
.ed-side{width:240px;background:var(--surface-low);border-right:1px solid var(--outline-v);padding:1.5rem 1rem;display:flex;flex-direction:column}
.ed-side h3{font-family:var(--f-head);font-size:1.1rem;margin-bottom:.25rem}
.ed-side span{font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:var(--fg2)}
.ed-side nav{margin-top:2rem;display:flex;flex-direction:column;gap:.25rem}
.ed-side nav a{padding:.5rem .75rem;border-radius:6px;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--fg2);text-decoration:none}
.ed-side nav a:hover{background:var(--surface-high)}
.ed-side nav a.active{background:var(--secondary-c);color:var(--fg)}
.ed-body{flex:1;display:flex;flex-direction:column;min-width:0}
.ed-topbar{height:56px;border-bottom:1px solid var(--outline-v);display:flex;align-items:center;justify-content:space-between;padding:0 1.5rem;flex-shrink:0}
.ed-topbar .left{display:flex;align-items:center;gap:.75rem}
.ed-topbar .left a{font-size:.8rem;color:var(--fg2);text-decoration:none}
.ed-topbar .right{display:flex;align-items:center;gap:.75rem}
.ed-content{flex:1;display:grid;grid-template-columns:1fr 1fr;min-height:0}
@media(max-width:900px){.ed-side{display:none}.ed-content{grid-template-columns:1fr}}
.ed-pane{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.ed-pane:first-child{border-right:1px solid var(--outline-v)}
.ed-pane-head{padding:.4rem 1rem;background:var(--surface-low);border-bottom:1px solid var(--outline-v);font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--fg2)}
#editor{flex:1;width:100%;border:none;padding:1.5rem;background:var(--bg);color:var(--fg);font-family:var(--f-mono);font-size:.875rem;line-height:1.7;resize:none}
#editor:focus{outline:none}
#preview{flex:1;padding:1.5rem;overflow-y:auto}
.sw{display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--fg2)}
.sw input{display:none}
.sw-t{width:28px;height:15px;background:var(--outline-v);border-radius:8px;position:relative;transition:background .2s}
.sw-t::after{content:'';position:absolute;top:2.5px;left:2.5px;width:10px;height:10px;border-radius:50%;background:#fff;transition:transform .15s}
.sw input:checked+.sw-t{background:var(--accent)}
.sw input:checked+.sw-t::after{transform:translateX(13px)}
</style></head><body>
<form method="POST" action="${action}" class="ed-wrap">
  <aside class="ed-side"><h3>${esc(env.BLOG_TITLE||'Chronicle')}</h3><span>编辑器</span><nav><a href="/admin" class="active">文章管理</a><a href="/" target="_blank">查看博客</a><a href="/logout">退出</a></nav></aside>
  <div class="ed-body">
    <div class="ed-topbar"><div class="left"><a href="/admin">&larr; 返回列表</a><input type="text" name="title" value="${esc(title)}" required placeholder="文章标题..." style="border:none;background:none;font-family:var(--f-head);font-size:1.1rem;font-weight:600;color:var(--fg);width:300px;padding:.25rem 0"></div><div class="right"><label class="sw"><input type="checkbox" name="published" ${published?'checked':''}><span class="sw-t"></span>发布</label><button type="submit" class="btn-primary">保存</button></div></div>
    <div class="ed-content"><div class="ed-pane"><div class="ed-pane-head">Markdown</div><textarea name="content" id="editor" placeholder="开始写作...">${esc(content)}</textarea></div><div class="ed-pane"><div class="ed-pane-head">预览</div><div id="preview" class="article-content"></div></div></div>
  </div>
</form>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<script>const e=document.getElementById('editor'),p=document.getElementById('preview');function u(){p.innerHTML=marked.parse(e.value)}e.addEventListener('input',u);u();e.addEventListener('keydown',function(ev){if(ev.key==='Tab'){ev.preventDefault();const s=this.selectionStart;this.value=this.value.substring(0,s)+'  '+this.value.substring(this.selectionEnd);this.selectionStart=this.selectionEnd=s+2;u()}});<\/script>
</body></html>`;
}

const THEME_CSS = `
:root,[data-theme="editorial"]{
  --bg:#f1fbff;--surface-low:#eaf5fa;--surface-high:#dfeaef;--surface-c:#e4f0f4;
  --fg:#131d21;--fg2:#434749;--fg3:#747879;--outline-v:#c3c7c8;
  --accent:#181f21;--accent-hover:#2d3436;--secondary-c:#dfe0e0;
  --error:#ba1a1a;--success:#2d9d78;
  --f-head:'Newsreader',Georgia,serif;--f-body:'Manrope',system-ui,sans-serif;--f-mono:ui-monospace,'SF Mono',monospace;
}
[data-theme="dark"]{
  --bg:#1a1f25;--surface-low:#22282e;--surface-high:#2e353c;--surface-c:#283036;
  --fg:#e7f3f7;--fg2:#a9b4b8;--fg3:#6b7a80;--outline-v:#3a4248;
  --accent:#c1c8ca;--accent-hover:#dde4e6;--secondary-c:#3a4248;
  --error:#f87171;--success:#34d399;
}
[data-theme="warm"]{
  --bg:#faf6f1;--surface-low:#f0ebe3;--surface-high:#e6dfd6;--surface-c:#ede7de;
  --fg:#2c2416;--fg2:#6b5d4d;--fg3:#a89a8a;--outline-v:#ddd5ca;
  --accent:#5c3d1e;--accent-hover:#7a5230;--secondary-c:#e6dfd6;
  --error:#c0392b;--success:#27ae60;
}
[data-theme="nord"]{
  --bg:#2e3440;--surface-low:#3b4252;--surface-high:#434c5e;--surface-c:#3b4252;
  --fg:#eceff4;--fg2:#d8dee9;--fg3:#7b88a1;--outline-v:#4c566a;
  --accent:#88c0d0;--accent-hover:#8fbcbb;--secondary-c:#434c5e;
  --error:#bf616a;--success:#a3be8c;
}
[data-theme="rose"]{
  --bg:#fef7f7;--surface-low:#fce8e8;--surface-high:#f9d4d4;--surface-c:#fce8e8;
  --fg:#1a1a2e;--fg2:#6b4c5a;--fg3:#b08090;--outline-v:#f0c8c8;
  --accent:#be123c;--accent-hover:#9f1239;--secondary-c:#fce8e8;
  --error:#dc2626;--success:#059669;
}
[data-theme="ink"]{
  --bg:#fafafa;--surface-low:#f0f0f0;--surface-high:#e5e5e5;--surface-c:#f0f0f0;
  --fg:#171717;--fg2:#525252;--fg3:#a3a3a3;--outline-v:#d4d4d4;
  --accent:#171717;--accent-hover:#404040;--secondary-c:#e5e5e5;
  --error:#dc2626;--success:#16a34a;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--f-body);background:var(--bg);color:var(--fg);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{opacity:.8}
.btn-primary{display:inline-block;padding:.5rem 1.25rem;background:var(--accent);color:var(--bg);border:none;border-radius:2px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;font-family:var(--f-body);text-decoration:none}
.btn-primary:hover{background:var(--accent-hover);opacity:1}
.btn-full{width:100%;text-align:center;padding:.6rem}
`;

function page(title, content, env, fullWidth=false) {
  const blogTitle = (env&&env.BLOG_TITLE)||'Chronicle';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${THEME_CSS}
/* Layout */
.site-nav{border-bottom:1px solid var(--outline-v);background:var(--bg)}
.nav-in{max-width:${fullWidth?'100%':'1100px'};margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 1.5rem}
.nav-brand{font-family:var(--f-head);font-weight:600;font-size:1.1rem;color:var(--fg);text-decoration:none;letter-spacing:-.02em}
.nav-r{display:flex;align-items:center;gap:.15rem}
.nav-r a,.nav-r button{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--fg2);padding:.35rem .6rem;border-radius:2px;border:none;background:none;cursor:pointer;font-family:var(--f-body);text-decoration:none}
.nav-r a:hover,.nav-r button:hover{background:var(--surface-low);color:var(--fg);opacity:1}
.wrap{max-width:${fullWidth?'100%':'720px'};margin:0 auto;padding:${fullWidth?'0':'2rem 1.5rem 4rem'}}

/* Hero */
.hero{margin-bottom:2.5rem;padding-bottom:2rem;border-bottom:1px solid var(--outline-v)}
.hero h1{font-family:var(--f-head);font-size:2.5rem;font-weight:600;line-height:1.1;letter-spacing:-.02em;margin-bottom:.5rem}
.hero p{font-size:1rem;color:var(--fg2);font-style:italic}

/* Featured */
.featured{margin-bottom:2rem;border:1px solid var(--outline-v);transition:box-shadow .2s}
.featured:hover{box-shadow:0 8px 24px rgba(0,0,0,.06)}
.featured a{display:block;padding:2rem;text-decoration:none;color:var(--fg)}
.featured .label{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--fg3);margin-bottom:.5rem;display:block}
.featured h2{font-family:var(--f-head);font-size:1.6rem;font-weight:600;line-height:1.25;margin-bottom:.5rem}
.featured time{font-size:.8rem;color:var(--fg3);display:block;margin-bottom:.75rem}
.featured .read-more{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--accent)}

/* Post list */
.post-list{display:flex;flex-direction:column}
.post-item{border-bottom:1px solid var(--outline-v)}
.post-item a{display:flex;align-items:center;padding:.85rem 0;text-decoration:none;color:var(--fg);gap:1rem}
.post-item time{font-size:.75rem;color:var(--fg3);width:90px;flex-shrink:0;font-variant-numeric:tabular-nums}
.post-item h3{flex:1;font-family:var(--f-head);font-size:1.05rem;font-weight:500}
.post-item .arrow{color:var(--fg3);opacity:0;transition:opacity .15s,transform .15s}
.post-item:hover .arrow{opacity:1;transform:translateX(3px)}
.pag{display:flex;align-items:center;justify-content:center;gap:1rem;margin-top:1.5rem;font-size:.8rem}
.pag span{color:var(--fg3)}
.empty{color:var(--fg3);text-align:center;padding:2rem}

/* Article */
.article-view{max-width:720px;margin:0 auto}
.back-link{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--fg2);display:inline-block;margin-bottom:1.5rem}
.article-view header h1{font-family:var(--f-head);font-size:2rem;font-weight:600;line-height:1.2;letter-spacing:-.02em;margin-bottom:.5rem}
.article-view .meta{font-size:.8rem;color:var(--fg3);padding-bottom:1.5rem;margin-bottom:1.5rem;border-bottom:1px solid var(--outline-v)}
.article-content{font-size:1.05rem;line-height:1.85;color:var(--fg2)}
.article-content h1,.article-content h2,.article-content h3{font-family:var(--f-head);color:var(--fg);margin:1.5rem 0 .5rem;font-weight:600}
.article-content h1{font-size:1.5rem}.article-content h2{font-size:1.25rem}.article-content h3{font-size:1.1rem}
.article-content p{margin:.6rem 0}
.article-content a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}
.article-content ul,.article-content ol{margin:.6rem 0;padding-left:1.5rem}
.article-content li{margin:.2rem 0}
.article-content pre{background:var(--surface-low);border:1px solid var(--outline-v);padding:.8rem 1rem;border-radius:4px;overflow-x:auto;margin:.8rem 0;font-family:var(--f-mono);font-size:.82rem;line-height:1.6}
.article-content code{font-family:var(--f-mono);background:var(--surface-low);padding:.1rem .3rem;border-radius:2px;font-size:.82em}
.article-content pre code{background:none;padding:0}
.article-content blockquote{border-left:3px solid var(--accent);padding:.5rem 1rem;margin:.8rem 0;color:var(--fg2);font-style:italic;font-family:var(--f-head);font-size:1.1rem}
.article-content img{max-width:100%;border-radius:4px}
.article-content table{width:100%;border-collapse:collapse;margin:.8rem 0;font-size:.9rem}
.article-content th,.article-content td{padding:.4rem .6rem;border:1px solid var(--outline-v);text-align:left}
.article-content th{background:var(--surface-low);font-weight:600}
.article-content hr{border:none;border-top:1px solid var(--outline-v);margin:1.5rem 0}

/* Login */
.login-page{display:flex;justify-content:center;align-items:center;min-height:60vh}
.login-card{width:100%;max-width:340px;border:1px solid var(--outline-v);padding:2rem}
.login-card h2{font-family:var(--f-head);font-size:1.3rem;margin-bottom:.25rem}
.login-sub{font-size:.85rem;color:var(--fg3);margin-bottom:1.5rem}
.field{margin-bottom:1rem}
.field label{display:block;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--fg2);margin-bottom:.3rem}
.field input{width:100%;padding:.5rem .7rem;border:1px solid var(--outline-v);background:var(--bg);color:var(--fg);font-size:.9rem;font-family:var(--f-body);border-radius:2px}
.field input:focus{outline:none;border-color:var(--accent)}
.alert{font-size:.8rem;color:var(--error);margin-bottom:1rem;padding:.4rem .6rem;background:var(--surface-low);border-left:3px solid var(--error)}

/* Admin */
.admin-layout{display:flex;min-height:calc(100vh - 57px)}
.admin-side{width:220px;background:var(--surface-low);border-right:1px solid var(--outline-v);padding:1.5rem 1rem;flex-shrink:0}
.side-brand h3{font-family:var(--f-head);font-size:1rem;margin-bottom:.15rem}
.side-brand span{font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:var(--fg3)}
.side-nav{margin-top:1.5rem;display:flex;flex-direction:column;gap:.2rem}
.side-nav a{padding:.5rem .7rem;border-radius:4px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--fg2);text-decoration:none}
.side-nav a:hover{background:var(--surface-high)}
.side-nav a.active{background:var(--secondary-c);color:var(--fg)}
.admin-main{flex:1;padding:1.5rem;overflow-y:auto}
.admin-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem}
.admin-header h2{font-family:var(--f-head);font-size:1.3rem}
.admin-stats{display:flex;gap:1rem;margin-bottom:1.25rem}
.stat{background:var(--surface-low);border:1px solid var(--outline-v);padding:.75rem 1.25rem;border-radius:4px;text-align:center}
.stat b{display:block;font-size:1.3rem;color:var(--fg)}
.stat span{font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:var(--fg3)}
.admin-table-wrap{border:1px solid var(--outline-v);border-radius:4px;overflow:hidden}
.admin-table{width:100%;border-collapse:collapse}
.admin-table th{background:var(--surface-low);font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--fg3);padding:.6rem .8rem;text-align:left;border-bottom:1px solid var(--outline-v)}
.admin-table td{padding:.7rem .8rem;border-bottom:1px solid var(--outline-v);font-size:.85rem}
.admin-table tr:last-child td{border-bottom:none}
.admin-table tr:hover{background:var(--surface-low)}
.td-title{font-family:var(--f-head)}
.td-date{color:var(--fg3);font-size:.8rem}
.td-acts{display:flex;gap:.3rem}
.act-btn{font-size:.7rem;padding:.25rem .5rem;border:1px solid var(--outline-v);border-radius:2px;background:none;color:var(--fg2);cursor:pointer;font-family:var(--f-body);text-decoration:none;font-weight:600}
.act-btn:hover{border-color:var(--accent);color:var(--accent);opacity:1}
.act-del:hover{border-color:var(--error);color:var(--error)}
.badge{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:.2rem .5rem;border-radius:10px}
.badge-pub{background:var(--surface-low);color:var(--success)}
.badge-draft{background:var(--surface-low);color:var(--fg3)}

/* Theme panel */
.tp{display:none;position:fixed;top:56px;right:0;width:180px;background:var(--bg);border:1px solid var(--outline-v);padding:.75rem;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.08)}
.tp.open{display:block}
.tp h4{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--fg3);margin-bottom:.5rem}
.tp button{display:block;width:100%;text-align:left;padding:.4rem .5rem;border:none;background:none;border-radius:2px;cursor:pointer;font-size:.8rem;color:var(--fg);font-family:var(--f-body)}
.tp button:hover{background:var(--surface-low)}
.tp button.on{background:var(--secondary-c);font-weight:600}

/* 404 */
.nf{text-align:center;padding:4rem 0}
.nf h1{font-family:var(--f-head);font-size:3rem;color:var(--fg3);opacity:.3}
.nf p{color:var(--fg2);margin:.5rem 0 1.5rem}

.foot{text-align:center;padding:1.5rem;color:var(--fg3);font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;border-top:1px solid var(--outline-v);margin-top:2rem}

@media(max-width:768px){
  .hero h1{font-size:1.8rem}
  .admin-layout{flex-direction:column}
  .admin-side{width:100%;border-right:none;border-bottom:1px solid var(--outline-v);padding:.75rem 1rem}
  .side-nav{flex-direction:row;gap:.5rem;margin-top:.75rem}
  .post-item a{flex-wrap:wrap}
  .post-item time{width:auto}
}
</style></head><body>
<nav class="site-nav"><div class="nav-in">
  <a href="/" class="nav-brand">${esc(blogTitle)}</a>
  <div class="nav-r"><a href="/">随笔</a><button onclick="document.getElementById('tp').classList.toggle('open')">主题</button></div>
</div></nav>
<div class="wrap">${content}</div>
<footer class="foot">&copy; ${new Date().getFullYear()} ${esc(blogTitle)}. 读者至上.</footer>
<div class="tp" id="tp"><h4>选择主题</h4>
<button data-t="editorial">编辑风</button><button data-t="dark">暗夜</button><button data-t="warm">暖色</button><button data-t="nord">Nord</button><button data-t="rose">玫瑰</button><button data-t="ink">水墨</button>
</div>
<script>
function setT(t){document.documentElement.setAttribute('data-theme',t);localStorage.setItem('theme',t);document.querySelectorAll('.tp button').forEach(b=>b.classList.toggle('on',b.dataset.t===t))}
document.querySelectorAll('.tp button').forEach(b=>b.addEventListener('click',()=>{setT(b.dataset.t);document.getElementById('tp').classList.remove('open')}));
(()=>{const t=localStorage.getItem('theme')||'editorial';setT(t)})();
document.addEventListener('click',e=>{const tp=document.getElementById('tp');if(tp&&tp.classList.contains('open')&&!tp.contains(e.target)&&!e.target.closest('.nav-r button'))tp.classList.remove('open')});
</script></body></html>`;
}