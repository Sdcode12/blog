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
    return html(layout('404', `<div class="not-found"><div class="nf-code">404</div><p>页面不存在</p><a href="/" class="btn btn-primary">返回首页</a></div>`, env));
  }
};

// --- Auth ---
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

// --- KV ---
async function getIndex(env) { return (await env.BLOG_KV.get('articles:index', 'json')) || []; }
async function saveIndex(env, index) { await env.BLOG_KV.put('articles:index', JSON.stringify(index)); }
function slugify(text) { return text.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') || `post-${Date.now()}`; }

// --- Handlers ---
async function handleHome(env, url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = parseInt(env.POSTS_PER_PAGE || '10');
  const index = await getIndex(env);
  const published = index.filter(a => a.published);
  const total = published.length;
  const totalPages = Math.ceil(total / perPage);
  const articles = published.slice((page - 1) * perPage, page * perPage);

  const blogTitle = env.BLOG_TITLE || 'My Blog';
  const blogDesc = env.BLOG_DESC || 'Record thoughts, share stories';

  let content = `<section class="hero">
    <div class="hero-inner">
      <div class="hero-avatar">
        <svg viewBox="0 0 80 80" width="80" height="80"><circle cx="40" cy="40" r="38" fill="var(--accent-light)" stroke="var(--accent)" stroke-width="2"/><text x="40" y="48" text-anchor="middle" font-size="28" fill="var(--accent)">${esc(blogTitle.charAt(0))}</text></svg>
      </div>
      <h1 class="hero-title">${esc(blogTitle)}</h1>
      <p class="hero-desc">${esc(blogDesc)}</p>
      <div class="hero-meta"><span>${total} articles</span></div>
    </div>
  </section>
  <section class="posts-section">
    <div class="section-header"><h2>Latest Posts</h2></div>`;

  if (articles.length === 0) {
    content += '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--muted)" stroke-width="1.5"><path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V9a2 2 0 012-2h2a2 2 0 012 2v9a2 2 0 01-2 2h-2z"/></svg></div><p>No posts yet</p></div>';
  } else {
    content += '<div class="post-list">';
    for (const a of articles) {
      const date = new Date(a.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
      content += `<article class="post-card">
        <a href="/article/${a.slug}" class="post-card-link">
          <div class="post-card-content">
            <h3 class="post-card-title">${esc(a.title)}</h3>
            <div class="post-card-meta">
              <time><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.5 4.5v3.793l2.354 2.353a.5.5 0 01-.708.708l-2.5-2.5A.5.5 0 017.5 8.5v-4a.5.5 0 011 0z"/></svg>${date}</time>
              <span class="post-card-arrow">Read &rarr;</span>
            </div>
          </div>
        </a>
      </article>`;
    }
    content += '</div>';
  }

  let pagination = '';
  if (totalPages > 1) {
    pagination = '<div class="pagination">';
    if (page > 1) pagination += `<a href="/?page=${page - 1}" class="page-link prev"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 010 .708L5.707 8l5.647 5.646a.5.5 0 01-.708.708l-6-6a.5.5 0 010-.708l6-6a.5.5 0 01.708 0z"/></svg>Prev</a>`;
    pagination += `<span class="page-num">${page} / ${totalPages}</span>`;
    if (page < totalPages) pagination += `<a href="/?page=${page + 1}" class="page-link next">Next<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 01.708 0l6 6a.5.5 0 010 .708l-6 6a.5.5 0 01-.708-.708L10.293 8 4.646 2.354a.5.5 0 010-.708z"/></svg></a>`;
    pagination += '</div>';
  }

  content += pagination + '</section>';
  return html(layout(blogTitle, content, env));
}

async function handleArticle(env, slug) {
  const article = await env.BLOG_KV.get(`article:${slug}`, 'json');
  if (!article || !article.published) return html(layout('404', '<div class="not-found"><div class="nf-code">404</div><p>Article not found</p><a href="/" class="btn btn-primary">Back</a></div>', env));
  const date = new Date(article.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const body = `
    <article class="article-page">
      <header class="article-header">
        <a href="/" class="back-nav"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 010 .708L5.707 8l5.647 5.646a.5.5 0 01-.708.708l-6-6a.5.5 0 010-.708l6-6a.5.5 0 01.708 0z"/></svg>All Posts</a>
        <h1>${esc(article.title)}</h1>
        <div class="article-meta"><time><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.5 4.5v3.793l2.354 2.353a.5.5 0 01-.708.708l-2.5-2.5A.5.5 0 017.5 8.5v-4a.5.5 0 011 0z"/></svg>${date}</time></div>
      </header>
      <div class="article-body content" id="rendered-content"></div>
      <footer class="article-footer">
        <a href="/" class="btn btn-outline">Back to All Posts</a>
      </footer>
    </article>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
    <script>document.getElementById('rendered-content').innerHTML=marked.parse(${JSON.stringify(article.content)});<\/script>`;
  return html(layout(article.title, body, env));
}

function handleLoginPage(error = '') {
  const body = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <div class="login-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
          <h1>Admin Login</h1>
          <p>Please enter your credentials</p>
        </div>
        ${error ? `<div class="alert alert-error"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zM7 4h2v5H7V4zm0 6h2v2H7v-2z"/></svg>${error}</div>` : ''}
        <form method="POST" action="/login" class="login-form">
          <div class="field">
            <label for="username">Username</label>
            <div class="input-wrap"><svg viewBox="0 0 16 16" width="16" height="16" fill="var(--muted)"><path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3z"/></svg><input type="text" id="username" name="username" required autocomplete="username" placeholder="Enter username"></div>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <div class="input-wrap"><svg viewBox="0 0 16 16" width="16" height="16" fill="var(--muted)"><path d="M8 1a2 2 0 012 2v4H6V3a2 2 0 012-2zm3 6V3a3 3 0 00-6 0v4a2 2 0 00-2 2v5a2 2 0 002 2h6a2 2 0 002-2V9a2 2 0 00-2-2z"/></svg><input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Enter password"></div>
          </div>
          <button type="submit" class="btn btn-primary btn-full">Login</button>
        </form>
      </div>
    </div>`;
  return html(layout('Login', body, {}));
}

async function handleLogin(request, env) {
  const form = await request.formData();
  const username = form.get('username');
  const password = form.get('password');
  if (username !== env.ADMIN_USER || password !== env.ADMIN_PASS) return handleLoginPage('Username or password is incorrect');
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
  const pubCount = index.filter(a => a.published).length;
  const draftCount = index.length - pubCount;
  let rows = '';
  for (const a of index) {
    const status = a.published
      ? '<span class="tag tag-success"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>Published</span>'
      : '<span class="tag tag-muted"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M14 1H2a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V2a1 1 0 00-1-1zM2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V2a2 2 0 00-2-2H2z"/></svg>Draft</span>';
    const date = new Date(a.createdAt).toLocaleDateString('zh-CN');
    rows += `<div class="admin-row">
      <div class="admin-row-main">
        <h4>${esc(a.title)}</h4>
        <div class="admin-row-meta">${status}<span class="meta-date">${date}</span></div>
      </div>
      <div class="admin-row-actions">
        <a href="/admin/edit/${a.slug}" class="btn btn-sm btn-outline"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10z"/></svg>Edit</a>
        <form method="POST" action="/admin/delete/${a.slug}" style="display:inline" onsubmit="return confirm('Confirm delete this article?')">
          <button class="btn btn-sm btn-ghost-danger"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1z"/></svg>Delete</button>
        </form>
      </div>
    </div>`;
  }
  const body = `
    <div class="admin-page">
      <div class="admin-header">
        <div class="admin-header-left">
          <h1><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>Dashboard</h1>
        </div>
        <div class="admin-header-right">
          <a href="/" class="btn btn-ghost" target="_blank"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8.636 3.5a.5.5 0 00-.5-.5H1.5A1.5 1.5 0 000 4.5v10A1.5 1.5 0 001.5 16h10a1.5 1.5 0 001.5-1.5V7.864a.5.5 0 00-1 0V14.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5v-10a.5.5 0 01.5-.5h6.636a.5.5 0 00.5-.5z"/><path d="M16 .5a.5.5 0 00-.5-.5h-5a.5.5 0 000 1h3.793L6.146 9.146a.5.5 0 10.708.708L15 1.707V5.5a.5.5 0 001 0v-5z"/></svg>View Blog</a>
          <a href="/logout" class="btn btn-ghost"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 12.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5h8a.5.5 0 01.5.5v2a.5.5 0 001 0v-2A1.5 1.5 0 009.5 2h-8A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h8a1.5 1.5 0 001.5-1.5v-2a.5.5 0 00-1 0v2z"/><path fill-rule="evenodd" d="M15.854 8.354a.5.5 0 000-.708l-3-3a.5.5 0 00-.708.708L14.293 7.5H5.5a.5.5 0 000 1h8.793l-2.147 2.146a.5.5 0 00.708.708l3-3z"/></svg>Logout</a>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon stat-icon-total"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="stat-info"><span class="stat-num">${index.length}</span><span class="stat-label">Total Articles</span></div></div>
        <div class="stat-card"><div class="stat-icon stat-icon-pub"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="stat-info"><span class="stat-num">${pubCount}</span><span class="stat-label">Published</span></div></div>
        <div class="stat-card"><div class="stat-icon stat-icon-draft"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div><div class="stat-info"><span class="stat-num">${draftCount}</span><span class="stat-label">Drafts</span></div></div>
      </div>
      <div class="admin-content-section">
        <div class="section-bar"><h3>All Articles</h3><a href="/admin/new" class="btn btn-primary"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/></svg>New Post</a></div>
        <div class="admin-list">
          ${rows || '<div class="empty-state"><p>No articles yet, create your first one</p></div>'}
        </div>
      </div>
    </div>`;
  return html(layout('Dashboard', body, env));
}

async function handleAdminNew(request, env) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  return html(layout('New Post', editorForm('', '', true, '/admin/new'), env));
}

async function handleAdminNewPost(request, env) {
  if (!(await isAuthenticated(request, env))) return redirect('/login');
  const form = await request.formData();
  const title = form.get('title') || 'Untitled';
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
  return html(layout('Edit Post', editorForm(article.title, article.content, article.published, `/admin/edit/${slug}`), env));
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

// --- Helpers ---
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function editorForm(title, content, published, action) {
  return `
    <div class="editor-page">
      <form method="POST" action="${action}" class="editor-form">
        <div class="editor-topbar">
          <a href="/admin" class="back-nav"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 010 .708L5.707 8l5.647 5.646a.5.5 0 01-.708.708l-6-6a.5.5 0 010-.708l6-6a.5.5 0 01.708 0z"/></svg>Back</a>
          <div class="editor-topbar-actions">
            <label class="switch-label">
              <input type="checkbox" name="published" ${published ? 'checked' : ''} class="switch-input">
              <span class="switch-slider"></span>
              <span class="switch-text">Publish</span>
            </label>
            <button type="submit" class="btn btn-primary"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>Save</button>
          </div>
        </div>
        <div class="editor-title-wrap">
          <input type="text" name="title" value="${esc(title)}" required placeholder="Enter article title..." class="editor-title">
        </div>
        <div class="editor-container">
          <div class="editor-pane">
            <div class="pane-tab"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M14 3a1 1 0 01-1 1H3a1 1 0 010-2h10a1 1 0 011 1zM14 7a1 1 0 01-1 1H3a1 1 0 010-2h10a1 1 0 011 1zM3 11h4a1 1 0 010 2H3a1 1 0 010-2z"/></svg>Markdown</div>
            <textarea name="content" id="editor" placeholder="Start writing...">${esc(content)}</textarea>
          </div>
          <div class="editor-pane">
            <div class="pane-tab"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M2 2a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V2zm2-1a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V2a1 1 0 00-1-1H4z"/></svg>Preview</div>
            <div id="preview" class="content preview-area"></div>
          </div>
        </div>
      </form>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
    <script>
      const editor=document.getElementById('editor'),preview=document.getElementById('preview');
      function update(){preview.innerHTML=marked.parse(editor.value)}
      editor.addEventListener('input',update);update();
      editor.addEventListener('keydown',function(e){if(e.key==='Tab'){e.preventDefault();const s=this.selectionStart,end=this.selectionEnd;this.value=this.value.substring(0,s)+'  '+this.value.substring(end);this.selectionStart=this.selectionEnd=s+2}});
    <\/script>`;
}

function html(body) { return new Response(body, { headers: { 'content-type': 'text/html;charset=UTF-8' } }); }

function layout(title, content, env) {
  const blogTitle = (env && env.BLOG_TITLE) || 'My Blog';
  return `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - ${esc(blogTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#fafbfc;--bg-card:#ffffff;--bg-elevated:#ffffff;--bg-inset:#f0f2f5;
  --fg:#1a1a2e;--fg-secondary:#4a5568;--fg-muted:#8892a4;
  --border:#e4e8ee;--border-light:#f0f2f5;
  --accent:#5b5bd6;--accent-hover:#4747c2;--accent-light:#ededfd;--accent-subtle:#f5f5ff;
  --success:#2d9d78;--success-light:#e6f7f1;
  --danger:#e5484d;--danger-light:#ffeef0;--danger-hover:#d13438;
  --shadow-xs:0 1px 2px rgba(0,0,0,.04);
  --shadow-sm:0 2px 8px rgba(0,0,0,.06);
  --shadow-md:0 4px 16px rgba(0,0,0,.08);
  --shadow-lg:0 8px 32px rgba(0,0,0,.1);
  --radius:8px;--radius-lg:14px;--radius-xl:20px;
  --font-sans:'Inter',system-ui,-apple-system,sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,monospace;
}
@media(prefers-color-scheme:dark){:root{
  --bg:#111118;--bg-card:#1c1c28;--bg-elevated:#242433;--bg-inset:#0d0d12;
  --fg:#eeeef0;--fg-secondary:#a9adc1;--fg-muted:#6c7086;
  --border:#2e2e3e;--border-light:#232334;
  --accent:#8b8bf5;--accent-hover:#a5a5f7;--accent-light:#1f1f3a;--accent-subtle:#16162a;
  --success:#3dd68c;--success-light:#0d2e1f;
  --danger:#f87171;--danger-light:#2d1215;--danger-hover:#fca5a5;
  --shadow-xs:0 1px 2px rgba(0,0,0,.2);
  --shadow-sm:0 2px 8px rgba(0,0,0,.3);
  --shadow-md:0 4px 16px rgba(0,0,0,.4);
  --shadow-lg:0 8px 32px rgba(0,0,0,.5);
}}
[data-theme="light"]{--bg:#fafbfc;--bg-card:#ffffff;--bg-elevated:#ffffff;--bg-inset:#f0f2f5;--fg:#1a1a2e;--fg-secondary:#4a5568;--fg-muted:#8892a4;--border:#e4e8ee;--border-light:#f0f2f5;--accent:#5b5bd6;--accent-hover:#4747c2;--accent-light:#ededfd;--accent-subtle:#f5f5ff;--success:#2d9d78;--success-light:#e6f7f1;--danger:#e5484d;--danger-light:#ffeef0;--danger-hover:#d13438;--shadow-xs:0 1px 2px rgba(0,0,0,.04);--shadow-sm:0 2px 8px rgba(0,0,0,.06);--shadow-md:0 4px 16px rgba(0,0,0,.08);--shadow-lg:0 8px 32px rgba(0,0,0,.1)}
[data-theme="dark"]{--bg:#111118;--bg-card:#1c1c28;--bg-elevated:#242433;--bg-inset:#0d0d12;--fg:#eeeef0;--fg-secondary:#a9adc1;--fg-muted:#6c7086;--border:#2e2e3e;--border-light:#232334;--accent:#8b8bf5;--accent-hover:#a5a5f7;--accent-light:#1f1f3a;--accent-subtle:#16162a;--success:#3dd68c;--success-light:#0d2e1f;--danger:#f87171;--danger-light:#2d1215;--danger-hover:#fca5a5;--shadow-xs:0 1px 2px rgba(0,0,0,.2);--shadow-sm:0 2px 8px rgba(0,0,0,.3);--shadow-md:0 4px 16px rgba(0,0,0,.4);--shadow-lg:0 8px 32px rgba(0,0,0,.5)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font-sans);background:var(--bg);color:var(--fg);line-height:1.6;-webkit-font-smoothing:antialiased}
.site-wrap{min-height:100vh;display:flex;flex-direction:column}
.main-content{flex:1;max-width:760px;width:100%;margin:0 auto;padding:0 1.5rem}

/* Navbar */
.navbar{background:var(--bg-card);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;backdrop-filter:saturate(180%) blur(12px);background:color-mix(in srgb,var(--bg-card) 80%,transparent)}
.nav-inner{max-width:760px;margin:0 auto;padding:0 1.5rem;display:flex;align-items:center;justify-content:space-between;height:60px}
.nav-brand{font-weight:700;font-size:1.15rem;color:var(--fg);text-decoration:none;display:flex;align-items:center;gap:.5rem}
.nav-brand-dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.nav-right{display:flex;align-items:center;gap:.5rem}
.nav-link{color:var(--fg-secondary);text-decoration:none;font-size:.875rem;font-weight:500;padding:.4rem .75rem;border-radius:var(--radius);transition:all .15s}
.nav-link:hover{color:var(--accent);background:var(--accent-light)}
.theme-toggle{width:36px;height:36px;border-radius:50%;border:1px solid var(--border);background:var(--bg-card);cursor:pointer;display:grid;place-items:center;transition:all .2s;color:var(--fg-muted)}
.theme-toggle:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-light)}
.theme-toggle svg{width:18px;height:18px}

/* Hero */
.hero{padding:3.5rem 0 2.5rem;text-align:center}
.hero-inner{display:flex;flex-direction:column;align-items:center;gap:.75rem}
.hero-avatar{margin-bottom:.5rem}
.hero-title{font-size:2rem;font-weight:800;letter-spacing:-.03em;background:linear-gradient(135deg,var(--fg),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero-desc{color:var(--fg-secondary);font-size:1rem;font-weight:400}
.hero-meta{color:var(--fg-muted);font-size:.85rem;display:flex;gap:1rem}

/* Posts */
.posts-section{padding-bottom:3rem}
.section-header{margin-bottom:1.25rem}
.section-header h2{font-size:1.1rem;font-weight:600;color:var(--fg-secondary)}
.post-list{display:flex;flex-direction:column;gap:.75rem}
.post-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);transition:all .2s;overflow:hidden}
.post-card:hover{border-color:var(--accent);box-shadow:var(--shadow-md);transform:translateY(-2px)}
.post-card-link{display:block;padding:1.25rem 1.5rem;text-decoration:none;color:inherit}
.post-card-title{font-size:1.1rem;font-weight:600;color:var(--fg);margin-bottom:.5rem;line-height:1.4}
.post-card-meta{display:flex;align-items:center;justify-content:space-between}
.post-card-meta time{display:flex;align-items:center;gap:.4rem;font-size:.8rem;color:var(--fg-muted)}
.post-card-arrow{font-size:.8rem;color:var(--accent);font-weight:500;opacity:0;transform:translateX(-4px);transition:all .2s}
.post-card:hover .post-card-arrow{opacity:1;transform:translateX(0)}
.empty-state{text-align:center;padding:3rem;color:var(--fg-muted)}
.empty-icon{margin-bottom:1rem}

/* Pagination */
.pagination{display:flex;justify-content:center;align-items:center;gap:1rem;padding:2rem 0}
.page-link{display:flex;align-items:center;gap:.4rem;color:var(--accent);text-decoration:none;font-size:.875rem;font-weight:500;padding:.5rem 1rem;border:1px solid var(--border);border-radius:var(--radius);transition:all .15s}
.page-link:hover{background:var(--accent-light);border-color:var(--accent)}
.page-num{color:var(--fg-muted);font-size:.85rem}

/* Article page */
.article-page{padding:2rem 0 3rem}
.article-header{margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:1px solid var(--border)}
.article-header h1{font-size:2rem;font-weight:700;letter-spacing:-.02em;line-height:1.3;margin:.75rem 0}
.article-meta{display:flex;align-items:center;gap:1rem}
.article-meta time{display:flex;align-items:center;gap:.4rem;font-size:.85rem;color:var(--fg-muted)}
.back-nav{display:inline-flex;align-items:center;gap:.3rem;color:var(--fg-muted);text-decoration:none;font-size:.85rem;font-weight:500;transition:color .15s}
.back-nav:hover{color:var(--accent)}
.article-footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--border)}

/* Content typography */
.content{font-size:1rem;line-height:1.8;color:var(--fg-secondary)}
.content h1,.content h2,.content h3{color:var(--fg);font-weight:600;margin:2rem 0 .75rem;letter-spacing:-.01em}
.content h1{font-size:1.75rem}.content h2{font-size:1.4rem}.content h3{font-size:1.15rem}
.content p{margin:.75rem 0}
.content a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}
.content strong{color:var(--fg);font-weight:600}
.content ul,.content ol{margin:.75rem 0;padding-left:1.5rem}
.content li{margin:.3rem 0}
.content pre{background:var(--bg-inset);border:1px solid var(--border);padding:1rem 1.25rem;border-radius:var(--radius);overflow-x:auto;margin:1.25rem 0;font-family:var(--font-mono);font-size:.85rem;line-height:1.7}
.content code{font-family:var(--font-mono);background:var(--bg-inset);padding:.15rem .4rem;border-radius:4px;font-size:.85em;color:var(--accent)}
.content pre code{background:none;padding:0;color:inherit;font-size:inherit}
.content blockquote{border-left:3px solid var(--accent);padding:.75rem 1.25rem;margin:1.25rem 0;background:var(--accent-subtle);border-radius:0 var(--radius) var(--radius) 0;color:var(--fg-secondary)}
.content img{max-width:100%;border-radius:var(--radius);margin:1.25rem 0;box-shadow:var(--shadow-sm)}
.content hr{border:none;border-top:1px solid var(--border);margin:2rem 0}
.content table{width:100%;border-collapse:collapse;margin:1.25rem 0;font-size:.9rem}
.content th,.content td{padding:.6rem .8rem;border:1px solid var(--border);text-align:left}
.content th{background:var(--bg-inset);font-weight:600;color:var(--fg)}

/* Login */
.login-page{display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 200px)}
.login-card{width:100%;max-width:400px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-xl);padding:2.5rem;box-shadow:var(--shadow-lg)}
.login-header{text-align:center;margin-bottom:2rem}
.login-icon{margin-bottom:1rem}
.login-header h1{font-size:1.4rem;font-weight:700}
.login-header p{color:var(--fg-muted);font-size:.9rem;margin-top:.25rem}
.login-form .field{margin-bottom:1.25rem}
.login-form label{display:block;font-size:.8rem;font-weight:600;color:var(--fg-secondary);margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.03em}
.input-wrap{position:relative;display:flex;align-items:center}
.input-wrap svg{position:absolute;left:.85rem;pointer-events:none}
.input-wrap input{width:100%;padding:.7rem .85rem .7rem 2.5rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--fg);font-size:.95rem;transition:all .15s}
.input-wrap input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-light)}
.input-wrap input::placeholder{color:var(--fg-muted)}
.alert{display:flex;align-items:center;gap:.5rem;padding:.75rem 1rem;border-radius:var(--radius);margin-bottom:1.25rem;font-size:.875rem}
.alert-error{background:var(--danger-light);color:var(--danger);border:1px solid color-mix(in srgb,var(--danger) 20%,transparent)}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1.1rem;border:1px solid transparent;border-radius:var(--radius);cursor:pointer;text-decoration:none;font-size:.875rem;font-weight:500;transition:all .15s;font-family:inherit}
.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-primary:hover{background:var(--accent-hover);transform:translateY(-1px);box-shadow:var(--shadow-sm)}
.btn-outline{background:transparent;color:var(--fg-secondary);border-color:var(--border)}
.btn-outline:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-light)}
.btn-ghost{background:transparent;color:var(--fg-secondary);border:none;padding:.5rem .75rem}
.btn-ghost:hover{color:var(--accent);background:var(--accent-light)}
.btn-ghost-danger{background:transparent;color:var(--fg-muted);border:1px solid var(--border);border-radius:var(--radius);padding:.4rem .8rem;cursor:pointer;font-size:.8rem;font-family:inherit;display:inline-flex;align-items:center;gap:.3rem;transition:all .15s}
.btn-ghost-danger:hover{color:var(--danger);border-color:var(--danger);background:var(--danger-light)}
.btn-full{width:100%;justify-content:center;padding:.75rem}
.btn-sm{padding:.35rem .7rem;font-size:.8rem}

