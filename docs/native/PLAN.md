# 同窗 macOS / iOS 原生 App 实现计划

> 状态：**v0.2 · 已审阅** · 2026-11-05 · 配套图：同窗原生版 System Design Map（artifact）
> 范围：iPhone、Mac、小组件、灵动岛 / Live Activity、Mac 菜单栏。网页版继续保留，三端共用同一个 Supabase 后端。
> v0.1 → v0.2 的改动见文末「审阅记录」。

---

## 0. 一句话方案

**SwiftUI 多平台原生 App + 共享的颜色和像素数据 + 先把后端改成“多设备友好”：计时由服务器裁决，通知由服务器推送。**
品牌层（书桌场景、小人、9 宫格面板、计时数字）自己画；系统层（导航、弹窗、菜单、设置、输入）用原生控件，只换颜色和字体。

整个原生版的地基是 **R-006 跨设备计时**。它不是“把 localStorage 换成一张表”：三台设备同时在线时，谁来推进阶段、谁的时钟算数、两台同时开始怎么办，都必须在阶段 0 定下来。

---

## 1. 关键决策

| # | 决策 | 选择 | 理由 | 放弃的方案 |
|---|---|---|---|---|
| D1 | 技术路线 | SwiftUI，iOS 17+ / macOS 14+ 单一多平台 target；**MVP 只勾 iPhone + Mac**，iPad 以兼容模式运行 | 小组件、Live Activity、菜单栏只能原生；勾选 iPad 后审核会在 iPad 上测并要求 iPad 截图 | Capacitor/Tauri 套壳；React Native |
| D2 | 代码放哪 | 同一仓库 `native/` | 颜色、像素数据、测试样本和网页共用一份 | 单独仓库 |
| D3 | 业务逻辑 | 纯函数移植成 Swift，用 TS 生成的 JSON 样本对拍；**先把 localStorage / DOM 依赖剥离出去** | 约 760 行，逻辑稳定；扩展进程有内存限制 | JavaScriptCore 运行 TS；搬到 Postgres |
| D4 | 像素美术 | 数据抽成 JSON，渲染器各写一份；**半透明叠加预先算成不透明颜色**，金样逐像素比对 | Canvas2D 和 CoreGraphics 的 alpha 混合取整不一致；去掉混合后可以要求零差异 | 导出 PNG 序列；允许误差（会掩盖真错误） |
| D5 | 计时状态 | **服务器裁决**：所有开始、暂停、继续、结束、转休息都走 Postgres 函数 `focus_transition()`，用 `now()` 计时，带版本号做乐观锁；只有“持有设备”能操作 | 消除重复记录、静默覆盖和时钟偏差 | 各端各记；只把状态镜像到表里（v0.1 的方案） |
| D6 | 推送 | `device_tokens`（含 Live Activity 的 push-to-start token 和活动 token）+ Edge Function 发 APNs；**到点转休息由 pg_cron 在 `planned_end` 触发** | 锁屏不能停在 0:00；在 Mac 上开始时也要能拉起手机的灵动岛 | 客户端定时（后台会被挂起） |
| D7 | 登录 | 邮箱 + 验证码为主，密码保留；**前提是 R-014（Resend 自定义发信）提前到阶段 0** | 原生端没有 `location.origin` 可走魔法链接；验证码需要自定义邮件模板 | 魔法链接 + Universal Links |
| D8 | 大陆访问 | Supabase 地址可配置，默认走 `cloudflare/supabase-proxy.js` 的自有域名 | 和网页一致 | — |
| D9 | 扩展的登录态 | **只有主 App 刷新 token**；小组件 / Live Activity 只读 access token，`autoRefreshToken = false`，过期就用 App Group 缓存 | Supabase 的 refresh token 会轮换，两个进程同时刷新会把用户登出 | 两个进程各自刷新 |

---

## 2. 系统结构

