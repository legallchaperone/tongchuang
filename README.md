# 同窗

和隔着时差的朋友一起专注学习的 Web 应用（可安装到手机桌面）。像素风：每个人有一张自己的小书桌，专注时小人坐在桌前写字、台灯亮着；窗外是主人当地的天色，墙上的钟走的是主人当地的时间。

- **专注**：番茄钟 / 正计时，全屏专注页的背景跟随你当地的时间（深夜、清晨、白天、傍晚），环境声（雨声、棕噪音、海浪），屏幕常亮，结束时给专注度打分、写一句复盘。
- **实时陪伴**：同窗此刻在做什么、还剩几分钟、对方当地几点；专注页底部显示“此刻也在书桌前”的人。可以戳一下、邀请一起开番茄钟、给对方的记录点赞，后台时有系统通知。
- **目标与进度**：每日目标进度环、连续天数、本周与上周对比、科目分类。
- **数据**：7/30/90/365 天的每日堆叠柱状图、一年热力图、一天中的节奏（最常学的时段与自评专注度）、科目分布、同窗对比、自动小结、记录明细。
- **跨时区**：每个人的“今天”按自己的当地日期算；自习室里有时差带，把每个人的昼夜和常学时段画在你的时间轴上，标出大家都醒着的时段。

## 本地运行

```bash
npm install
```

```bash
npm run dev
```

不配置任何环境变量时进入**演示模式**：生成两位模拟同窗和几个月的示例数据，只保存在浏览器里。

## 部署（约 15 分钟，免费额度够用）

1. 在 [supabase.com](https://supabase.com) 新建项目。
2. 打开 SQL Editor，粘贴 `supabase/schema.sql` 全部内容执行（以后更新也是重新执行一遍，脚本可重复运行）。
3. Authentication → URL Configuration：把 Site URL 设为你的网站地址（例如 `https://tongchuang.vercel.app`），并加入 Redirect URLs。
4. Project Settings → API，复制 Project URL 和 anon public key。
5. 把这个仓库推到 GitHub，在 [vercel.com](https://vercel.com) 导入，添加环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. 部署完成后注册账号 → 自习室 → 新建 → 复制邀请链接发给朋友。

## 结构

```
app/(main)/          今天、自习室、数据、设置（带侧边栏的页面）
app/focus/           全屏专注
app/login, app/join  登录、邀请链接
lib/backend/         数据层：supabase.ts（线上）与 demo.ts（演示），同一接口
lib/store.tsx        全局数据与实时订阅
lib/focus.tsx        计时引擎（刷新页面不丢失，状态同步给同窗）
lib/stats.ts         统计（按各自时区分日）
lib/time.ts          时区工具
supabase/schema.sql  表结构、行级权限、实时订阅
```

## 美术与字体

- 角色、房间、图标都是代码里的像素图（`lib/pixel.ts`、`components/Pixel.tsx`），原创绘制，没有使用任何游戏素材。
- 字体：[Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font) 12px 简体中文，SIL OFL 1.1 授权，按字符分片放在 `public/fonts/fusion12/`，只加载用到的字。

## 权限模型

只有和你在同一个自习室的人能看到你的资料、状态和记录；每个人只能修改自己的数据。戳一下/邀请走 Supabase Realtime 广播。