/* Admin */
.admin-page{padding:2rem 0 3rem}
.admin-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem;flex-wrap:wrap;gap:1rem}
.admin-header-left h1{font-size:1.5rem;font-weight:700;display:flex;align-items:center;gap:.5rem}
.admin-header-right{display:flex;gap:.5rem}
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:2rem}
.stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;display:flex;align-items:center;gap:1rem;transition:all .15s}
.stat-card:hover{box-shadow:var(--shadow-sm);border-color:color-mix(in srgb,var(--border) 50%,var(--accent))}
.stat-icon{width:44px;height:44px;border-radius:var(--radius);display:grid;place-items:center}
.stat-icon svg{width:22px;height:22px}
.stat-icon-total{background:var(--accent-light);color:var(--accent)}
.stat-icon-pub{background:var(--success-light);color:var(--success)}
.stat-icon-draft{background:var(--bg-inset);color:var(--fg-muted)}
.stat-num{font-size:1.5rem;font-weight:700;display:block;line-height:1.2}
.stat-label{font-size:.75rem;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.04em}
.admin-content-section{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden}
.section-bar{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.5rem;border-bottom:1px solid var(--border);background:var(--bg-inset)}
.section-bar h3{font-size:.9rem;font-weight:600;color:var(--fg-secondary)}
.admin-list{divide-y divide-border}
.admin-row{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.5rem;border-bottom:1px solid var(--border);transition:background .1s}
.admin-row:last-child{border-bottom:none}
.admin-row:hover{background:var(--bg-inset)}
.admin-row-main h4{font-size:.95rem;font-weight:600;margin-bottom:.3rem}
.admin-row-meta{display:flex;align-items:center;gap:.75rem}
.meta-date{font-size:.8rem;color:var(--fg-muted)}
.admin-row-actions{display:flex;gap:.5rem;align-items:center}
.tag{display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;padding:.2rem .6rem;border-radius:20px;font-weight:500}
.tag-success{background:var(--success-light);color:var(--success)}
.tag-muted{background:var(--bg-inset);color:var(--fg-muted)}

