# 同窗 Mac 版：构建、安装和发布

> 配套 `docs/native/PLAN.md`（v0.3，零成本方案）。不需要 Apple 开发者账号，也不需要任何密钥。

---

## 1. 自动构建是怎么回事

仓库是公开的，GitHub 免费提供 macOS 构建机。流水线写在 `.github/workflows/mac.yml`，每次往 `native/**` 分支（或 `main`）推送、并且改到了 `native/`、`design/` 或这个流水线文件时，就会自动跑一遍。也可以在 GitHub 网页上手动运行（Actions → mac → Run workflow）。

每次运行做这几件事：

1. **跑测试**：`native/Packages/TongchuangKit` 里的 `swift test`。
   - `TCCore`：时区、换日（早上 5 点）、跨午夜拆分、连续天数、统计汇总，和网页版 TypeScript 算出来的结果逐条对比（`design/fixtures/logic.json`）。
   - `TCPixel`：书桌场景和小人，和 Chromium 真实画布画出来的像素逐个对比（`design/fixtures/pixel/`）。
2. **生成 Xcode 工程**：`brew install xcodegen`，然后按 `native/project.yml` 生成（工程文件不进仓库）。
3. **编译**：Release 版，Apple 芯片和 Intel 通用（arm64 + x86_64），本机签名（ad-hoc，`CODE_SIGN_IDENTITY=-`）。
4. **检查**：确认两种芯片都在、签名有效、`tongchuang://` 链接已注册。
5. **打包**：用 `ditto` 压成 `Tongchuang-版本-提交号.zip`，作为构建产物上传，保留 30 天。

测试或编译失败时，出错的地方会直接显示在这次运行的页面上（注释），完整日志在名为 `logs` 的构建产物里。

## 2. 下载构建好的 App

1. 打开仓库的 **Actions** 页面，左边选 **mac**。
2. 点最上面一次绿色（成功）的运行。
3. 拉到页面底部 **Artifacts**，下载 **Tongchuang-macOS**（需要登录 GitHub）。
4. 下载下来是一个 zip，里面还有一个 `Tongchuang-….zip`，再解压一次就是「同窗.app」。

正式发给朋友时用 Releases（第 5 节），朋友不需要 GitHub 账号。

## 3. 朋友怎么安装

1. 解压后把「同窗」拖进「应用程序」文件夹。
2. 双击打开。系统会提示“无法验证开发者”或“Apple 无法检查其是否包含恶意软件”，点「完成」（不要点「移到废纸篓」）。
3. 打开「系统设置 → 隐私与安全性」，拉到最下面，会看到“已阻止使用「同窗」”，点「仍要打开」，输入电脑密码。
4. 再打开一次，以后就不会再拦了。

熟悉终端的朋友可以用这一行代替第 2–3 步：

```bash
xattr -dr com.apple.quarantine /Applications/同窗.app
```

为什么会被拦：没有付费账号，就不能做 Apple 公证（notarization）。App 本身是签了名的（本机签名），只是系统不认识这个开发者。macOS 15 起，旧的“右键 → 打开”已经不管用，只能走上面的「仍要打开」。

需要 macOS 14 Sonoma 或更新的系统。

## 4. 在自己的 Mac 上构建

需要 Xcode 15 或更新版本（App Store 免费下载）和 Homebrew。

```bash
brew install xcodegen
cd native
xcodegen            # 按 project.yml 生成 Tongchuang.xcodeproj
open Tongchuang.xcodeproj
```

在 Xcode 里：

1. 左边选 **Tongchuang** 工程 → **Tongchuang** target → **Signing & Capabilities**。
2. Team 留空，Signing Certificate 选 **Sign to Run Locally**（工程默认就是这样）。
3. 按 ⌘R 运行。

只跑测试不用 Xcode 工程：

```bash
cd native/Packages/TongchuangKit
swift test
```

改了 `project.yml` 之后要重新运行一次 `xcodegen`。

## 5. 金样和对拍样本

