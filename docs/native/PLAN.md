# 同窗 Mac 原生 App 实现计划（零成本版）

> 状态：**v0.3** · 2026-11-05 · 配套图：同窗原生版 System Design Map（artifact）
> 方向：**不付 Apple 开发者年费**。做 Mac 原生 App，从 GitHub Releases 免费发给朋友；iPhone 上的朋友继续用网页版（PWA），并加上 Web Push 推送。
> 以后想做 iPhone 原生版（灵动岛、小组件、App Store），再开通 99 美元的账号，按 v0.2 的 iOS 部分补上，见第 9 节。

---

## 0. 一句话方案

**SwiftUI 写一个常驻菜单栏的 Mac App，GitHub Actions 免费构建并发布，Sparkle 自动更新；后端改成服务器裁决计时，网页、Mac、手机网页三端同步。**

品牌层（书桌、小人、9 宫格面板、计时数字）自己画；系统层（窗口、侧边栏、菜单、设置、输入框）用 macOS 原生控件，只换颜色和字体。

---

## 1. 不付钱，Mac 上能做什么

| 能力 | 不付钱 | 说明 |
|---|---|---|
| 朋友安装和运行 | ✅ | 构建时做本机签名（ad-hoc）。朋友第一次打开会被拦，到「系统设置 → 隐私与安全性」点「仍要打开」，只需一次（第 6 节） |
| 菜单栏常驻、主窗口、悬浮小书桌 | ✅ | `MenuBarExtra`、`NavigationSplitView`、`NSPanel` |
| 实时看到同窗状态 | ✅ | supabase-swift Realtime，App 常驻时一直连着 |
| 被戳、被点赞时弹通知 | ✅ | App 常驻，收到 Realtime 事件就弹本地通知（`UNUserNotificationCenter`），**不需要 APNs** |
| 环境声、快捷键、开机自启 | ✅ | `AVAudioEngine`；`SMAppService.mainApp` |
| 自动更新 | ✅ | Sparkle 2，用自己的 EdDSA 密钥签名更新包，不需要 Apple 签名 |
| 公证（notarization） | ❌ | 所以才会有“仍要打开”那一步 |
| App Store、TestFlight、APNs | ❌ | 都需要付费账号；Mac 版用不到 |
| 桌面小组件 | ❓ | 需要 App Group，没有正式签名时能否稳定使用**未验证**，放到最后试验 |

---

## 2. 关键决策

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 平台 | SwiftUI，**只做 macOS 14+**，Apple 芯片和 Intel 通用 | 免费分发只有 Mac 可行；macOS 14 才有 `@Observable` |
| D2 | 构建与发布 | 代码放仓库 `native/`；打 tag 后由 **GitHub Actions macOS 构建机**编译、本机签名、打包 zip，上传到 Releases | 仓库是公开的，Actions 免费；你不用自己手动打包 |
| D3 | 业务逻辑 | 纯函数移植成 Swift，先剥离 localStorage 和 DOM 副作用，用 TS 生成的 JSON 样本对拍 | 同 v0.2 |
| D4 | 像素美术 | 数据抽成 JSON；半透明叠加预先算成不透明颜色；金样逐像素零差异 | 同 v0.2 |
| D5 | 计时状态 | **服务器裁决**：`focus_transition()` + 版本号 + 数据库时间 + pg_cron 到点 | 网页、Mac、手机网页三端同时在线，仍然必需 |
| D6 | 通知 | Mac：Realtime + 本地通知；iPhone 网页：**Web Push**（VAPID，Edge Function 发送）；戳一下改为写进 `signals` 表 | 都免费；`signals` 同时修掉可伪造的问题 |
| D7 | 登录 | 密码登录（现在就能用）+ 魔法链接走自定义 URL scheme `tongchuang://auth`；R-014 做完后加验证码 | 自定义 URL scheme 不需要付费账号，也就不再依赖 R-014 |
| D8 | 大陆访问 | Supabase 地址可配置，默认走 Cloudflare 代理 | 同网页 |
| D9 | 登录态存储 | 存在 `~/Library/Application Support/同窗/` 的文件里，**不用钥匙串** | 本机签名每次更新签名都会变，钥匙串会反复弹窗要密码 |
| D10 | 更新 | Sparkle 2，appcast 放在 GitHub Releases | 通过 Sparkle 下载的更新不会再触发“仍要打开” |

---

## 3. 系统结构