```
┌──────────────────────────── 客户端 ────────────────────────────┐
│ Web (Next.js, Vercel)     iOS App      macOS App               │
│                           ├ Widget Ext (iOS+macOS)             │
│                           ├ Live Activity (iOS)                │
│                           └ MenuBarExtra (macOS)               │
└──────────┬──────────────────────┬──────────────────────────────┘
           │ supabase-js          │ supabase-swift
           ▼                      ▼
     Cloudflare Worker（大陆代理，可选）
           ▼
┌──────────────────────────── Supabase ──────────────────────────┐
│ Auth（Resend 自定义发信，验证码）· Postgres + RLS · Realtime   │
│ 新增 RPC：focus_transition() · delete_account()                │
│ 新增表：signals · device_tokens · focus_private · app_config   │
│ 新增 Edge Function `push`（APNs .p8）                          │
│   ← 数据库 webhook：signals / kudos / comments / guestbook     │
│   ← pg_cron：planned_end 到点 → 转休息 + 更新 Live Activity    │
└────────────────────────────────────────────────────────────────┘
```

### 2.1 计时的数据模型（D5 细化）

`live_status` 现有列：state、task、subject_name、subject_color、mode、started_at、planned_end、accumulated_ms、running_since、状态四列（`supabase/schema.sql:58-70, 255-258`）。要成为唯一来源，还需要：

| 新列 | 用途 | 同窗可读 |
|---|---|---|
| `holder_device` | 哪台设备在计时；其他设备只显示“正在手机上专注 · 在这里继续” | 否（放 `focus_private`） |
| `version` | 乐观锁；每次转换 +1，`expected_version` 不符就拒绝 | 是 |
| `subject_id`、`pomos_done`、`focus_min`、`overtime`、`with_user` | 现在只在本机 `FocusState` 里（`lib/focus.tsx:9-28`） | 是 |
| `todo_id`、待复盘记录（`PendingReflection`） | 现在在 localStorage（`PKEY`） | **否**：待办是私有数据，而 “live read” 策略让同窗能读整行（`schema.sql:188`） |

所以私有部分单独建 `focus_private`（RLS 只允许本人读写），公开部分留在 `live_status`。

**`focus_transition(action, expected_version, device_id, payload)`**（security definer）：
- `action` ∈ start / pause / resume / finish / start_break / skip_break / adopt（在这里继续）/ adjust。
- 所有时间戳用数据库的 `now()`，`accumulated_ms` 由函数累加；客户端不再写时间。
- `finish` 和到点结束在**同一个事务**里写 `sessions` + 待复盘记录，保证只有一条。
- 返回新的完整状态和 `server_now`；客户端据此估算本机与服务器的时钟差，用于显示和 Live Activity 的 `Date`。

**到点**：pg_cron 每分钟扫描 `planned_end <= now()` 的行，调用 `focus_transition('auto_complete')`，再交给 Edge Function 推送更新 Live Activity 和通知。客户端在前台时仍会本地播放提示音，但**不再自己推进阶段**。

**离线**：断网时允许本机继续显示计时，操作写进本地队列（write-ahead），重连后按顺序重放；遇到版本冲突时，以服务器为准，并提示“另一台设备已经结束了这次专注”。网页现在离线也能计时，这一条不能倒退。

**网页同步要改的地方**：`lib/store.tsx:378-380` 现在“自己的 live 以本机为准，忽略服务器副本”，R-006 之后要反过来；`lib/backend/supabase.ts:257-262` 的 `setLive` 无条件 upsert，要换成 RPC。

**老用户迁移**：网页升级后第一次打开，如果 localStorage 里有进行中的专注，且服务器上没有，就用 `adopt` 把它交给服务器；两边都有时提示选择。

### 2.2 原生代码分层（Swift Package，`native/Packages/`）

| 包 | 内容 | 对应网页 | 谁会用 |
|---|---|---|---|
| `TCCore` | 模型、时区与统计、状态、收工、徽章 | `lib/types.ts`、`time.ts`、`stats.ts`、`review.ts`、`status.ts`、`badges.ts` | App、扩展 |
| `TCBackend` | `Backend` 协议 + `SupabaseBackend` + `DemoBackend`（读 TS 生成的 JSON 快照，不移植 690 行的生成器） | `lib/backend/*` | App；扩展只读 |
| `TCFocus` | 调用 `focus_transition`、时钟差校正、离线队列、`ActivityAttributes`、AppIntents | `lib/focus.tsx`、`focusModes.ts` | App、扩展 |
| `TCPixel` | 像素网格、角色、书桌、勋章、蛋糕图（输出 `CGImage`，能在扩展的内存限制内运行） | `lib/pixel.ts`、`badges.ts#medalGrid`、`cake.ts` | 全部 |
| `TCDesign` | 颜色、间距、字号档；`PixelFont`；`PixelPanel`、`PixelButton` 等 | `app/globals.css` | App、扩展 |
| `TCSound` | 环境声混音（`AVAudioEngine`） | `lib/sound.ts` | App |

