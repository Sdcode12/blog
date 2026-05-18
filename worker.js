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
      'GET:/search': () => handleSearch(env, url),
      'GET:/login': () => handleLoginPage(),
      'POST:/login': () => handleLogin(request, env),
      'GET:/logout': () => handleLogout(request, env),
      'GET:/admin': () => handleAdmin(request, env),
      'GET:/admin/new': () => handleAdminNew(request, env),
      'POST:/admin/new': () => handleAdminNewPost(request, env),
    };

    const handler = routes[`${method}:${path}`];
    if (handler) return handler();
    return html(frontPage('404', `<div class="flex flex-col items-center justify-center py-section-padding"><h1 class="font-display text-display text-on-surface-variant opacity-30">404</h1><p class="font-body-lg text-body-lg text-on-surface-variant mt-4">页面不存在</p><a href="/" class="mt-8 bg-primary text-on-primary px-8 py-3 font-label-caps uppercase tracking-widest hover:opacity-90 transition-opacity">返回首页</a></div>`, env));
  }
};

function getCookie(req, name) { const c=req.headers.get('Cookie')||''; const m=c.match(new RegExp(`${name}=([^;]+)`)); return m?m[1]:null; }
async function isAuth(req, env) { const t=getCookie(req,'session'); if(!t) return false; const s=await env.BLOG_KV.get(`session:${t}`,'json'); return s&&Date.now()<s.expiresAt; }
function genToken() { const a=new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a,b=>b.toString(16).padStart(2,'0')).join(''); }
function redir(p,h={}) { const headers = new Headers({Location:p}); Object.entries(h).forEach(([k,v])=>headers.set(k,v)); return new Response(null,{status:302,headers}); }
async function getIndex(env) { return (await env.BLOG_KV.get('articles:index','json'))||[]; }
async function saveIndex(env,idx) { await env.BLOG_KV.put('articles:index',JSON.stringify(idx)); }
function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9一-鿿]+/g,'-').replace(/^-|-$/g,'')||`post-${Date.now()}`; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function html(b) { return new Response(b,{headers:{'content-type':'text/html;charset=UTF-8'}}); }

const TW_CONFIG = `tailwind.config={darkMode:"class",theme:{extend:{colors:{"primary-fixed-dim":"#c1c8ca","on-primary-fixed-variant":"#41484a","surface-tint":"#586062","on-background":"#131d21","surface":"#f1fbff","background":"#f1fbff","surface-bright":"#f1fbff","on-secondary":"#ffffff","primary-container":"#2d3436","outline-variant":"#c3c7c8","surface-container-lowest":"#ffffff","on-tertiary":"#ffffff","tertiary-container":"#3c302b","on-primary":"#ffffff","on-primary-container":"#959c9f","secondary":"#5d5f5f","error":"#ba1a1a","on-surface":"#131d21","secondary-fixed":"#e2e2e2","inverse-surface":"#283236","secondary-container":"#dfe0e0","inverse-on-surface":"#e7f3f7","on-primary-fixed":"#161d1f","primary-fixed":"#dde4e6","on-surface-variant":"#434749","on-secondary-container":"#616363","surface-container":"#e4f0f4","primary":"#181f21","error-container":"#ffdad6","tertiary":"#261b17","on-tertiary-container":"#a99790","tertiary-fixed":"#f3ded7","surface-container-highest":"#d9e4e9","tertiary-fixed-dim":"#d6c3bb","surface-variant":"#d9e4e9","surface-container-high":"#dfeaef","inverse-primary":"#c1c8ca","on-error":"#ffffff","secondary-fixed-dim":"#c6c6c7","surface-dim":"#d1dce0","surface-container-low":"#eaf5fa","outline":"#747879"},borderRadius:{DEFAULT:"0.125rem",lg:"0.25rem",xl:"0.5rem",full:"0.75rem"},spacing:{"section-padding":"80px","stack-lg":"32px",gutter:"24px","stack-sm":"8px","container-max-width":"720px","stack-md":"16px",unit:"8px"},fontFamily:{"headline-md":["Newsreader"],"headline-lg-mobile":["Newsreader"],"body-md":["Manrope"],display:["Newsreader"],"body-lg":["Manrope"],caption:["Manrope"],"headline-lg":["Newsreader"],"label-caps":["Manrope"]},fontSize:{"headline-md":["24px",{lineHeight:"1.3",fontWeight:"500"}],"headline-lg-mobile":["28px",{lineHeight:"1.2",fontWeight:"600"}],"body-md":["16px",{lineHeight:"1.6",fontWeight:"400"}],display:["48px",{lineHeight:"1.1",letterSpacing:"-0.02em",fontWeight:"600"}],"body-lg":["18px",{lineHeight:"1.8",fontWeight:"400"}],caption:["14px",{lineHeight:"1.4",fontWeight:"400"}],"headline-lg":["32px",{lineHeight:"1.2",fontWeight:"600"}],"label-caps":["12px",{lineHeight:"1.0",letterSpacing:"0.1em",fontWeight:"700"}]}}}}`;

