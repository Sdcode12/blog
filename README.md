# Blog · 轻量个人博客

基于 **Cloudflare Workers + Workers KV + D1** 的个人博客，使用 JavaScript 编写。一个 Worker 同时提供博客前台、用户账号和管理员后台；文章保存在 KV，普通用户账号保存在 D1，无需自行维护服务器。

## 功能

- **文章阅读**：首页展示已发布文章，支持分页和文章详情。
- **文章搜索**：按标题和正文搜索已发布文章，关键词匹配不区分大小写。
- **Markdown 写作**：在后台编辑 Markdown，宽屏下提供实时预览。
- **内容管理**：创建、编辑、删除文章，支持草稿与发布状态切换。
- **管理后台**：查看文章总数、已发布数量和草稿数量。
- **管理员登录**：通过环境中的管理员账号验证身份，使用 Cookie 与 KV 保存登录会话。
- **普通用户账号**：访客可以注册、登录、查看个人中心和退出；首页显示当前用户的登录状态，普通用户不能管理文章。

当前适合单管理员、低并发写作的个人博客。普通用户账号与管理员权限相互独立，注册不会获得写作权限。尚未提供评论、标签分类、图片上传、找回密码或文章导入导出功能；图片可在 Markdown 中引用外部地址。

## 技术与项目结构

| 部分 | 实现 |
| --- | --- |
| 运行环境 | Cloudflare Workers，ES Module Worker |
| 数据存储 | Workers KV，绑定名称为 `BLOG_KV` |
| 用户存储 | Cloudflare D1，绑定名称为 `USER_DB`，保存用户、会话与请求限流记录 |
| 页面生成 | Worker 返回 HTML，普通表单提交与页面跳转 |
| 页面样式 | 通过 CDN 加载 Tailwind CSS |
| Markdown | 浏览器通过 CDN 加载 Marked 并渲染 |
| 字体与图标 | Google Fonts 与 Material Symbols |

| 文件 | 说明 |
| --- | --- |
| [worker.js](./worker.js) | 请求路由、认证、文章读写、页面模板和编辑器 |
| [user-auth.js](./user-auth.js) | 普通用户注册、登录、个人中心、会话与安全校验 |
| [migrations/0001_users.sql](./migrations/0001_users.sql) | D1 用户、会话及限流表结构 |
| [wrangler.toml](./wrangler.toml) | Worker 入口、兼容日期、公开变量、KV 和 D1 绑定 |
| [tests/user-auth.test.js](./tests/user-auth.test.js) | 使用 SQLite 验证注册登录流程与权限隔离 |
| [DEPLOY.md](./DEPLOY.md) | 首次部署与已有站点升级步骤 |

仓库提供 `package.json` 和不依赖第三方库的测试。运行测试需要 Node.js 24 或更高版本；部署时在本地安装 Wrangler。

## 快速部署到 Cloudflare Workers

### 1. 准备环境

需要：

- 一个可以创建 Workers、KV 命名空间和 D1 数据库的 Cloudflare 账号。
- Node.js 24 或更高版本及 npm。
- Git，用于克隆仓库。

```bash
git clone https://github.com/Sdcode12/blog.git
cd blog
npm install --save-dev wrangler
npx wrangler login
```

### 2. 创建并绑定 KV

```bash
npx wrangler kv namespace create BLOG_KV
```

把命令输出的命名空间 ID 填入 `wrangler.toml` 的 `id`：

```toml
[[kv_namespaces]]
binding = "BLOG_KV"
id = "替换为你创建的命名空间ID"
```

绑定名称必须保持为 `BLOG_KV`，因为代码通过 `env.BLOG_KV` 访问数据。命名空间 ID 是资源标识，不是管理员密码或访问令牌。

### 3. 创建用户数据库并初始化

```bash
npx wrangler d1 create blog-users
```

把输出的数据库 ID 填入 `wrangler.toml` 的 `USER_DB` 配置，替换全零占位值，保留现有 KV 配置：

