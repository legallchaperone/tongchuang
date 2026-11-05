# 开启推送通知（Web Push）

v1.11 起，同窗戳你、邀请你一起专注、给你点赞、评论或在留言板回复你时，**页面关着也能收到通知**。全部免费，不需要 Apple 开发者账号。

- 电脑：Chrome、Edge、Firefox、Safari 都可以。
- iPhone / iPad：要 iOS 16.4 或更新，并且**先把同窗添加到主屏幕**，从主屏幕打开后再开启。
- 对方挂着“😴 睡觉了”时，不会收到戳一下和邀请。

不配置也没关系：设置页不会出现“开启推送”，一切照旧。

## 它怎么工作

```
有人戳你 / 点赞 / 评论 / 留言
  → 数据库触发器（supabase/schema.sql 里的 push_notify）
  → Edge Function `webpush`（supabase/functions/webpush）决定推给谁、写什么
  → 浏览器的推送服务（Apple / Google / Mozilla）
  → 你的设备弹出通知（public/sw.js）
```

## 一次性配置（约 15 分钟）

### 1. 生成密钥

在仓库目录运行：

```bash
node scripts/vapid-keys.mjs
```

它会打印三段内容，下面几步分别用到。**私钥和暗号不要提交到 git，也不要发给别人。**

### 2. 数据库

1. Supabase → **Database → Extensions**，搜索 `pg_net` 并打开。
2. 在 **SQL Editor** 里重新执行一遍 `supabase/schema.sql`（合并到 main 后，GitHub Actions 的 db-migrate 也会自动执行）。
3. 在 SQL Editor 里执行第 1 步打印的最后一段 `insert into public.push_config ...`。把里面的 `<project-ref>` 换成你的项目编号（项目网址 `https://<project-ref>.supabase.co` 中间那一段）。

### 3. Edge Function

安装并登录 Supabase 命令行工具（只需一次）：

```bash
npx supabase login
```

部署函数。`--no-verify-jwt` 是必须的，因为调用它的是数据库，靠暗号认证：

```bash
npx supabase functions deploy webpush --no-verify-jwt --project-ref <project-ref>
```

设置密钥。把第 1 步打印的 4 个值填进去：

```bash
npx supabase secrets set --project-ref <project-ref> VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:你的邮箱 PUSH_SECRET=...
```

也可以在 Supabase → **Edge Functions → Secrets** 里手动添加。

### 4. 网页

Vercel → 项目 → **Settings → Environment Variables**，添加 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`（第 1 步打印的第一段），然后重新部署一次。

### 5. 试一下

1. 打开同窗 → 设置 → 通知 → **开启推送**，允许通知。
2. 关掉页面，让朋友在自习室里戳你一下。
3. Supabase → Edge Functions → `webpush` → **Logs** 里能看到每次调用的结果：`sent`（已发出）、`gone`（设备已失效，已自动删除）、`failed`。

## 常见问题

- **iPhone 上看不到“开启推送”**：先在 Safari 里点分享 → 添加到主屏幕，然后从主屏幕的图标打开。
- **点了开启但提示权限被拒绝**：iPhone 在「设置 → 通知 → 同窗」里打开；电脑在浏览器地址栏左边的站点设置里允许通知。
- **中国大陆**：iPhone 和 Mac 上的 Safari 走 Apple 的推送服务，可以收到；Chrome 走 Google 的推送服务，在大陆通常收不到。
- **换了账号登录**：这台设备会自动转到新账号名下；退出登录时会关闭这台设备的推送。
- **想停用**：在 SQL Editor 里执行 `delete from public.push_config;`，触发器就什么都不做了。

## 测试

```bash
node --test supabase/tests/webpush.test.mjs
```

数据库部分（需要本地 Postgres）：

```bash
PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
```