**移植前要剥离的副作用**：`status.ts:86-90`（localStorage + `window.dispatchEvent`）、`focusModes.ts:59-62`（localStorage）、`cake.ts:84 drawCake`（canvas）。纯计算和存储、绘制分开后，两端都只移植纯计算部分。

### 2.3 共享数据（`design/`）

```
design/
  tokens.json        颜色（日间 / 夜间）、间距、像素单位、字号档
  pixel/palette.json 皮肤、发色、衣服、场景颜色（含预先算好的半透明叠加结果）
  pixel/hair.json    HAIR_STYLES 网格
  pixel/fixtures/    金样：SceneOpts → PNG（由网页端渲染生成）
  logic/fixtures/    对拍样本：sessions/tz/now → stats/streak/workDay
scripts/design-gen.mjs
```

**MVP 阶段的 token 管线只做“校验”，不重写 CSS**：`globals.css` 有 1231 行，包含 data-URI 的 SVG 边框和 `calc()` 多边形（`globals.css:6, 27`），不适合生成。脚本只做两件事：生成 Swift 颜色，并检查 CSS 里的 `--panel` 等变量和 `tokens.json` 一致，不一致就构建失败。

---

## 3. Design System 规则

### 3.1 两层

- **品牌层（自己画）**：`DeskScene`、`Avatar`、`PixelPanel`、`PixelButton`、`SubjectChip`、`StatTile`、`Heatmap`、`TimerDisplay`、`Sticker`、`Medal`、`ShareCard`。
- **系统层（原生，只换皮）**：`NavigationSplitView`（Mac）/ `TabView`（iPhone，中间是专注按钮）、`.sheet`、`.confirmationDialog`、`Menu`、`.contextMenu`、`Picker`、`Toggle`、`TextField`、Mac 的 `Settings` 场景和菜单命令。

### 3.2 像素单位

- 1 个美术像素 = 整数个 pt，只按整数倍放大：iPhone 今天页的书桌 3pt（288×240pt）；在 iPhone SE / mini（320–375pt 宽）上减去 16pt 边距后放不下，就**降到 2pt**（192×160）。Mac 自习室 2pt；小组件 1–2pt。
- 灵动岛 / 锁屏**复用现有的 `portrait()`**（16×15，`lib/pixel.ts:503`），不另画。
- 所有像素图 `.interpolation(.none)`。
- 9 宫格和网页保持一致：网页是 `border-image … 4 fill / 8px / 0 stretch`（`globals.css:88`），即切片 4 像素、2 倍显示、**拉伸**。SwiftUI 用 `resizable(capInsets: 4×倍数, resizingMode: .stretch)`。
- 放不下时改变布局，不做非整数缩放。

### 3.3 字体

- 清晰字号（pt）= `12 × k / 屏幕倍率`：@3x 是 4 的倍数（12、16、20、24），@2x 是 6 的倍数（12、18、24）。
- **这只在“整数倍渲染”的屏幕上成立。** MacBook Air 13/15 的默认显示缩放、iPhone 的“放大显示”都不是整数倍；SwiftUI 的文字原点也不吸附像素。承诺改为“整数倍屏下清晰”，验收时专门在 Air 默认分辨率上看一次。
- `PixelFont.size(for: textStyle)`：先取 Dynamic Type 给的字号，再吸附到当前屏幕最近的清晰档。长文字和辅助功能大字号用苹方。设置里提供“界面字体：像素 / 系统”。
- 需要从上游下载完整 OTF（仓库里只有按字符切片的 woff2），按 OFL 1.1 附许可证。

### 3.4 颜色与主题

- 日间 / 夜间对应系统的 Light / Dark。增强对比度主题**移出 MVP**：网页目前没有这套主题（没有 `prefers-contrast`），以后两端一起做。
- 场景天色由主人当地时间决定，和界面主题无关。

### 3.5 动效

- App 内书桌 170ms 一帧，`TimelineView(.periodic)`；不在屏幕上的不画；“减弱动态效果”打开时只显示静止帧。
- 小组件、Live Activity 不能逐帧动画：静态图 + 系统计时文字。

