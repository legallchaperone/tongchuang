// Single source of truth for versions: lib/changelog.json.
//   node scripts/changelog.mjs          -> regenerate CHANGELOG.md
//   node scripts/changelog.mjs --check  -> fail if package.json and the changelog disagree (runs before every build)
import { readFileSync, writeFileSync } from "node:fs";

const log = JSON.parse(readFileSync(new URL("../lib/changelog.json", import.meta.url)));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const latest = log[0].version;

if (pkg.version !== latest) {
  console.error(`版本不一致：package.json 是 ${pkg.version}，lib/changelog.json 最新一条是 ${latest}。请把两边改成一样。`);
  process.exit(1);
}
const md = [
  "# 更新日志",
  "",
  "版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。标注“需要执行数据库脚本”的版本，部署前请在 Supabase SQL Editor 里重新执行一遍 `supabase/schema.sql`（脚本可重复执行）。",
  "",
  ...log.flatMap((e) => [
    `## ${e.version} · ${e.title}（${e.date}）`,
    "",
    ...e.items.map((i) => `- ${i}`),
    ...(e.migration ? ["", "> 需要执行数据库脚本"] : []),
    "",
  ]),
].join("\n");

if (process.argv.includes("--check")) {
  const cur = (() => { try { return readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"); } catch { return ""; } })();
  if (cur !== md) { console.error("CHANGELOG.md 不是最新的，请运行 npm run changelog"); process.exit(1); }
  console.log(`版本 ${latest} ✓`);
} else {
  writeFileSync(new URL("../CHANGELOG.md", import.meta.url), md);
  console.log(`CHANGELOG.md 已更新到 ${latest}`);
}
