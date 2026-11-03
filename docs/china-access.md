# 让中国大陆的同窗不开 VPN 也能用

同窗的数据存在 Supabase。网页会直接访问 `你的项目.supabase.co`，这个域名从中国大陆访问时快时慢，有时打不开。下面两步做完后：注册不用点邮件里的链接；网站所有的数据请求都改走你自己的域名。

## 第一步：邮件改成验证码（约 3 分钟）

Supabase 后台 → **Authentication** → **Emails**（有的版本叫 Email Templates）。

**Confirm signup**（注册确认）

- Subject：`同窗注册验证码：{{ .Token }}`
- Body：

```html
<h2>欢迎来到同窗</h2>
<p>你的注册验证码是：</p>
<p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
<p>回到注册页面输入它即可，10 分钟内有效。</p>
<p style="color:#888">如果你在国外，也可以直接点这个链接完成验证：<a href="{{ .ConfirmationURL }}">验证邮箱</a></p>
```

**Magic Link**（邮箱验证码登录）

- Subject：`同窗登录验证码：{{ .Token }}`
- Body：

```html
<p>你的登录验证码是：</p>
<p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
<p>回到登录页面输入它即可。不是你本人操作的话，忽略这封邮件就好。</p>
```

保存后，新注册的人在页面上输入验证码就能完成注册。之前卡住的人：在登录页用密码登录，页面会自动转到输入验证码的步骤，点“重新发送”拿新的验证码。

## 第二步：用自己的域名转发数据请求（约 10 分钟）

1. Cloudflare 后台 → **Workers & Pages** → **Create** → 选 **Hello World** 模板 → Deploy → **Edit code**。
2. 把仓库里 `cloudflare/supabase-proxy.js` 的内容整个粘进去，把第一行的 `https://YOUR-PROJECT-ID.supabase.co` 改成你的 Supabase Project URL，点 **Deploy**。
3. 这个 Worker 的 **Settings** → **Domains & Routes** → **Add** → **Custom domain**，填 `api.cwx.world`。Cloudflare 会自动配好 DNS 和证书。
4. 浏览器打开 `https://api.cwx.world/auth/v1/health`，看到一段 JSON 就说明转发通了。（如果提示缺 apikey，也说明通了。）
5. Vercel → 项目 → Settings → Environment Variables，把 `NEXT_PUBLIC_SUPABASE_URL` 改成 `https://api.cwx.world`，然后在 Deployments 里对最新一次部署点 **Redeploy**。

改完之后，登录状态会失效一次，大家重新登录即可。

## 说明

- Cloudflare Workers 免费版每天 10 万次请求，几个人用完全够。
- Cloudflare 在中国大陆通常能访问，但速度比国内服务慢一些；它比直连 Supabase 稳定，但不能保证百分之百。
- 网站本身（study.cwx.world）在 Vercel 上。Vercel 的自定义域名在大陆一般能打开，`*.vercel.app` 域名经常打不开，所以请只分享 cwx.world 的链接。
