# Blog · 轻量个人博客

基于 **Cloudflare Workers + Workers KV** 的个人博客，使用 JavaScript 编写。一个 Worker 同时提供博客前台、管理员后台和文章管理逻辑，无需单独部署后端服务器或关系型数据库。

## 功能

- **文章阅读**：首页展示已发布文章，支持分页和文章详情。
- **文章搜索**：按标题和正文搜索已发布文章，关键词匹配不区分大小写。
- **Markdown 写作**：在后台编辑 Markdown，宽屏下提供实时预览。
- **内容管理**：创建、编辑、删除文章，支持草稿与发布状态切换。
- **管理后台**：查看文章总数、已发布数量和草稿数量。
- **管理员登录**：通过环境中的管理员账号验证身份，使用 Cookie 与 KV 保存登录会话。

当前适合单管理员、低并发写作的个人博客。尚未提供注册、多用户权限、评论、标签分类、图片上传或文章导入导出功能；图片可在 Markdown 中引用外部地址。

## 技术与项目结构

| 部分 | 实现 |
| --- | --- |
| 运行环境 | Cloudflare Workers，ES Module Worker |
| 数据存储 | Workers KV，绑定名称为 `BLOG_KV` |
| 页面生成 | Worker 返回 HTML，普通表单提交与页面跳转 |
| 页面样式 | 通过 CDN 加载 Tailwind CSS |
| Markdown | 浏览器通过 CDN 加载 Marked 并渲染 |
| 字体与图标 | Google Fonts 与 Material Symbols |

| 文件 | 说明 |
| --- | --- |
| [worker.js](./worker.js) | 请求路由、认证、文章读写、页面模板和编辑器 |
| [wrangler.toml](./wrangler.toml) | Worker 入口、兼容日期、公开变量和 KV 绑定 |
| [DEPLOY.md](./DEPLOY.md) | 补充部署说明，使用时请注意下文的部署方式说明 |

仓库目前未提供 `package.json`、锁文件或自动化测试；下方命令会在本地初始化 npm 项目并安装 Wrangler。

## 快速部署到 Cloudflare Workers

### 1. 准备环境

需要：

- 一个可以创建 Workers 和 KV 命名空间的 Cloudflare 账号。
- 可运行 Wrangler 的 Node.js 环境及 npm。
- Git，用于克隆仓库。

```bash
git clone https://github.com/Sdcode12/blog.git
cd blog
npm init -y
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

### 3. 设置博客信息

修改 `wrangler.toml` 中的公开配置，例如：

```toml
[vars]
BLOG_TITLE = "我的博客"
POSTS_PER_PAGE = "10"
```

`POSTS_PER_PAGE` 应填写正整数。首次创建 Worker 时，可先在完成 KV 配置后执行一次 `npx wrangler deploy`，再继续设置管理员 Secrets；配置管理员账号前，后台无法登录。

### 4. 设置管理员账号

通过命令交互输入用户名和密码：

```bash
npx wrangler secret put ADMIN_USER
npx wrangler secret put ADMIN_PASS
```

使用自己设置的账号登录，没有内置默认账号。代码会去掉登录表单中用户名和密码首尾的空白，因此设置凭据时也应避免首尾空白。

### 5. 部署并访问

```bash
npx wrangler deploy
```

使用部署结果提供的访问地址打开博客，再访问 `/login` 登录后台。需要自定义域名时，在 Cloudflare 中为该 Worker 配置域名。

> **部署方式说明**：当前代码是由 `wrangler.toml` 指定 `worker.js` 为入口的 Workers 项目。现有 `DEPLOY.md` 中“Cloudflare Pages 留空构建命令、输出目录设为 /”的步骤不能直接运行这份 Worker；本 README 以 `wrangler deploy` 部署到 Workers 为准。当前仓库也未提供自动部署工作流。

## 本地开发

本地登录需要单独提供开发凭据，远程 Worker 的 Secrets 不会自动成为本地开发变量。

先将 `.dev.vars` 加入 `.gitignore` 或本地 `.git/info/exclude`，再在项目根目录创建该文件：

```dotenv
ADMIN_USER="local-admin"
ADMIN_PASS="replace-with-a-local-password"
```

然后启动：

```bash
npx wrangler dev
```

访问终端输出的本地地址。默认本地开发使用本地模拟的 KV 数据，与线上 KV 分开。开发凭据应与线上凭据分开；不要提交 `.dev.vars`、`node_modules/` 或 `.wrangler/`。

## 配置参考

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `BLOG_KV` | KV 绑定 | 是 | 保存文章、文章索引与登录会话 |
| `ADMIN_USER` | Secret | 后台登录必需 | 管理员用户名 |
| `ADMIN_PASS` | Secret | 后台登录必需 | 管理员密码 |
| `BLOG_TITLE` | 公开变量 | 否 | 代码默认值为 `Chronicle`；仓库配置为 `My Blog` |
| `POSTS_PER_PAGE` | 公开变量 | 否 | 首页每页文章数，默认 `10` |

代码中虽然读取了 `BLOG_DESC`，但目前没有将其输出到页面，设置该变量不会显示博客简介。

## 使用方法

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
| GET | `/logout` | 删除当前会话并清除 Cookie | 否 |
| GET | `/admin` | 文章管理与统计 | 是 |
| GET / POST | `/admin/new` | 新建文章页面 / 保存文章 | 是 |
| GET / POST | `/admin/edit/:slug` | 编辑页面 / 保存修改 | 是 |
| POST | `/admin/delete/:slug` | 删除文章 | 是 |

以上是 HTML 页面与表单路由，当前未提供独立的 JSON REST API。后台受保护的请求在会话无效时会跳转到 `/login`。

## 数据与登录机制

### KV 数据

| Key | 内容 |
| --- | --- |
| `articles:index` | 文章索引数组，包含 `slug`、标题、创建时间与发布状态 |
| `article:<slug>` | 完整文章，包含标题、Markdown 正文、标识、创建和更新时间、发布状态 |
| `session:<token>` | 登录会话，保存 `expiresAt`，同时设置 KV 过期时间 |

新文章的 `slug` 由标题转换结果加时间后缀生成，之后编辑标题不会改变文章地址。首页按索引顺序展示，新文章插入最前面；编辑已有文章不会把它移到最前面。

### 登录流程

1. 浏览器向 `POST /login` 提交用户名和密码。
2. Worker 将其与 `ADMIN_USER`、`ADMIN_PASS` 直接比较。
3. 验证成功后，使用 `crypto.getRandomValues` 生成 32 字节随机 Token，以 64 位十六进制字符串表示。
4. Worker 将会话写入 KV，并返回名为 `session` 的 Cookie；两者有效期均为 24 小时。
5. 后续后台请求读取 Cookie，查询对应 KV 会话并检查 `expiresAt`。这是一种服务端会话机制，不使用 JWT 或刷新 Token。
6. 退出登录时，删除对应 KV 会话并清除浏览器 Cookie。

## 当前限制与维护注意事项

- **凭据与会话**：管理员凭据应通过 Secrets 配置。当前 Cookie 设置了 `HttpOnly` 和 `SameSite=Lax`，尚未设置 `Secure`；也未实现登录限流或独立的 CSRF Token 校验。正式使用前应结合部署环境进行加固。
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

**保存后前台没有文章**

确认保存时开启了“发布”，并考虑线上 KV 的读取延迟。草稿仅在后台显示。

**文章已保存，但 Markdown 没有渲染或页面样式缺失**

检查浏览器网络请求，确认 Tailwind CSS、Marked 和 Google Fonts 等外部资源可以访问。