/* Editor */
.editor-page{padding:1rem 0 3rem}
.editor-topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem}
.editor-topbar-actions{display:flex;align-items:center;gap:1rem}
.editor-title-wrap{margin-bottom:1rem}
.editor-title{width:100%;padding:.75rem 0;border:none;border-bottom:2px solid var(--border);background:transparent;color:var(--fg);font-size:1.5rem;font-weight:700;font-family:var(--font-sans);transition:border-color .15s}
.editor-title:focus{outline:none;border-color:var(--accent)}
.editor-title::placeholder{color:var(--fg-muted)}
.editor-container{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;background:var(--bg-card);box-shadow:var(--shadow-sm)}
@media(max-width:768px){.editor-container{grid-template-columns:1fr}}
.editor-pane{display:flex;flex-direction:column;min-height:500px}
.editor-pane:first-child{border-right:1px solid var(--border)}
@media(max-width:768px){.editor-pane:first-child{border-right:none;border-bottom:1px solid var(--border)}}
.pane-tab{display:flex;align-items:center;gap:.5rem;padding:.6rem 1rem;background:var(--bg-inset);font-size:.8rem;font-weight:600;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border)}
#editor{flex:1;width:100%;padding:1.25rem;border:none;background:transparent;color:var(--fg);font-family:var(--font-mono);font-size:.875rem;line-height:1.7;resize:none}
#editor:focus{outline:none}
#editor::placeholder{color:var(--fg-muted)}
.preview-area{flex:1;padding:1.25rem;overflow-y:auto}