网页版的 TypeScript 是唯一的标准。`design/` 下的文件都是从它生成的，不要手改：

| 文件 | 内容 |
|---|---|
| `design/fixtures/logic.json` | `lib/time.ts`、`lib/stats.ts`、`lib/review.ts` 的对拍样本：纽约夏令时开始（02:30 不存在）和结束（01:30 出现两次）、伦敦、上海、圣地亚哥（午夜被跳过）、早上 5 点换日、跨午夜的记录 |
| `design/fixtures/pixel/*.json` | 22 个书桌场景：白天 / 夜里、下雨、睡觉、收工、在不在、心流星星、不同发型和颜色。每个存了场景参数和 Chromium 画出来的 RGBA 像素 |
| `design/fixtures/pixel-misc.json` | 小人、头像、`shade()`、`mix()`、默认形象、伪随机数序列 |
| `design/pixel/*.json` | `lib/pixel.ts` 里的颜色表和精灵图数据；Swift 用的 `PixelData.swift` 也是同时生成的，测试会检查两边一致 |

网页的这些文件改了之后，在仓库根目录运行（需要 Node 22 和 Playwright 的 Chromium）：

```bash
node scripts/native-fixtures.mjs           # 重新生成
node scripts/native-fixtures.mjs --check   # 只检查是不是最新的
```

脚本还会用 `scripts/native-fixtures/buf-ctx.mjs`（Swift 版用的同一套整数混色算法）把每个场景再画一遍，和 Chromium 逐字节比较，不一致就报错。所以半透明叠加（灯光、夜色、雨、蒸汽）目前也能做到零差异；测试里给这些像素留了每个通道 ±2 的临时容差，并在运行结果里报告用到容差的像素数。

## 6. 正式发布（打 tag）

流水线里已经写好了发布步骤，默认注释掉。要启用：

1. 在 `.github/workflows/mac.yml` 里取消 `tags: ["mac-v*"]` 和 `release` 任务的注释。
2. 改 `native/project.yml` 里的 `MARKETING_VERSION`（可选，tag 上的版本号会覆盖它）。
3. 打 tag 并推送：

   ```bash
   git tag mac-v0.1.0
   git push origin mac-v0.1.0
   ```

流水线会用仓库自带的 `GITHUB_TOKEN` 建一个 Release，附上 zip 和安装说明。不需要添加任何密钥。

## 7. 待办：Sparkle 自动更新

PLAN 的 D10：用 Sparkle 2 自动更新，更新包用我们自己的 EdDSA 密钥签名（和 Apple 签名无关）。通过 Sparkle 装上的更新不会再触发「仍要打开」。这一步需要仓库主人做一次：

1. 在 Mac 上下载 Sparkle 2 的发布包，运行里面的 `bin/generate_keys`。它会把私钥存进你的钥匙串，并打印出公钥。
2. 导出私钥：`bin/generate_keys -x sparkle_private_key.txt`。
3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 新建密钥 `SPARKLE_PRIVATE_KEY`，内容是这个文件。之后把本机的这个文件删掉。
4. 把公钥告诉开发这边，写进 `project.yml` 的 Info.plist（`SUPublicEDKey`），`SUFeedURL` 指向 Releases 上的 `appcast.xml`。
5. 然后在流水线里加上：用 `sign_update` 给 zip 签名、生成 `appcast.xml`、一起上传到 Release。

私钥只能由你加进 Secrets，开发这边看不到也不应该看到。在这之前，更新只能手动下载新版本覆盖。

## 8. 其他待办

- **像素字体**：现在界面用系统字体。计划在构建时从上游 GitHub Release 下载完整的 Fusion Pixel 12px（固定版本 + 校验和），按 OFL 1.1 附上许可证，不把字体文件放进仓库。
- **App 图标**：还没有，沿用 `public/icon.svg` 的像素台灯，做成 `AppIcon`。
- **窗口不可见时停止动画**、9 宫格像素边框（`TCDesign`）、登录和实时数据（`TCBackend`）：见 PLAN 阶段 1 的后续步骤。