### 3.6 无障碍

- 书桌场景是画出来的图，对 VoiceOver 不可见。每张书桌用 `.accessibilityElement(children: .ignore)` + `accessibilityLabel`（“林舟，专注中，算法 LeetCode”）+ `accessibilityValue`（“已专注 42 分钟，纽约 21:38”），文案和网页的 `aria-label`（`components/Pixel.tsx:58`）保持一致。
- 计时器用 `accessibilityValue` 报剩余时间，不要每秒朗读。

### 3.7 Live Activity 的系统限制（设计时就要考虑）

- 系统在 **8 小时**后结束 Live Activity，**12 小时**后从锁屏移除。心流模式挂一整天会撞上限制：到 8 小时前自动结束，并提示“还在学吗？”。
- 图片不能从网络加载，只能用扩展包里的资源或 App Group 里预先渲染好的图。
- 推送内容（content-state）不超过 4KB。
- 在 Mac 或网页上开始专注、手机在后台时，只能靠 **push-to-start**（iOS 17.2+）拉起灵动岛；需要单独的 token。

---

## 4. 分阶段计划

工作量按一个熟悉 SwiftUI 的人估算，是粗略区间；第 1 阶段结束后按实际速度修正。

### 第 0 天 · 立刻开始的手续
- **注册 Apple 开发者账号**。APNs 的 .p8 密钥、App Group、Keychain 共享、TestFlight 都依赖它；用组织名义注册需要邓白氏编码，可能要几周。
- 申请 Bundle ID、App Group、APNs 密钥。

### 阶段 0 · 后端与共享数据（网页仓库内，约 3–4 周）

1. **R-014 Resend 自定义发信**，邮件模板里加 `{{ .Token }}`，网页先切换到验证码登录。
2. **R-006 跨设备计时**（第 2.1 节）：`live_status` 加列，新建 `focus_private`，实现 `focus_transition()`、pg_cron 到点任务、网页改为调用 RPC、离线队列、老用户迁移。
3. **`signals` 表替换公开 broadcast**：现在 `user:<id>` 是公开的 broadcast 频道（`lib/backend/supabase.ts:376-391`），任何人拿着 anon key 就能伪造“戳一下”。RLS 用 `shares_room(from, to)` 校验，并加频率限制（比如同一人每分钟最多 3 次）。这既是推送的前提，也是安全修复。
4. **`device_tokens` 表**：`user_id`、`device_id`、`platform`、`apns_token`、`push_to_start_token`、`activity_token`、`env`、`updated_at`；RLS 只能写自己的。
5. **Edge Function `push`**（service role）：普通通知和 Live Activity 更新（`apns-push-type: liveactivity`，topic 为 `<bundle>.push-type.liveactivity`）。payload 只放必要字段；对方挂着“睡觉了”时不推戳一下；收到 410 删除 token。
6. **`delete_account()`**：通过 Edge Function 调用 Admin API 删除用户（避免在 RPC 里直接删 `auth.users` 带来的权限问题）。App Store 要求 App 内可以删除账号，网页设置页同步加入口。
7. **共享数据**：`tokens.json`（只管颜色和间距，加 CSS 校验）、`pixel/*.json`（含预先算好的不透明叠加色）；网页改为读取 JSON，截图对比无变化。
8. **金样和对拍样本**：Playwright 跑 `drawScene` / `character` / `medalGrid` 约 50 组；逻辑样本覆盖跨午夜、早上 5 点换日、夏令时开始时“不存在的 02:30”和结束时“重复的 01:30”。
9. **兼容约定**：数据库改动必须向后兼容至少一个 App 版本；`app_config` 表存最低版本，太旧时提示更新。

**完成标准**：网页上线 v1.11（验证码登录、跨设备计时、删除账号、signals）；网页上两个标签页同时操作也只产生一条记录；Edge Function 能把通知推到测试设备。

### 阶段 1 · 地基、一张书桌、Live Activity 试验（约 3 周）

1. Xcode 工程：多平台 App + Widget Extension；App Group；Keychain access group；按 D9 配置扩展的只读登录态。
2. `TCDesign`、`TCPixel`（金样零差异）、`TCCore`（对拍全过）。
3. `TCBackend`：DemoBackend（JSON 快照）→ SupabaseBackend 的登录（验证码）、资料、自习室、实时订阅。
4. **技术试验（spike）**：Mac 网页上开始专注 → 服务器 → push-to-start → 锁着的 iPhone 上出现灵动岛 → pg_cron 到点 → 灵动岛切到休息。这是整个项目最大的技术风险，放在这里先验证。
5. 组件预览页（Xcode Previews）作为 design system 文档。

