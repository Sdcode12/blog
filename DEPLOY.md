# 部署与升级说明

本项目部署到 **Cloudflare Workers**，由 `wrangler.toml` 指定 `worker.js` 入口，不是静态 Cloudflare Pages 项目。完整配置说明见 [README](./README.md)。

## 前置条件

- Cloudflare 账号，可创建 Workers、Workers KV 和 D1 数据库。
- Node.js 24 或更高版本、npm 和 Git。
- 使用 HTTPS 访问线上站点。

## 首次部署

### 1. 下载并准备工具

```bash
git clone https://github.com/Sdcode12/blog.git
cd blog
npm install --save-dev wrangler
npx wrangler login
```

### 2. 创建文章存储

```bash
npx wrangler kv namespace create BLOG_KV
```

将返回的 ID 填入 `wrangler.toml` 的 `[[kv_namespaces]]` → `id`。绑定名称保持 `BLOG_KV`。

### 3. 创建用户数据库

```bash
npx wrangler d1 create blog-users
```

将返回的数据库 ID 填入 `wrangler.toml` 的 `[[d1_databases]]` → `database_id`，替换全零占位值。绑定名称保持 `USER_DB`，数据库名称保持 `blog-users`。

```bash
npx wrangler d1 migrations apply USER_DB --remote
```

此迁移创建 `users`、`user_sessions` 和 `auth_rate_limits` 表。迁移目录为 `migrations/`。

### 4. 配置并部署 Worker

在 `wrangler.toml` 中设置 `BLOG_TITLE` 和正整数 `POSTS_PER_PAGE`，然后部署：

```bash
npx wrangler deploy
```

### 5. 设置管理员凭据

```bash
npx wrangler secret put ADMIN_USER
npx wrangler secret put ADMIN_PASS
```

通过交互输入自己的用户名和密码，不要写入代码、README 或 `wrangler.toml`。设置前管理员无法登录；普通用户注册不依赖这两个 Secrets。可以再次执行 `npx wrangler deploy` 更新代码。

## 已有博客升级

1. 拉取最新代码，保留线上已有的 `BLOG_KV` 命名空间 ID、Worker 名称、公开变量和管理员 Secrets。
2. 创建 D1 数据库 `blog-users`，填写 `USER_DB` 绑定的真实数据库 ID。
3. 执行 `npx wrangler d1 migrations apply USER_DB --remote`。
4. 执行 `npm test`，再运行 `npx wrangler deploy`。
5. 在部署地址验证下方流程。

文章与管理员会话仍在原来的 KV 中，无需迁移。普通用户数据存入新 D1 数据库。未配置 D1 或未执行迁移时，账号请求可能返回 503，前台文章阅读仍可用。

## 本地开发

根目录的 `.dev.vars` 可配置本地管理员凭据：

```dotenv
ADMIN_USER="local-admin"
ADMIN_PASS="replace-with-a-local-password"
```

`.gitignore` 已排除此文件，仍请使用与线上不同的密码。

```bash
npx wrangler d1 migrations apply USER_DB --local
npx wrangler dev
```

本地 KV、D1 数据与线上分离，`--local` 不会初始化线上数据库；`--remote` 也不会初始化本地数据库。访问终端输出的地址即可调试。

## 部署后验证

- `/`：能阅读已有文章，未登录时右上角有登录和注册入口。
- `/register`：填写用户名及两次密码，注册成功后自动进入个人中心。
- `/user/login`：普通用户可以登录；重复用户名、错误密码应有明确提示。
- `/account`：展示当前用户，退出后再次访问会要求登录。
- `/admin`：普通用户登录后仍无法进入管理员后台。
- `/login`：原有管理员账号仍可登录并管理文章。

账号密码要求、会话有效期、限流规则及测试覆盖见 [README](./README.md)。本地测试不替代 Cloudflare 线上验证，密码派生还需确认目标 Workers 套餐的 CPU 配额足够。

## 域名和数据维护

可在 Cloudflare 中为 Worker 绑定自定义域名。需要备份文章时导出 KV，需要备份普通用户时备份 D1；Git 仓库只保存代码与迁移。

用户账号当前不支持自助找回密码或删除账号。修改管理员 Secrets 不会更改普通用户密码，也不会撤销已有管理员会话。