/* Switch toggle */
.switch-label{display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.875rem;color:var(--fg-secondary)}
.switch-input{display:none}
.switch-slider{width:36px;height:20px;background:var(--border);border-radius:10px;position:relative;transition:background .2s}
.switch-slider::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:var(--shadow-xs)}
.switch-input:checked+.switch-slider{background:var(--accent)}
.switch-input:checked+.switch-slider::after{transform:translateX(16px)}

/* 404 */
.not-found{text-align:center;padding:5rem 0}
.nf-code{font-size:5rem;font-weight:800;color:var(--fg-muted);opacity:.3;line-height:1}
.not-found p{color:var(--fg-secondary);margin:1rem 0 2rem;font-size:1.1rem}

/* Footer */
.site-footer{text-align:center;padding:2rem 0;color:var(--fg-muted);font-size:.8rem;border-top:1px solid var(--border)}

@media(max-width:640px){
  .hero-title{font-size:1.6rem}
  .article-header h1{font-size:1.5rem}
  .stats-grid{grid-template-columns:1fr}
  .admin-header{flex-direction:column;align-items:flex-start}
  .admin-row{flex-direction:column;align-items:flex-start;gap:.75rem}
  .editor-topbar{flex-direction:column;align-items:flex-start}
}
</style></head>
<body><div class="site-wrap">
<nav class="navbar"><div class="nav-inner">
  <a href="/" class="nav-brand"><span class="nav-brand-dot"></span>${esc(blogTitle)}</a>
  <div class="nav-right">
    <a href="/" class="nav-link">Posts</a>
    <button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    </button>
  </div>
</div></nav>
<main class="main-content">${content}</main>
<footer class="site-footer">Powered by Cloudflare Workers</footer>
</div>
<script>
function toggleTheme(){const d=document.documentElement,c=d.getAttribute('data-theme'),n=c==='dark'?'light':c==='light'?'dark':(matchMedia('(prefers-color-scheme:dark)').matches?'light':'dark');d.setAttribute('data-theme',n);localStorage.setItem('theme',n)}
(()=>{const t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)})();
</script></body></html>`;
}