const HEAD_COMMON = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"><\/script>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=Manrope:wght@200..800&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
<style>.material-symbols-outlined{font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;display:inline-block;line-height:1;vertical-align:middle}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#c3c7c8;border-radius:10px}::-webkit-scrollbar-thumb:hover{background:#747879}</style>
<script>${TW_CONFIG}<\/script>`;

// --- Front page layout (homepage, article, login) ---
function frontPage(title, content, env) {
  const blogTitle = (env&&env.BLOG_TITLE)||'Chronicle';
  const blogDesc = (env&&env.BLOG_DESC)||'';
  return `<!DOCTYPE html><html lang="zh-CN"><head>${HEAD_COMMON}<title>${esc(title)}</title></head>
<body class="bg-background text-on-background font-body-md selection:bg-primary-fixed-dim selection:text-primary antialiased">
<header class="bg-background border-b border-outline-variant sticky top-0 z-50">
<div class="flex justify-between items-center max-w-[1200px] mx-auto px-gutter h-20">
<div class="flex items-center gap-12"><a class="font-display text-headline-md text-primary tracking-tighter" href="/">${esc(blogTitle)}</a>
<nav class="hidden md:flex items-center gap-8"><a class="font-label-caps text-label-caps text-primary border-b-2 border-primary" href="/">随笔</a><a class="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors" href="/login">管理</a></nav></div>
<div class="flex items-center gap-stack-md">
<form action="/search" method="GET" class="relative hidden sm:block"><span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span><input name="q" class="bg-surface-container-low border-none rounded-full pl-10 pr-4 py-2 text-body-md w-48 focus:w-64 focus:ring-1 focus:ring-primary transition-all" placeholder="搜索文章..."></form>
</div>
</div></header>
${content}
<footer class="bg-background border-t border-outline-variant mt-section-padding">
<div class="flex flex-col md:flex-row justify-between items-center max-w-[720px] mx-auto py-stack-lg px-gutter">
<div class="mb-stack-md md:mb-0 text-center md:text-left"><p class="font-display text-headline-md text-primary mb-1">${esc(blogTitle)}</p><p class="font-body-md text-body-md text-secondary">&copy; ${new Date().getFullYear()} ${esc(blogTitle)}</p></div>
<div class="flex gap-stack-lg"><a class="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors" href="/">存档</a><a class="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors" href="/login">管理</a></div>
</div></footer></body></html>`;
}

// --- Admin page layout (sidebar + main) ---
function adminPage(title, content, env) {
  const blogTitle = (env&&env.BLOG_TITLE)||'Chronicle';
  return `<!DOCTYPE html><html lang="zh-CN"><head>${HEAD_COMMON}<title>${esc(title)}</title></head>
