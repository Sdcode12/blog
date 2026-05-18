export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const router = [
      ['GET', '/', () => handleHome(env, url)],
      ['GET', '/article/', (slug) => handleArticle(env, slug)],
      ['GET', '/login', () => handleLoginPage()],
      ['POST', '/login', () => handleLogin(request, env)],
      ['GET', '/logout', () => handleLogout(request, env)],
      ['GET', '/admin', () => handleAdmin(request, env)],
      ['GET', '/admin/new', () => handleAdminNew(request, env)],
      ['POST', '/admin/new', () => handleAdminNewPost(request, env)],
      ['GET', '/admin/edit/', (slug) => handleAdminEdit(request, env, slug)],
      ['POST', '/admin/edit/', (slug) => handleAdminEditPost(request, env, slug)],
      ['POST', '/admin/delete/', (slug) => handleAdminDelete(request, env, slug)],
      ['POST', '/api/preview', () => handlePreview(request)],
    ];

    if (path.startsWith('/article/') && method === 'GET') {
      const slug = path.replace('/article/', '');
      return handleArticle(env, slug);
    }
    if (path.startsWith('/admin/edit/') && method === 'GET') {
      const slug = path.replace('/admin/edit/', '');
      return handleAdminEdit(request, env, slug);
    }
    if (path.startsWith('/admin/edit/') && method === 'POST') {
      const slug = path.replace('/admin/edit/', '');
      return handleAdminEditPost(request, env, slug);
    }
    if (path.startsWith('/admin/delete/') && method === 'POST') {
      const slug = path.replace('/admin/delete/', '');
      return handleAdminDelete(request, env, slug);
    }

    for (const [m, p, handler] of router) {
      if (method === m && path === p) return handler();
    }

    return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/html' } });
  }
};

// --- Auth helpers ---

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function isAuthenticated(request, env) {
  const token = getCookie(request, 'session');
  if (!token) return false;
  const session = await env.BLOG_KV.get(`session:${token}`, 'json');
  if (!session) return false;
  return Date.now() < session.expiresAt;
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function redirect(path, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: path, ...headers } });
}

// --- KV helpers ---

async function getIndex(env) {
  return (await env.BLOG_KV.get('articles:index', 'json')) || [];
}

async function saveIndex(env, index) {
  await env.BLOG_KV.put('articles:index', JSON.stringify(index));
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') || `post-${Date.now()}`;
}

// --- Route handlers ---

async function handleHome(env, url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = parseInt(env.POSTS_PER_PAGE || '10');
  const index = await getIndex(env);
  const published = index.filter(a => a.published);
  const total = published.length;
  const totalPages = Math.ceil(total / perPage);
  const articles = published.slice((page - 1) * perPage, page * perPage);

  let list = '';
  for (const a of articles) {
    const date = new Date(a.createdAt).toLocaleDateString('zh-CN');
    list += `<article class="post-item"><a href="/article/${a.slug}"><h2>${esc(a.title)}</h2></a><time>${date}</time></article>`;
  }

  let pagination = '';
  if (totalPages > 1) {
    pagination = '<nav class="pagination">';
    if (page > 1) pagination += `<a href="/?page=${page - 1}">&laquo; Prev</a>`;
    pagination += `<span>Page ${page} / ${totalPages}</span>`;
    if (page < totalPages) pagination += `<a href="/?page=${page + 1}">Next &raquo;</a>`;
    pagination += '</nav>';
  }

  return html(layout(env.BLOG_TITLE || 'Blog', `<h1>${esc(env.BLOG_TITLE || 'Blog')}</h1>${list || '<p>No posts yet.</p>'}${pagination}`));
}

async function handleArticle(env, slug) {
  const article = await env.BLOG_KV.get(`article:${slug}`, 'json');
  if (!article || !article.published) return new Response('Not Found', { status: 404 });
  const date = new Date(article.createdAt).toLocaleDateString('zh-CN');
  const body = `
    <article class="post-full">
      <h1>${esc(article.title)}</h1>
      <time>${date}</time>
      <div class="content" id="rendered-content"></div>
    </article>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>document.getElementById('rendered-content').innerHTML=marked.parse(${JSON.stringify(article.content)});</script>
    <p><a href="/">&larr; Back</a></p>`;
  return html(layout(article.title, body));
}