**完成标准**：真机登录后看到同窗的书桌，实时变化，和网页逐像素一致；spike 跑通。

### 阶段 2 · 专注闭环 + 最小引导（约 3–4 周）

1. **最小新手引导**：名字、时区、默认形象。数据库触发器只建了默认 profile（名字取邮箱前缀，时区用默认值，`schema.sql:139-147`）；时区不对时，“今天”会算错，所以引导不能等到最后。
2. 专注页：三种模式、调整时长、复盘、记录只能改短。
3. Live Activity + 灵动岛 + AppIntent 按钮；8 小时前自动结束。
4. 本地通知作为推送的兜底；时钟差校正。
5. 环境声：Info.plist 声明 `audio` 后台模式；只有在播放环境声时才激活 `AVAudioSession`。没有声音时 App 在后台会被挂起，阶段推进完全依赖服务器。
6. 专注时屏幕常亮。

**完成标准**：手机上开始 → 锁屏和灵动岛计时 → Mac 上“在这里继续” → 手机上的灵动岛自动结束 → 到点自动转休息（手机全程锁屏）→ 复盘，记录只有一条。

### 阶段 3 · 社交与推送（约 2 周）

1. 动态、👏🔥💪、评论；戳一下、邀请一起开番茄钟。
2. 推送权限在第一次有意义的时候再申请（比如第一次被戳、第一次邀请别人）。
3. 深链路由；个人状态；收工。
4. Realtime 的 DELETE 事件不带过滤（`supabase.ts:320`），Swift 端按 id 忽略不认识的记录。

**MVP（第 0 天 + 阶段 0–3 + TestFlight 和审核等待）约 12–14 周。**

### 阶段 4 · Mac 专属（约 1–2 周）

1. 侧边栏布局，三列自习室。
2. `MenuBarExtra`：计时和谁在书桌前；单色像素模板图标。
3. 快捷键：⌘N 开始专注、**⌘. 暂停**（空格会和文本输入冲突）。
4. App Sandbox + `com.apple.security.network.client` 权限。
5. 可选：始终置顶的小书桌窗口。

### 阶段 5 · 小组件与控制中心（约 2 周）

1. 今日进度（小）、同窗书桌（中）、一年长势（大）；数据来自 App Group 缓存，界面写“几分钟前”。
2. 交互式小组件：一键开始上次的专注（调用 `focus_transition`）。
3. iOS 18 控制中心按钮。

### 阶段 6 · 数据页、主页、分享图、完整引导（约 3 周）

1. 数据页（Swift Charts）、个人主页、留言板、贴纸。
2. 分享图（`dayCard`、`shareCard`、`profileCard`，合计约 1000 行），用 `ImageRenderer` 重画。
3. 完整的捏小人引导。

### 阶段 7 · 上架（约 1–2 周，审核等待另计）

1. 像素风 App 图标（1024 大图单独设计）；隐私清单 `PrivacyInfo.xcprivacy`；隐私标签。
2. TestFlight 先给现有自习室的朋友。
3. 中国大陆区上架需要 ICP 备案（见第 6 节）。

**完整版总量约 22–26 周。**

---

## 5. 测试策略

| 层 | 方法 |
|---|---|
| 像素渲染 | 金样逐像素比较，零差异（叠加色已预先算成不透明）；Swift 版的伪随机数生成器用 `&*` / `&+` 溢出运算，和 TS 的 32 位行为一致（`pixel.ts:242`） |
| 业务逻辑 | TS 生成的对拍样本；`zonedToUtc` 在夏令时缺口上的结果要和 Swift 的 `Calendar` 对齐，按 TS 的结果为准 |
| 计时并发 | 数据库层测试：两台设备同时 start / finish、版本冲突、pg_cron 和手动结束同时发生；断言只产生一条记录 |
| 时钟 | 把测试设备的时钟调快或调慢 5 分钟，计时显示仍然正确 |
| 接力 | 手工清单：网页 ↔ iPhone ↔ Mac 三个方向各开始、暂停、结束一次，包括手机锁屏的情况 |
| 推送 | APNs sandbox；Live Activity 推送；token 失效清理；“睡觉了”时不推送 |
| 登录态 | App 和小组件同时运行 24 小时，不会被登出 |
| 视觉 | 品牌组件 × 深浅色 × 3 档字号的快照；Air 默认分辨率上人工看一次 |
| 无障碍 | VoiceOver 走一遍今天页和专注页 |