```toml
[[d1_databases]]
binding = "USER_DB"
database_name = "blog-users"
database_id = "替换为你创建的数据库ID"
migrations_dir = "migrations"
```

应用线上迁移，创建用户、用户会话与请求限流表：

```bash
npx wrangler d1 migrations apply USER_DB --remote
```

已有博客升级时，复用原来的 `BLOG_KV` 命名空间与管理员 Secrets，仅新增 D1 数据库及其迁移；文章数据无需迁移。数据库未绑定或迁移未执行时，注册或登录提交会返回 503，公开文章仍可阅读。

### 4. 设置博客信息

修改 `wrangler.toml` 中的公开配置，例如：

```toml
[vars]
BLOG_TITLE = "我的博客"
POSTS_PER_PAGE = "10"
```

`POSTS_PER_PAGE` 应填写正整数。首次创建 Worker 时，可先在完成 KV 配置后执行一次 `npx wrangler deploy`，再继续设置管理员 Secrets；配置管理员账号前，后台无法登录。

### 5. 设置管理员账号

通过命令交互输入用户名和密码：

```bash
npx wrangler secret put ADMIN_USER
npx wrangler secret put ADMIN_PASS
```

使用自己设置的账号登录，没有内置默认账号。代码会去掉登录表单中用户名和密码首尾的空白，因此设置凭据时也应避免首尾空白。

### 6. 部署并访问

```bash
npx wrangler deploy
```

使用部署结果提供的 HTTPS 地址打开博客，通过右上角“注册”创建普通用户账号；普通用户登录地址为 `/user/login`，管理员后台登录地址仍为 `/login`。需要自定义域名时，在 Cloudflare 中为该 Worker 配置域名。

> **部署方式说明**：当前代码是由 `wrangler.toml` 指定 `worker.js` 为入口的 Workers 项目，应使用 `wrangler deploy` 部署到 Workers。当前仓库未提供自动部署工作流。

## 本地开发

本地登录需要单独提供开发凭据，远程 Worker 的 Secrets 不会自动成为本地开发变量。

先将 `.dev.vars` 加入 `.gitignore` 或本地 `.git/info/exclude`，再在项目根目录创建该文件：

```dotenv
ADMIN_USER="local-admin"
ADMIN_PASS="replace-with-a-local-password"
```

然后启动：

```bash
npx wrangler d1 migrations apply USER_DB --local
npx wrangler dev
```

访问终端输出的本地地址。默认本地开发使用本地模拟的 KV 和 D1 数据，与线上数据分开；线上迁移也不会自动应用到本地。开发凭据应与线上凭据分开；`.gitignore` 已排除 `.dev.vars`、`node_modules/` 和 `.wrangler/`。

### 运行测试

```bash
npm test
```

测试直接调用 Worker 请求入口，使用 Node.js 内置 SQLite 执行同一份迁移和 SQL，覆盖注册、重复用户名、密码校验、登录退出、过期会话、权限隔离、跨站提交、限流和数据库不可用等场景。这些测试不替代 Cloudflare 线上部署验证。

## 配置参考

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `BLOG_KV` | KV 绑定 | 是 | 保存文章、文章索引与管理员登录会话 |
| `USER_DB` | D1 绑定 | 用户账号必需 | 保存普通用户、用户会话与限流计数，需先执行迁移 |
| `ADMIN_USER` | Secret | 后台登录必需 | 管理员用户名 |
| `ADMIN_PASS` | Secret | 后台登录必需 | 管理员密码 |
| `BLOG_TITLE` | 公开变量 | 否 | 代码默认值为 `Chronicle`；仓库配置为 `My Blog` |
| `POSTS_PER_PAGE` | 公开变量 | 否 | 首页每页文章数，默认 `10` |

代码中虽然读取了 `BLOG_DESC`，但目前没有将其输出到页面，设置该变量不会显示博客简介。

## 使用方法

### 普通用户