function handleLoginPage(error = '') {
  const body = `
    <div class="auth-form">
      <h1>Login</h1>
      ${error ? `<p class="error">${error}</p>` : ''}
      <form method="POST" action="/login">
        <label>Username<input type="text" name="username" required autocomplete="username"></label>
        <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
        <button type="submit">Login</button>
      </form>
    </div>`;
  return html(layout('Login', body));
}

async function handleLogin(request, env) {
  const form = await request.formData();
  const username = form.get('username');
  const password = form.get('password');
  if (username !== env.ADMIN_USER || password !== env.ADMIN_PASS) {
    return handleLoginPage('Invalid credentials');
  }
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
    const status = a.published ? '<span class="badge published">Published</span>' : '<span class="badge draft">Draft</span>';
    rows += `<tr>
      <td>${esc(a.title)}</td><td>${status}</td>
      <td>${new Date(a.createdAt).toLocaleDateString('zh-CN')}</td>
      <td>
        <a href="/admin/edit/${a.slug}" class="btn btn-sm">Edit</a>
        <form method="POST" action="/admin/delete/${a.slug}" style="display:inline" onsubmit="return confirm('Delete?')">
          <button class="btn btn-sm btn-danger">Delete</button>
        </form>
      </td>
    </tr>`;
  }
  const body = `
    <div class="admin-header"><h1>Dashboard</h1><a href="/admin/new" class="btn">New Post</a></div>
    <table class="admin-table">
      <thead><tr><th>Title</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No posts yet.</td></tr>'}</tbody>
    </table>
    <p><a href="/logout">Logout</a></p>`;
  return html(layout('Admin', body));
}

async function handleAdminNew(request, env) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  return html(layout('New Post', editorForm('', '', true, '/admin/new')));
}

async function handleAdminNewPost(request, env) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  const form = await request.formData();
  const title = form.get('title') || 'Untitled';
  const content = form.get('content') || '';
  const published = form.get('published') === 'on';
  const slug = slugify(title) + '-' + Date.now().toString(36);
  const now = new Date().toISOString();
  const article = { title, content, slug, createdAt: now, updatedAt: now, published };
  await env.BLOG_KV.put(`article:${slug}`, JSON.stringify(article));
  const index = await getIndex(env);
  index.unshift({ slug, title, createdAt: now, published });
  await saveIndex(env, index);
  return redirect('/admin');
}

async function handleAdminEdit(request, env, slug) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  const article = await env.BLOG_KV.get(`article:${slug}`, 'json');
  if (!article) return new Response('Not Found', { status: 404 });
  return html(layout('Edit Post', editorForm(article.title, article.content, article.published, `/admin/edit/${slug}`)));
}

async function handleAdminEditPost(request, env, slug) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  const article = await env.BLOG_KV.get(`article:${slug}`, 'json');
  if (!article) return new Response('Not Found', { status: 404 });
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

async function handlePreview(request) {
  const { content } = await request.json();
  return new Response(JSON.stringify({ html: content }), { headers: { 'content-type': 'application/json' } });
}

// --- Template helpers ---

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function editorForm(title, content, published, action) {
  return `
    <form method="POST" action="${action}" class="editor-form">
      <label>Title<input type="text" name="title" value="${esc(title)}" required></label>
      <div class="editor-wrap">
        <div class="editor-pane">
          <label>Content (Markdown)</label>
          <textarea name="content" id="editor" rows="20">${esc(content)}</textarea>
        </div>
        <div class="preview-pane">
          <label>Preview</label>
          <div id="preview" class="content"></div>
        </div>
      </div>
      <label class="checkbox"><input type="checkbox" name="published" ${published ? 'checked' : ''}> Published</label>
      <button type="submit" class="btn">Save</button>
    </form>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
      const editor = document.getElementById('editor');
      const preview = document.getElementById('preview');
      function update() { preview.innerHTML = marked.parse(editor.value); }
      editor.addEventListener('input', update);
      update();
    </script>`;
}

function html(body) {
  return new Response(body, { headers: { 'content-type': 'text/html;charset=UTF-8' } });
}