```
┌──────────────── 客户端 ────────────────┐
│ 网页 / PWA（Vercel）   Mac App          │
│  └ iPhone 加到主屏幕    ├ 主窗口         │
│    + Web Push          ├ 菜单栏         │
│                        └ 悬浮小书桌     │
└────────┬───────────────────┬────────────┘
         │ supabase-js       │ supabase-swift
         ▼                   ▼
   Cloudflare Worker（大陆代理，可选）
         ▼
┌──────────────── Supabase ──────────────┐
│ Auth · Postgres + RLS · Realtime       │
│ 新增 RPC：focus_transition()           │
│ 新增表：signals · focus_private ·      │
│        push_subscriptions · app_config │
│ 新增 Edge Function `webpush`           │
│   ← 数据库 webhook / pg_cron 到点       │
└────────────────────────────────────────┘

GitHub：tag → Actions（macOS）→ Releases（zip + Sparkle appcast）
```

### 3.1 计时的数据模型（D5）

和 v0.2 相同，这是三端同步的地基：

- `live_status` 补列：`version`、`subject_id`、`pomos_done`、`focus_min`、`overtime`、`with_user`。
- 私有部分放 `focus_private`（只有本人能读）：`holder_device`、`todo_id`、待复盘记录。原因是 “live read” 策略让同窗能读 `live_status` 整行（`supabase/schema.sql:188`），而待办是私有数据。
- 所有操作走 `focus_transition(action, expected_version, device_id, payload)`：时间用数据库的 `now()`；版本号做乐观锁；结束时在同一个事务里写 `sessions`，保证只有一条记录。
- pg_cron 每分钟处理已到点的专注，并触发 Web Push（“时间到了，休息 5 分钟”）。
- 离线时操作先排队，重连后重放，冲突以服务器为准。
- 网页要改的地方：`lib/focus.tsx:160-185` 不再由客户端推进阶段；`lib/store.tsx:378-380` 不再以本机为准；`lib/backend/supabase.ts:257-262` 的无条件 upsert 换成 RPC。
- 老用户：localStorage 里有进行中的专注时，第一次打开就交给服务器接管（`adopt`）。

### 3.2 Mac App 的结构（`native/`）

```
native/
  TongchuangMac.xcodeproj      App target（macOS 14+，Universal）
  Packages/
    TCCore      模型、时区、统计、状态、收工、徽章（可在 Linux 上编译测试）
    TCPixel     像素网格 → RGBA 缓冲区 → CGImage（核心部分可在 Linux 上编译测试）
    TCBackend   Backend 协议 + SupabaseBackend + DemoBackend（读 JSON 快照）
    TCFocus     调用 focus_transition、时钟差校正、离线队列
    TCDesign    颜色、字号档、PixelFont、PixelPanel、PixelButton
    TCSound     环境声混音
  App/
    AppModel.swift             对应 lib/store.tsx
    Windows/                   主窗口、专注、收工、设置
    MenuBar/                   菜单栏面板
    FloatingDesk/              悬浮小书桌（NSPanel）
.github/workflows/mac-release.yml
```

`TCCore` 和 `TCPixel` 的核心部分不依赖 AppKit，CI 里可以用 `swift test` 跑金样和对拍。

---

## 4. Design System（Mac）

### 4.1 两层
- **品牌层**：`DeskScene`、`Avatar`、`PixelPanel`、`PixelButton`、`SubjectChip`、`StatTile`、`Heatmap`、`TimerDisplay`、`Sticker`、`Medal`、`ShareCard`。
- **系统层**：`NavigationSplitView`（侧边栏可保留木纹背景）、`Settings` 场景、`Menu`、`.contextMenu`、`.sheet`、`Picker`、`TextField`、菜单栏命令。

### 4.2 像素单位
- 1 个美术像素 = 整数个 pt：主窗口自习室 2pt（书桌 192×160pt），今天页的大书桌 3pt（288×240pt），悬浮小书桌 1–2pt，菜单栏面板里的头像用 `portrait()`（16×15，`lib/pixel.ts:503`）。
- `.interpolation(.none)`；9 宫格和网页一致：切片 4 像素、2 倍显示、拉伸（`globals.css:88`）。
- 窗口变宽时增加列数，不缩放图。

### 4.3 字体
- Retina（@2x）屏上清晰字号是 6 的倍数（12、18、24pt）；外接 1x 显示器上是 12 的倍数。
- MacBook Air 13/15 的**默认显示缩放不是整数倍**，像素字会轻微发虚；在这台机器上专门验收，必要时引导用户选“更多空间”或“默认”以外的整数档，或者切换到系统字体。
- 长文字用苹方；设置里提供“界面字体：像素 / 系统”。
- 字体从上游下载完整 OTF，按 OFL 1.1 附许可证。

### 4.4 菜单栏
- 图标：单色像素模板图（18pt 高，`isTemplate = true`），专注时右侧显示计时文字，比如“▮ 24:13”。
- 面板：同窗列表（头像 + 状态 + 时长）、开始 / 暂停 / 结束、今日进度。