---

## 6. 需要你决定的事

1. **开发者账号**：个人还是组织名义？组织需要邓白氏编码，耗时更长。这件事要**最先**定。
2. **大陆区上架**：要不要做 ICP 备案？不做的话，App 先上其他区，大陆用户继续用网页。
3. **iPad**：MVP 先不做专门适配（以兼容模式运行）。以后要不要做？
4. **最低系统版本**：iOS 17 / macOS 14（推荐）。push-to-start 需要 17.2，低于 17.2 的设备上，在别的设备开始专注时不会拉起灵动岛。
5. **网页的定位**：App 上架后，网页仍是完整功能的主产品，还是逐步变成“没装 App 时的入口”？

---

## 7. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 多设备计时并发 | 重复记录、时长算错 | 服务器裁决 + 版本号 + 单事务写记录；阶段 0 先在网页上跑通 |
| Live Activity 推送链路复杂 | 锁屏计时停住或不出现 | 阶段 1 先做 spike；本地通知兜底 |
| 扩展和主 App 互相刷新 token | 用户被登出 | 只有主 App 刷新（D9）；做 24 小时测试 |
| 两端像素或逻辑漂移 | 朋友在不同端看到不同的画面或数字 | 金样和对拍样本进 CI；改 TS 必须重新生成样本 |
| 旧版 App 不兼容新数据库 | App 突然坏掉 | 向后兼容 + 最低版本提示 |
| R-014、开发者账号这类外部依赖拖延 | 阶段 0 / 1 卡住 | 第 0 天就启动 |
| 像素字在非整数倍屏上发虚 | 观感变差 | 承诺范围写清；提供系统字体开关 |
| ICP 备案周期 | 大陆区上架推迟 | 先上其他区 |

---

## 审阅记录

### v0.2（2026-11-05）· 按 Fable 5.1 的审阅修改

审阅意见都对照代码核实过。v0.1 把 R-006 当成“把 localStorage 换成一张表”，低估了多设备计时的并发、时钟和阶段推进问题；另外有几处和 Apple 平台的实际行为不符。主要改动：

**必须改（已改）**
1. 阶段推进由谁负责：改为服务器的 `focus_transition()` + 版本号 + pg_cron（D5、2.1）。依据：`lib/focus.tsx:160-185` 由每个客户端各自推进阶段；`supabase.ts:257-262` 无条件 upsert。
2. 时钟偏差：时间戳由服务器写，客户端估算时钟差（2.1）。
3. 验证码登录依赖还没做的 R-014：提前到阶段 0（D7）。
4. 开发者账号排在阶段 7，但阶段 0 就要用：改为第 0 天办理。
5. `live_status` 缺列，而且待办是私有数据：补列，私有部分放 `focus_private`；网页 `store.tsx:378-380` 的逻辑要反过来。
6. 半透明像素会导致金样对不上：`pixel.ts` 有 9 处 `rgba`，叠加色预先算成不透明颜色（D4）。
7. Live Activity 的限制：8 / 12 小时、push-to-start、4KB、不能加载网络图片（3.7）。
8. refresh token 轮换导致扩展把用户登出：只有主 App 刷新（D9）。

**建议改（已改）**：剥离 localStorage 和 DOM 副作用；字体清晰的承诺限定在整数倍屏；9 宫格改为 stretch；token 管线先只做校验；更正后台音频的说法；最小引导提前到阶段 2；MVP 不勾 iPad；signals 作为安全修复（公开 broadcast 可以被伪造）；工期上调；Live Activity spike 提前到阶段 1。

**可以考虑（已采纳）**：VoiceOver；`delete_account` 改用 Edge Function；Mac Sandbox 权限和 ⌘. 快捷键；离线队列；Realtime DELETE 事件需按 id 过滤。

**工期变化**：MVP 从 8–10 周调到 12–14 周，完整版从 15–20 周调到 22–26 周。