<body class="bg-background text-on-background font-body-md antialiased">
<div class="flex h-screen overflow-hidden">
<aside class="hidden md:flex flex-col h-full py-stack-lg px-stack-md w-64 bg-surface-container-low border-r border-outline-variant">
<div class="mb-10 px-4"><h1 class="font-display text-headline-md text-primary tracking-tighter">${esc(blogTitle)}</h1><p class="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">管理后台</p></div>
<nav class="flex-1 space-y-2">
<a class="flex items-center gap-3 px-4 py-3 bg-secondary-container text-on-secondary-container rounded-full scale-95 transition-all" href="/admin"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1">description</span><span class="font-label-caps text-label-caps">文章管理</span></a>
<a class="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-container-high transition-all rounded-full" href="/" target="_blank"><span class="material-symbols-outlined">visibility</span><span class="font-label-caps text-label-caps">查看博客</span></a>
</nav>
<div class="mt-auto border-t border-outline-variant pt-stack-md space-y-2">
<a class="flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:text-error transition-colors rounded-full" href="/logout"><span class="material-symbols-outlined text-[18px]">logout</span><span class="font-label-caps text-label-caps">退出登录</span></a>
</div></aside>
<main class="flex-grow flex flex-col h-full overflow-hidden">${content}</main>
</div></body></html>`;
}

async function handleHome(env, url) {
  const pg = parseInt(url.searchParams.get('page')||'1');
  const pp = parseInt(env.POSTS_PER_PAGE||'10');
  const idx = await getIndex(env);
  const pub = idx.filter(a=>a.published);
  const tp = Math.ceil(pub.length/pp)||1;
  const arts = pub.slice((pg-1)*pp, pg*pp);
  const blogTitle = env.BLOG_TITLE||'Chronicle';

  let featured = '';
  let gridItems = '';
  for (let i=0; i<arts.length; i++) {
    const a = arts[i];
    const d = new Date(a.createdAt);
    const date = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
    if (i === 0 && pg === 1) {
      featured = `<article class="group"><a href="/article/${a.slug}" class="block"><div class="flex items-center gap-stack-md mb-stack-sm"><span class="font-label-caps text-label-caps text-primary bg-surface-container-high px-2 py-1">最新</span><span class="text-caption text-secondary">${date}</span></div><h2 class="font-headline-lg text-headline-lg mb-stack-sm group-hover:text-secondary transition-colors">${esc(a.title)}</h2><p class="text-body-lg text-on-surface-variant">点击阅读全文</p></a></article><hr class="border-outline-variant my-12">`;
    } else {
      gridItems += `<article class="flex flex-col"><a href="/article/${a.slug}" class="block group"><div class="flex items-center gap-stack-sm mb-stack-sm"><span class="font-label-caps text-label-caps text-secondary">${date}</span></div><h3 class="font-headline-md text-headline-md mb-stack-sm group-hover:text-secondary transition-colors">${esc(a.title)}</h3><p class="text-body-md text-on-surface-variant">阅读文章 &rarr;</p></a></article>`;
    }
  }

  let pag = '';
  if (tp > 1) {
    pag = '<div class="mt-stack-lg flex items-center justify-between"><div class="flex items-center gap-2">';
    if (pg > 1) pag += `<a href="/?page=${pg-1}" class="w-10 h-10 flex items-center justify-center border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors"><span class="material-symbols-outlined">chevron_left</span></a>`;
    pag += `<span class="font-label-caps text-label-caps text-on-surface-variant px-4">${pg} / ${tp}</span>`;
    if (pg < tp) pag += `<a href="/?page=${pg+1}" class="w-10 h-10 flex items-center justify-center border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors"><span class="material-symbols-outlined">chevron_right</span></a>`;
    pag += '</div></div>';
  }

  const empty = arts.length === 0 ? '<p class="font-body-lg text-on-surface-variant py-12 text-center">暂无文章</p>' : '';

  const content = `<main class="max-w-[1200px] mx-auto px-gutter py-12">
    <div class="space-y-12">${empty}${featured}${gridItems ? `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-stack-lg">${gridItems}</div>` : ''}</div>${pag}</main>`;
  return html(frontPage(blogTitle, content, env));
}

async function handleArticle(env, slug) {
  const art = await env.BLOG_KV.get(`article:${slug}`,'json');
  if (!art||!art.published) return html(frontPage('404','<div class="flex flex-col items-center py-section-padding"><h1 class="font-display text-display text-on-surface-variant opacity-30">404</h1><p class="mt-4 text-body-lg text-on-surface-variant">文章不存在</p><a href="/" class="mt-8 bg-primary text-on-primary px-8 py-3 font-label-caps uppercase tracking-widest">返回</a></div>',env));
  const d = new Date(art.createdAt);
  const date = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
  const body = `<main class="min-h-screen pt-section-padding pb-section-padding"><article class="max-w-[720px] mx-auto px-gutter">
    <header class="mb-stack-lg">
      <div class="flex items-center gap-stack-sm mb-stack-md"><span class="font-label-caps text-label-caps text-on-surface-variant">${date}</span></div>
      <h1 class="font-display text-display text-on-surface mb-stack-md leading-tight">${esc(art.title)}</h1>
    </header>
    <div class="space-y-stack-lg text-on-surface font-body-lg text-body-lg" id="md-out"></div>
    <section class="mt-section-padding pt-stack-lg border-t border-outline-variant"><a href="/" class="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors">&larr; 返回所有文章</a></section>
  </article></main>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <script>document.getElementById('md-out').innerHTML=marked.parse(${JSON.stringify(art.content)});<\/script>`;
  return html(frontPage(art.title, body, env));
}

function handleLoginPage(err='') {
  const body = `<main class="min-h-screen flex items-center justify-center py-section-padding"><div class="w-full max-w-[380px] px-gutter">
    <div class="bg-surface-container-lowest border border-outline-variant p-stack-lg">
      <h2 class="font-headline-md text-headline-md text-primary mb-stack-sm">管理员登录</h2>
      <p class="font-caption text-caption text-on-surface-variant mb-stack-lg">请输入凭据以继续</p>
      ${err?`<div class="bg-error-container text-on-error-container font-caption text-caption p-3 mb-stack-md rounded">${err}</div>`:''}
      <form method="POST" action="/login" class="space-y-stack-md">
        <div><label class="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest block mb-1">用户名</label><input type="text" name="username" required autocomplete="username" placeholder="输入用户名" class="w-full border border-outline-variant bg-transparent px-3 py-2 font-body-md text-body-md focus:border-primary focus:ring-0 transition-colors"></div>
        <div><label class="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest block mb-1">密码</label><input type="password" name="password" required autocomplete="current-password" placeholder="输入密码" class="w-full border border-outline-variant bg-transparent px-3 py-2 font-body-md text-body-md focus:border-primary focus:ring-0 transition-colors"></div>
        <button type="submit" class="w-full bg-primary text-on-primary py-3 font-label-caps uppercase tracking-widest hover:opacity-90 transition-opacity">登录</button>
      </form>
    </div>
  </div></main>`;
  return html(frontPage('登录', body, {}));
}

async function handleLogin(req, env) {
  const f=await req.formData();
  const username = (f.get('username')||'').trim();
  const password = (f.get('password')||'').trim();
  if(!env.ADMIN_USER||!env.ADMIN_PASS) return handleLoginPage('未配置管理员账号，请设置环境变量 ADMIN_USER 和 ADMIN_PASS');
  if(username!==env.ADMIN_USER||password!==env.ADMIN_PASS) return handleLoginPage('用户名或密码错误');
  const t=genToken();
  await env.BLOG_KV.put(`session:${t}`,JSON.stringify({expiresAt:Date.now()+86400000}),{expirationTtl:86400});
  return redir('/admin',{'Set-Cookie':`session=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`});
}
async function handleLogout(req,env) { const t=getCookie(req,'session'); if(t) await env.BLOG_KV.delete(`session:${t}`); return redir('/',{'Set-Cookie':'session=; Path=/; Max-Age=0'}); }

async function handleSearch(env, url) {
  const q = (url.searchParams.get('q')||'').trim().toLowerCase();
  const idx = await getIndex(env);
  let results = [];
  if (q) {
    for (const a of idx.filter(x=>x.published)) {
      if (a.title.toLowerCase().includes(q)) { results.push(a); continue; }
      const art = await env.BLOG_KV.get(`article:${a.slug}`,'json');
      if (art && art.content.toLowerCase().includes(q)) results.push(a);
    }
  }
  let list = '';
  for (const a of results) {
    const d = new Date(a.createdAt);
    const date = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
    list += `<article class="border-b border-outline-variant py-6"><a href="/article/${a.slug}" class="block group"><div class="flex items-center gap-stack-sm mb-stack-sm"><span class="font-label-caps text-label-caps text-secondary">${date}</span></div><h3 class="font-headline-md text-headline-md mb-stack-sm group-hover:text-secondary transition-colors">${esc(a.title)}</h3></a></article>`;
  }
  const content = `<main class="max-w-[720px] mx-auto px-gutter py-12">
    <form action="/search" method="GET" class="mb-8"><div class="relative"><span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span><input name="q" value="${esc(q)}" class="w-full bg-surface-container-low border border-outline-variant pl-12 pr-4 py-3 text-body-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all" placeholder="搜索文章..." autofocus></div></form>
    ${q ? `<p class="font-label-caps text-label-caps text-on-surface-variant mb-6 uppercase tracking-widest">搜索 "${esc(q)}" 找到 ${results.length} 篇文章</p>` : ''}
    <div>${list||(!q?'<p class="text-on-surface-variant py-8 text-center">输入关键词搜索文章</p>':'<p class="text-on-surface-variant py-8 text-center">未找到相关文章</p>')}</div>
  </main>`;
  return html(frontPage('搜索', content, env));
}

async function handleAdmin(req, env) {
  if(!(await isAuth(req,env))) return redir('/login');
  const idx = await getIndex(env);
  let rows = '';
  for (const a of idx) {
    const date = new Date(a.createdAt).toLocaleDateString('zh-CN');
    const st = a.published
      ? '<span class="inline-flex items-center px-2.5 py-0.5 font-label-caps text-[10px] bg-secondary-container text-on-secondary-container rounded-full">已发布</span>'
      : '<span class="inline-flex items-center px-2.5 py-0.5 font-label-caps text-[10px] bg-outline-variant text-on-surface-variant rounded-full">草稿</span>';
    rows += `<tr class="hover:bg-surface-container transition-colors group"><td class="py-6 px-6"><div class="flex flex-col"><span class="font-headline-md text-[18px] text-primary">${esc(a.title)}</span></div></td><td class="py-6 px-6">${st}</td><td class="py-6 px-6 font-body-md text-caption text-on-surface-variant">${date}</td><td class="py-6 px-6 text-right"><div class="flex justify-end gap-2"><a href="/admin/edit/${a.slug}" class="p-2 text-on-surface-variant hover:text-primary transition-colors" title="编辑"><span class="material-symbols-outlined text-[20px]">edit</span></a><form method="POST" action="/admin/delete/${a.slug}" style="display:inline" onsubmit="return confirm('确定删除此文章？')"><button class="p-2 text-on-surface-variant hover:text-error transition-colors" title="删除"><span class="material-symbols-outlined text-[20px]">delete</span></button></form></div></td></tr>`;
  }

  const content = `
    <header class="h-20 bg-background border-b border-outline-variant flex items-center justify-between px-gutter shrink-0">
      <h2 class="font-headline-md text-headline-md text-primary">内容库</h2>
      <a href="/admin/new" class="bg-primary text-on-primary font-label-caps text-label-caps px-6 py-3 hover:opacity-90 transition-opacity flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">add</span>写文章</a>
    </header>
    <section class="flex-grow overflow-y-auto p-gutter lg:p-12">
      <div class="max-w-[1200px] mx-auto">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
          <div class="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl"><p class="font-label-caps text-on-surface-variant">总文章</p><h3 class="font-headline-lg text-primary mt-1">${idx.length}</h3></div>
          <div class="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl"><p class="font-label-caps text-on-surface-variant">已发布</p><h3 class="font-headline-lg text-primary mt-1">${idx.filter(a=>a.published).length}</h3></div>
          <div class="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl"><p class="font-label-caps text-on-surface-variant">草稿</p><h3 class="font-headline-lg text-primary mt-1">${idx.filter(a=>!a.published).length}</h3></div>
        </div>
        <div class="bg-surface-container-lowest border border-outline-variant overflow-hidden">
          <table class="w-full text-left border-collapse">
            <thead><tr class="border-b border-outline-variant bg-surface-container-low/50"><th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant">文章标题</th><th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant">状态</th><th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant">日期</th><th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant text-right">操作</th></tr></thead>
            <tbody class="divide-y divide-outline-variant">${rows||'<tr><td colspan="4" class="py-12 text-center font-body-lg text-on-surface-variant">暂无文章，点击右上角开始写作</td></tr>'}</tbody>
          </table>
        </div>
        <div class="mt-stack-lg"><p class="font-label-caps text-label-caps text-on-surface-variant uppercase">共 ${idx.length} 篇文章</p></div>
      </div>
    </section>`;
  return html(adminPage('管理后台', content, env));
}

async function handleAdminNew(req,env) { if(!(await isAuth(req,env))) return redir('/login'); return html(editorPage('','',true,'/admin/new',env)); }
async function handleAdminNewPost(req,env) {
  if(!(await isAuth(req,env))) return redir('/login');
  const f=await req.formData(); const title=f.get('title')||'无标题'; const content=f.get('content')||''; const published=f.get('published')==='on';
  const slug=slugify(title)+'-'+Date.now().toString(36); const now=new Date().toISOString();
  await env.BLOG_KV.put(`article:${slug}`,JSON.stringify({title,content,slug,createdAt:now,updatedAt:now,published}));
  const idx=await getIndex(env); idx.unshift({slug,title,createdAt:now,published}); await saveIndex(env,idx); return redir('/admin');
}
async function handleAdminEdit(req,env,slug) { if(!(await isAuth(req,env))) return redir('/login'); const a=await env.BLOG_KV.get(`article:${slug}`,'json'); if(!a) return redir('/admin'); return html(editorPage(a.title,a.content,a.published,`/admin/edit/${slug}`,env)); }
async function handleAdminEditPost(req,env,slug) {
  if(!(await isAuth(req,env))) return redir('/login'); const a=await env.BLOG_KV.get(`article:${slug}`,'json'); if(!a) return redir('/admin');
  const f=await req.formData(); a.title=f.get('title')||a.title; a.content=f.get('content')||''; a.published=f.get('published')==='on'; a.updatedAt=new Date().toISOString();
  await env.BLOG_KV.put(`article:${slug}`,JSON.stringify(a)); const idx=await getIndex(env); const i=idx.findIndex(x=>x.slug===slug);
  if(i>=0){idx[i].title=a.title;idx[i].published=a.published;} await saveIndex(env,idx); return redir('/admin');
}
async function handleAdminDelete(req,env,slug) { if(!(await isAuth(req,env))) return redir('/login'); await env.BLOG_KV.delete(`article:${slug}`); const idx=await getIndex(env); await saveIndex(env,idx.filter(a=>a.slug!==slug)); return redir('/admin'); }

function editorPage(title, content, published, action, env) {
  const blogTitle = (env&&env.BLOG_TITLE)||'Chronicle';
  return `<!DOCTYPE html><html lang="zh-CN"><head>${HEAD_COMMON}<title>编辑器</title>