function layout(title, content) {
  return `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--muted:#666;--border:#e0e0e0;--accent:#2563eb;--card:#f9fafb;--danger:#dc2626}
@media(prefers-color-scheme:dark){:root{--bg:#0f0f0f;--fg:#e5e5e5;--muted:#999;--border:#2a2a2a;--accent:#60a5fa;--card:#1a1a1a;--danger:#f87171}}
[data-theme="light"]{--bg:#fff;--fg:#1a1a1a;--muted:#666;--border:#e0e0e0;--accent:#2563eb;--card:#f9fafb;--danger:#dc2626}
[data-theme="dark"]{--bg:#0f0f0f;--fg:#e5e5e5;--muted:#999;--border:#2a2a2a;--accent:#60a5fa;--card:#1a1a1a;--danger:#f87171}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--fg);line-height:1.7;transition:background .3s,color .3s}
.container{max-width:800px;margin:0 auto;padding:2rem 1.5rem}
nav.top{display:flex;justify-content:space-between;align-items:center;padding:1rem 0;border-bottom:1px solid var(--border);margin-bottom:2rem}
nav.top a{color:var(--accent);text-decoration:none;font-weight:600}
.theme-toggle{cursor:pointer;background:none;border:1px solid var(--border);border-radius:4px;padding:.3rem .6rem;color:var(--fg);font-size:.85rem}
.post-item{padding:1.2rem 0;border-bottom:1px solid var(--border)}
.post-item h2{font-size:1.3rem;margin-bottom:.3rem}
.post-item a{color:var(--fg);text-decoration:none}
.post-item a:hover{color:var(--accent)}
.post-item time{color:var(--muted);font-size:.85rem}
.post-full h1{font-size:2rem;margin-bottom:.5rem}
.post-full time{color:var(--muted);display:block;margin-bottom:1.5rem}
.content{line-height:1.8}.content h1,.content h2,.content h3{margin:1.5rem 0 .5rem}
.content pre{background:var(--card);padding:1rem;border-radius:6px;overflow-x:auto}
.content code{background:var(--card);padding:.15rem .4rem;border-radius:3px;font-size:.9em}
.content pre code{background:none;padding:0}
.content img{max-width:100%;border-radius:6px}
.content blockquote{border-left:3px solid var(--accent);padding-left:1rem;color:var(--muted)}
.pagination{display:flex;gap:1rem;align-items:center;justify-content:center;padding:2rem 0}
.pagination a{color:var(--accent);text-decoration:none}
.auth-form{max-width:360px;margin:3rem auto}
.auth-form h1{margin-bottom:1.5rem}
.auth-form label{display:block;margin-bottom:1rem;font-size:.9rem;color:var(--muted)}
.auth-form input{display:block;width:100%;padding:.6rem;margin-top:.3rem;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--fg);font-size:1rem}
.error{color:var(--danger);margin-bottom:1rem}
.btn{display:inline-block;padding:.5rem 1.2rem;background:var(--accent);color:#fff;border:none;border-radius:4px;cursor:pointer;text-decoration:none;font-size:.9rem}
.btn:hover{opacity:.9}
.btn-sm{padding:.3rem .7rem;font-size:.8rem}
.btn-danger{background:var(--danger)}
.admin-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem}
.admin-table{width:100%;border-collapse:collapse}
.admin-table th,.admin-table td{padding:.7rem;text-align:left;border-bottom:1px solid var(--border)}
.badge{font-size:.75rem;padding:.2rem .5rem;border-radius:3px}
.badge.published{background:#16a34a;color:#fff}
.badge.draft{background:var(--muted);color:#fff}
.editor-form label{display:block;margin-bottom:.5rem;font-size:.9rem;color:var(--muted)}
.editor-form input[type="text"]{width:100%;padding:.6rem;margin-bottom:1rem;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--fg);font-size:1rem}
.editor-wrap{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem}
@media(max-width:768px){.editor-wrap{grid-template-columns:1fr}}
.editor-pane textarea{width:100%;padding:.8rem;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--fg);font-family:monospace;font-size:.9rem;resize:vertical}
.preview-pane{border:1px solid var(--border);border-radius:4px;padding:.8rem;overflow-y:auto;max-height:500px}
.checkbox{display:flex;align-items:center;gap:.5rem;margin-bottom:1rem;font-size:.9rem}
.checkbox input{width:auto}
</style></head>
<body><div class="container">
<nav class="top"><a href="/">Home</a><button class="theme-toggle" onclick="toggleTheme()">Theme</button></nav>
${content}
</div>
<script>
function toggleTheme(){const d=document.documentElement;const c=d.getAttribute('data-theme');const n=c==='dark'?'light':c==='light'?'dark':(window.matchMedia('(prefers-color-scheme:dark)').matches?'light':'dark');d.setAttribute('data-theme',n);localStorage.setItem('theme',n)}
(function(){const t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)})();
</script></body></html>`;
}