1. 打开 `/register`，填写用户名、密码及确认密码，注册成功后自动进入个人中心。
2. 用户名为 3–32 位字母、数字或下划线，不区分大小写；密码为 12–128 个字符，首尾空白也属于密码。
3. 之后可通过 `/user/login` 登录，在 `/account` 查看用户名、注册时间与账号类型。
4. 点击“退出登录”会立即撤销当前用户会话，不影响管理员会话或其他设备上的用户会话。

普通用户注册不需要配置 `ADMIN_USER` 或 `ADMIN_PASS`，不会获得创建、编辑或删除文章的权限。当前未提供邮箱验证或密码找回，请妥善保存密码。

### 管理员

1. 打开 `/login`，使用配置好的管理员账号登录。
2. 在后台点击“写文章”，填写标题与 Markdown 正文。
3. 保持“发布”开启并保存，文章会显示在前台；关闭后保存为草稿。
4. 在文章列表中编辑、切换发布状态或删除文章。
5. 通过“退出登录”结束当前会话。

新建文章时默认开启“发布”。草稿不会出现在首页、搜索结果或公开文章详情中。删除会移除正文与索引记录，当前没有回收站。

### 页面与请求

| 方法 | 路径 | 说明 | 需要登录 |
| --- | --- | --- | --- |
| GET | `/` | 首页，可用 `?page=2` 翻页 | 否 |
| GET | `/article/:slug` | 阅读已发布文章 | 否 |
| GET | `/search?q=关键词` | 搜索已发布文章 | 否 |
| GET / POST | `/login` | 登录页面 / 提交凭据 | 否 |
| GET / POST | `/register` | 普通用户注册页面 / 创建账号并登录 | 否 |
| GET / POST | `/user/login` | 普通用户登录页面 / 提交凭据 | 否 |
| POST | `/user/logout` | 撤销当前用户会话并清除 Cookie | 否 |
| GET | `/account` | 普通用户个人中心 | 普通用户 |
| GET | `/logout` | 删除当前会话并清除 Cookie | 否 |
| GET | `/admin` | 文章管理与统计 | 是 |
| GET / POST | `/admin/new` | 新建文章页面 / 保存文章 | 是 |
| GET / POST | `/admin/edit/:slug` | 编辑页面 / 保存修改 | 是 |
| POST | `/admin/delete/:slug` | 删除文章 | 是 |

以上是 HTML 页面与表单路由，当前未提供独立的 JSON REST API。后台受保护的请求在管理员会话无效时跳转到 `/login`；个人中心在用户会话无效时跳转到 `/user/login`。

## 数据与登录机制

### KV 数据

| Key | 内容 |
| --- | --- |
| `articles:index` | 文章索引数组，包含 `slug`、标题、创建时间与发布状态 |
| `article:<slug>` | 完整文章，包含标题、Markdown 正文、标识、创建和更新时间、发布状态 |
| `session:<token>` | 登录会话，保存 `expiresAt`，同时设置 KV 过期时间 |

新文章的 `slug` 由标题转换结果加时间后缀生成，之后编辑标题不会改变文章地址。首页按索引顺序展示，新文章插入最前面；编辑已有文章不会把它移到最前面。

### 管理员登录流程

1. 浏览器向 `POST /login` 提交用户名和密码。
2. Worker 将其与 `ADMIN_USER`、`ADMIN_PASS` 直接比较。
3. 验证成功后，使用 `crypto.getRandomValues` 生成 32 字节随机 Token，以 64 位十六进制字符串表示。
4. Worker 将会话写入 KV，并返回名为 `session` 的 Cookie；两者有效期均为 24 小时。
5. 后续后台请求读取 Cookie，查询对应 KV 会话并检查 `expiresAt`。这是一种服务端会话机制，不使用 JWT 或刷新 Token。
6. 退出登录时，删除对应 KV 会话并清除浏览器 Cookie。

### 普通用户数据与登录流程

| D1 表 | 内容 |
| --- | --- |
| `users` | 用户 ID、显示用户名、唯一的小写用户名、密码派生值、独立随机盐、迭代数与注册时间 |
| `user_sessions` | Token 的 SHA-256 摘要、用户 ID、创建时间与过期时间，不保存原始 Token |
| `auth_rate_limits` | 按 IP 摘要及账号摘要划分的请求次数和窗口过期时间 |