<style>.editor-container::-webkit-scrollbar{width:4px}.editor-container::-webkit-scrollbar-track{background:transparent}.editor-container::-webkit-scrollbar-thumb{background:#c3c7c8;border-radius:2px}</style></head>
<body class="bg-background text-on-background font-body-md antialiased">
<div class="flex h-screen overflow-hidden">
<aside class="hidden md:flex flex-col h-full py-stack-lg px-stack-md bg-surface-container-low border-r border-outline-variant w-64 shrink-0">
<div class="mb-10 px-4"><h1 class="font-display text-headline-md text-primary tracking-tighter">${esc(blogTitle)}</h1><p class="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">编辑器</p></div>
<nav class="flex-1 space-y-2">
<a class="flex items-center gap-3 px-4 py-3 bg-secondary-container text-on-secondary-container rounded-full scale-95 transition-all" href="/admin"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1">description</span><span class="font-label-caps text-label-caps">文章</span></a>
<a class="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-container-high transition-all rounded-full" href="/" target="_blank"><span class="material-symbols-outlined">visibility</span><span class="font-label-caps text-label-caps">查看博客</span></a>
</nav>
<div class="pt-stack-lg border-t border-outline-variant mt-stack-lg space-y-2">
<a class="flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:text-error transition-colors rounded-full" href="/logout"><span class="material-symbols-outlined">logout</span><span class="font-label-caps text-label-caps">退出</span></a>
</div></aside>
<div class="flex-1 flex flex-col min-w-0 overflow-hidden">
<form method="POST" action="${action}" class="flex flex-col h-full">
<header class="h-20 bg-background border-b border-outline-variant flex items-center justify-between px-gutter shrink-0">
<div class="flex items-center gap-4"><a href="/admin" class="text-on-surface-variant hover:text-primary transition-colors"><span class="material-symbols-outlined">arrow_back</span></a><input type="text" name="title" value="${esc(title)}" required placeholder="请输入文章标题..." class="bg-transparent border-none focus:ring-0 p-0 font-headline-md text-headline-md text-primary placeholder:text-outline-variant w-full max-w-lg"></div>
<div class="flex items-center gap-stack-md">
<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="published" ${published?'checked':''} class="sr-only peer"><div class="w-10 h-5 bg-outline-variant rounded-full peer-checked:bg-primary relative transition-colors"><div class="absolute top-1 left-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-transform"></div></div><span class="font-label-caps text-label-caps text-on-surface-variant">发布</span></label>
<button type="submit" class="px-6 py-2 bg-primary text-on-primary font-label-caps text-label-caps hover:opacity-90 transition-all">保存</button>
</div></header>
<div class="flex-1 flex min-h-0">
<div class="flex-1 flex flex-col min-w-0 border-r border-outline-variant">
<div class="px-gutter py-2 bg-surface-container-low/50 border-b border-outline-variant"><span class="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">Markdown</span></div>
<textarea name="content" id="editor" placeholder="在此开始您的创作..." class="flex-1 w-full bg-transparent border-none focus:ring-0 p-gutter font-body-lg text-body-lg text-on-surface-variant leading-relaxed resize-none editor-container">${esc(content)}</textarea>
</div>
<div class="flex-1 flex flex-col min-w-0 hidden lg:flex">
<div class="px-gutter py-2 bg-surface-container-low/50 border-b border-outline-variant"><span class="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">预览</span></div>
<div id="preview" class="flex-1 p-gutter overflow-y-auto editor-container font-body-lg text-body-lg text-on-surface space-y-4"></div>
</div>
</div></form></div></div>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<script>const e=document.getElementById('editor'),p=document.getElementById('preview');function u(){if(p)p.innerHTML=marked.parse(e.value)}e.addEventListener('input',u);u();e.addEventListener('keydown',function(ev){if(ev.key==='Tab'){ev.preventDefault();const s=this.selectionStart;this.value=this.value.substring(0,s)+'  '+this.value.substring(this.selectionEnd);this.selectionStart=this.selectionEnd=s+2;u()}});
document.querySelector('label[class*=cursor-pointer]').addEventListener('click',function(){const cb=this.querySelector('input');const dot=this.querySelector('div>div');setTimeout(()=>{dot.style.transform=cb.checked?'translateX(20px)':'translateX(0)'},0)});
<\/script></body></html>`;
}