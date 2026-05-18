# 部署说明

## 前置条件

- 一个 Cloudflare 账号
- Node.js 已安装（用于 wrangler CLI）

## 步骤

### 1. 安装依赖

```bash
cd blog
npm init -y
npm install wrangler
```

### 2. 登录 Cloudflare

```bash
npx wrangler login
```

### 3. 创建 KV 命名空间

```bash
npx wrangler kv namespace create BLOG_KV
```

命令执行后会输出一个 ID，将其填入 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "BLOG_KV"
id = "这里粘贴你得到的ID"
```

### 4. 设置环境变量

在 Cloudflare Dashboard 中设置（不要写在代码里）：

**路径：** Workers & Pages → 你的项目 → Settings → Variables and Secrets

| 名称 | 类型 | 说明 |
|------|------|------|
| `ADMIN_USER` | Secret | 管理员用户名 |
| `ADMIN_PASS` | Secret | 管理员密码 |
| `BLOG_TITLE` | Variable | 博客标题（可选，默认 Chronicle） |
| `POSTS_PER_PAGE` | Variable | 每页文章数（可选，默认 10） |

### 5. 部署

#### 方式 A：命令行直接部署

```bash
npx wrangler deploy
```

#### 方式 B：通过 GitHub 自动部署（Cloudflare Pages）

1. 将项目推送到 GitHub
2. Cloudflare Dashboard → Workers & Pages → Create → Connect to Git
3. 构建设置：
   - Build command：留空
   - Build output directory：`/`
4. 部署后在项目 Settings 中：
   - Functions → KV namespace bindings → 变量名填 `BLOG_KV`，选择你创建的 namespace
   - Environment variables → 添加上面表格中的变量

### 6. 绑定自定义域名（可选）

Dashboard → Workers & Pages → 你的项目 → Settings → Domains & Routes → Add → Custom Domain

输入你的域名即可（域名需已托管在 Cloudflare）。

## 使用

| 地址 | 说明 |
|------|------|
| `/` | 博客首页 |
| `/search?q=关键词` | 搜索文章 |
| `/login` | 管理员登录 |
| `/admin` | 后台管理（需登录） |
| `/admin/new` | 写新文章 |

## 注意事项

- `ADMIN_USER` 和 `ADMIN_PASS` 必须设置为 Secret 类型，不要写在 `wrangler.toml` 或代码中
- KV namespace ID 不是敏感信息，可以安全地写在 `wrangler.toml` 中
- 文章内容使用 Markdown 格式编写，前台自动渲染为 HTML