- 注册使用数据库唯一约束避免同名账号，包括并发提交与大小写差异。
- 密码通过 Web Crypto PBKDF2-HMAC-SHA-256 和独立随机盐派生保存，不保存明文密码；迭代数为 100,000，以兼容 Workers 生产环境的迭代上限。
- 登录后生成 32 字节随机 Token，浏览器通过独立的 `user_session` Cookie 保存，D1 只保存其 SHA-256 摘要；会话固定有效期为 7 天，不自动续期。
- 用户 Cookie 设置 `HttpOnly`、`SameSite=Lax`，HTTPS 下附加 `Secure`；账号页面和包含登录状态的页面使用 `Cache-Control: no-store`。
- 用户注册、登录和退出使用 POST 并校验同源 Origin（缺少时使用同源 Referer）；GET 退出请求不会执行操作。
- 每个 IP 每小时最多提交 5 次有效格式的注册请求；每个 IP 或规范化账号每 15 分钟最多提交 10 次有效格式的登录请求，成功和失败均计数。超过限制返回 429 和 `Retry-After`。
- 退出立即删除当前会话；过期会话在鉴权时被拒绝，旧会话与限流记录在之后的注册或登录请求中清理。用户账号不会自动删除。

## 当前限制与维护注意事项

- **管理员认证**：管理员凭据应通过 Secrets 配置。原有管理员 Cookie 设置了 `HttpOnly` 和 `SameSite=Lax`，尚未设置 `Secure`；管理员登录也未实现限流或独立的 CSRF Token 校验。这些限制属于原有管理员流程，普通用户流程的保护见上文。
- **运行资源**：密码派生会消耗计算资源，需在目标 Cloudflare 套餐验证注册与登录请求的 CPU 配额；本地通过测试不代表线上免费套餐的 CPU 配额一定足够。PBKDF2 的迭代数受平台上限约束，不能直接宣称达到更高迭代数的密码存储建议。
- **修改密码**：认证仅在登录时比较凭据；修改管理员密码不会主动撤销已创建的会话。需要立即失效时，应清理相应 `session:` 记录。
- **Markdown 内容**：当前 Marked 渲染结果直接写入 `innerHTML`，未做 HTML 消毒。只应发布可信内容；开放投稿或导入不可信 Markdown 前需要补充处理。
- **一致性与并发**：Workers KV 为最终一致性存储，线上写入后读取可能存在延迟；文章索引采用整体读写，未实现并发写入冲突控制。
- **搜索与备份**：正文搜索会逐篇读取文章，适合小规模内容；文章保存在 KV 而非 Git 仓库中，拉取代码不会备份文章，应另行备份 KV 数据。
- **外部资源**：样式、字体、图标与 Markdown 脚本依赖外部 CDN，访问受限时可能影响样式或渲染；编辑器预览仅在大屏幕布局显示。
- **许可证**：仓库当前未提供 LICENSE 文件；如需明确对外使用、修改与分发条件，应由维护者补充许可证。

## 常见问题

**提示未配置管理员账号**

为目标 Worker 设置 `ADMIN_USER` 和 `ADMIN_PASS`；本地开发则检查 `.dev.vars`。

**运行时报 KV 相关错误**

检查 `wrangler.toml` 是否填写了有效的命名空间 ID，以及绑定名称是否为 `BLOG_KV`。

**用户注册或登录显示“账号服务暂不可用”**

检查 `USER_DB` 是否绑定正确的 D1 数据库，并确认已对对应环境执行 `wrangler d1 migrations apply USER_DB --remote` 或 `--local`；也检查 Workers 运行日志和套餐 CPU 配额。

**保存后前台没有文章**

确认保存时开启了“发布”，并考虑线上 KV 的读取延迟。草稿仅在后台显示。

**文章已保存，但 Markdown 没有渲染或页面样式缺失**

检查浏览器网络请求，确认 Tailwind CSS、Marked 和 Google Fonts 等外部资源可以访问。