### 4.5 颜色、动效、无障碍
- 日间 / 夜间对应系统浅色 / 深色；场景天色按主人当地时间。
- 书桌 170ms 一帧，窗口不可见时停止；跟随“减弱动态效果”。
- 每张书桌提供 VoiceOver 标签，文案和网页 `aria-label` 一致（`components/Pixel.tsx:58`）。

---

## 5. 分阶段计划

工作量是一个人业余开发的粗略估算。

### 阶段 0a · signals + Web Push（网页仓库，约 1–2 周）· 朋友马上能用到
1. `signals` 表替换公开 broadcast（`lib/backend/supabase.ts:376-391`）：RLS 校验 `shares_room(from, to)`，加频率限制。
2. 网页加 service worker 和订阅流程；iPhone 上要先加到主屏幕（iOS 16.4+）才能订阅。在设置页写清楚步骤。
3. `push_subscriptions` 表 + Edge Function `webpush`（VAPID 密钥存在 Supabase secrets）：戳一下、邀请、点赞、评论、留言回复；对方挂着“睡觉了”时不推。

**完成标准**：iPhone 上把同窗加到主屏幕后，App 关着也能收到“林舟戳了你一下”。

### 阶段 0b · 跨设备计时 R-006（网页仓库，约 2 周）
1. 第 3.1 节的全部内容：补列、`focus_private`、`focus_transition()`、pg_cron、网页改用 RPC、离线队列、老用户接管。
2. 到点推送接到 Web Push。

**完成标准**：同一账号开两个浏览器标签页同时操作，只产生一条记录；手机网页锁屏时到点也能收到推送。

### 阶段 0c · 共享数据（约 1 周，可以和 0b 并行）
1. `design/tokens.json`（颜色、间距）+ CSS 一致性校验；`design/pixel/*.json`（含预先算好的不透明叠加色）。
2. 用 Playwright 生成约 50 组金样，再生成逻辑对拍样本（跨午夜、早上 5 点换日、夏令时缺口）。

### 阶段 1 · Mac 地基 + 发布流水线（约 2–3 周）
1. **先打通发布**：Xcode 工程 → GitHub Actions 构建 Universal 包 → 本机签名 → zip → Releases → Sparkle appcast。找一位朋友真实走一遍“下载 → 仍要打开 → 自动更新”。这一步决定整个方案能不能走通，所以放在最前面。
2. `TCDesign`、`TCPixel`（金样零差异）、`TCCore`（对拍全过），在 CI 里跑测试。
3. `TCBackend`：DemoBackend → SupabaseBackend（密码登录、魔法链接回调 `tongchuang://auth`、资料、自习室、Realtime、在线状态）。
4. 今天页：自己和同窗的书桌实时显示。

**完成标准**：朋友装上 v0.1，能登录，能看到大家的书桌实时变化，Sparkle 能把 v0.1 升级到 v0.2。

### 阶段 2 · 专注闭环 + 菜单栏（约 2–3 周）
1. 专注窗口：三种模式、调整时长、复盘、记录只能改短；全部通过 `focus_transition()`。
2. 菜单栏：计时文字、开始 / 暂停 / 结束、同窗列表。
3. 环境声；到点本地提示音和通知。
4. 最小新手引导：名字、时区、默认形象（数据库触发器建的默认资料时区不对，`schema.sql:139-147`）。

**完成标准**：Mac 上开始专注 → 手机网页上看到“正在 Mac 上专注” → 在网页上“在这里继续” → Mac 自动变成只读 → 结束后只有一条记录。

### 阶段 3 · 社交（约 1–2 周）
动态、👏🔥💪、评论、戳一下、邀请一起开番茄钟（都弹本地通知）；个人状态；收工。

**Mac MVP（阶段 0a–3）约 9–13 周。** 其中 0a 做完（约 1–2 周）时，iPhone 上的朋友就能先用上推送。

### 阶段 4 · Mac 体验打磨（约 1–2 周）
悬浮小书桌（始终置顶的 `NSPanel`）、快捷键（⌘N 开始、⌘. 暂停）、开机自启、窗口状态记忆。

### 阶段 5 · 数据、主页、分享图、完整引导（约 3 周）
Swift Charts 数据页、个人主页和留言板、分享图（`ImageRenderer` 重画，存到本地或复制到剪贴板）、捏小人。

### 阶段 6 · 试验：桌面小组件
验证本机签名下 App Group 能否用。能用就做“同窗书桌”中号小组件；不能用就放到付费之后。

---

## 6. 朋友怎么安装（写进 Releases 说明）

1. 打开 Releases 页面，下载 `Tongchuang-x.y.z.zip`，解压后把「同窗」拖进「应用程序」。
2. 双击打开，系统提示“无法验证开发者”，点「完成」。
3. 打开「系统设置 → 隐私与安全性」，拉到下面，点「仍要打开」，输入电脑密码。
4. 以后的更新会在 App 里自动提示，点一下就装好，不用再重复第 2–3 步。

熟悉终端的朋友也可以运行这一行，代替第 2–3 步：

```bash
xattr -dr com.apple.quarantine /Applications/同窗.app
```

---

## 7. 测试策略

| 层 | 方法 |
|---|---|
| 像素渲染 | 金样逐像素零差异；Swift 的伪随机数用 `&*` / `&+` 溢出运算（`pixel.ts:242`）；CI 里跑 |
| 业务逻辑 | TS 生成的对拍样本，重点是时区边界和夏令时 |
| 计时并发 | 数据库层测试：两端同时 start / finish、版本冲突、pg_cron 与手动结束同时发生 |
| 时钟 | 把 Mac 的时钟调快 5 分钟，计时仍正确 |
| 接力 | 网页 ↔ Mac ↔ 手机网页，三个方向各开始、暂停、结束一次 |
| 分发 | 每个大版本在一台“干净”的 Mac 上走一遍第 6 节的安装流程，再测一次自动更新 |
| Web Push | iPhone（加到主屏幕）、Mac Safari、Chrome 各收一次 |
| 视觉 | Retina、1x 外接屏、Air 默认缩放各看一次；深浅色 |

---

## 8. 需要你决定的事

1. **最低系统版本**：macOS 14 Sonoma（推荐）。朋友里有没有更老的 Mac？
2. **Intel Mac**：默认打 Universal 包，两种芯片都支持，包会大一些。
3. **iPhone 朋友的 Web Push**（阶段 0a）要不要先做？它最快见效，而且和 Mac 版互不影响。
4. **App 名称和图标**：「同窗」，像素台灯图标沿用 `public/icon.svg`？

---

## 9. 风险

| 风险 | 应对 |
|---|---|
| Apple 继续收紧未公证 App 的打开方式（macOS 15 已经取消了“右键 → 打开”的绕过方法） | 安装说明随系统版本更新；实在不行再付 99 美元做 Developer ID 签名和公证，代码不用改 |
| 多设备计时并发 | 服务器裁决 + 版本号；阶段 0b 先在网页上跑通 |
| 两端像素或逻辑漂移 | 金样和对拍样本进 CI |
| 仓库以后改成私有 | macOS 构建机对私有仓库按 10 倍消耗免费额度，可能不够用；到时改成在自己 Mac 上用脚本打包 |
| 登录态存在文件里，安全性不如钥匙串 | 文件权限设为仅本人可读；以后有了正式签名再换回钥匙串 |
| 小组件可能做不了 | 已列为试验项，不影响 MVP |

---

## 10. 以后的付费升级路线

开通 Apple 开发者账号（99 美元/年）之后可以增加：
- Mac：Developer ID 签名 + 公证，去掉“仍要打开”这一步；改回钥匙串存储；小组件。
- iPhone 原生 App：灵动岛和 Live Activity、小组件、APNs 推送、TestFlight 和 App Store。具体方案见 v0.2（git 历史里的 `docs/native/PLAN.md`，提交 `8ed8e54`），包括 Live Activity 的 8 小时限制、push-to-start、扩展的 token 刷新、ICP 备案等。

服务器裁决计时、共享像素渲染、`TCCore` 和 `TCBackend` 都能直接复用。

---

## 审阅记录

### v0.3（2026-11-05）· 改为零成本 Mac 原生
- 不付开发者年费：去掉 iOS 原生、APNs、Live Activity、TestFlight、上架、ICP 备案。
- 新增：GitHub Actions 构建发布、Sparkle 自动更新、朋友安装说明、Web Push（iPhone 网页）、魔法链接走自定义 URL scheme、登录态存文件。
- 保留 v0.2 审阅后的核心修正：服务器裁决计时、`signals` 安全修复、像素叠加色预计算、剥离 localStorage 依赖、9 宫格 stretch、字体清晰度的承诺范围。

### v0.2（2026-11-05）· 按 Fable 5.1 的审阅修改
核心修正：计时改为服务器裁决（v0.1 让每个客户端各自推进阶段，会产生重复记录）；时间戳由数据库写；`live_status` 补列并拆出私有表；像素半透明叠加预先算成不透明；Live Activity 的系统限制；扩展的 token 刷新冲突；开发者账号和 R-014 提前；工期上调。详见提交 `8ed8e54`。
