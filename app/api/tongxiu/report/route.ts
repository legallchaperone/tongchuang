// R-030 同修: the terminal reports a test run here (the command on the cohort page); stars light up by themselves.
// Prints a short summary back to the terminal. Writes go through report_tests(), which checks the personal report code.
import { createClient } from "@supabase/supabase-js";
import { parseJunit } from "@/lib/junit";
import { getCourse } from "@/lib/courses";
import { starStates } from "@/lib/tongxiu";
import type { TestResults } from "@/lib/types";

export const dynamic = "force-dynamic";

const text = (body: string, status = 200) => new Response(body.endsWith("\n") ? body : body + "\n", {
  status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
});

export function GET() {
  return text("这是同修的测试上报地址：在作业目录里运行同窗「同修」页面上给的那条命令，测试结果会传到这里。");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asResults = (cohortId: string, j: any): TestResults => {
  const results: Record<string, number | false> = {};
  for (const [k, v] of Object.entries(j || {})) results[k] = typeof v === "string" ? Date.parse(v) : false;
  return { cohortId, userId: "", results, firstRunAt: 0, updatedAt: 0, runs: 0, lastPassed: 0, lastFailed: 0 };
};

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return text("同窗现在是演示模式，不能上报。", 503);

  const q = new URL(req.url).searchParams;
  const token = q.get("t") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return text("链接里没有上报码：回同窗的同修页面，重新复制那条命令。", 400);
  const repo = (q.get("repo") || "").replace(/[^\w.-]/g, "").slice(0, 100);

  const body = await req.text();
  if (body.length > 8_000_000) return text("测试结果太大了，超过 8MB。", 413);
  let parsed: Record<string, boolean>;
  try {
    parsed = body.trim().startsWith("{") ? JSON.parse(body) : parseJunit(body);
  } catch { return text("没看懂上传的内容：要用 pytest --junitxml 生成的文件。", 400); }
  const res: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(parsed)) res[repo ? `${repo}|${k}` : k] = !!v;
  if (!Object.keys(res).length) return text("没收到任何测试结果：确认 pytest 真的跑起来了（看看上面有没有报错）。", 400);

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("report_tests", { t: token, res });
  if (error) {
    const m = error.message || "";
    if (/bad token/.test(m)) return text("上报码不对：回同窗的同修页面，重新复制那条命令。", 403);
    if (/not in cohort/.test(m)) return text("你已经不在这一期同修里了。", 403);
    if (/too many/.test(m)) return text("测试太多了（超过 5000 个）。", 413);
    if (/Could not find the function|does not exist/i.test(m)) return text("同窗还没开通自动上报（数据库需要更新）。", 503);
    return text("上报失败：" + m, 500);
  }

  const d = data as any;
  const course = getCourse(d.course);
  const origin = new URL(req.url).origin;
  const lines = [`同修${course ? " · " + course.name : ""}：这次 ${d.passed} 个通过，${d.failed} 个没过`];
  if (course) {
    const before = asResults(d.cohort, d.before), after = asResults(d.cohort, d.after);
    before.firstRunAt = Object.keys(d.before || {}).length ? 1 : 0; after.firstRunAt = 1;
    const fresh: string[] = [], done: string[] = [], rows: string[] = [];
    for (const m of course.milestones) {
      if (!m.stars?.length) continue;
      const a = starStates(m, after), b = starStates(m, before);
      const lit = a.filter((x) => x.lit).length;
      const newly = a.filter((x, i) => x.lit && !b[i].lit).map((x) => x.star.label);
      if (newly.length) fresh.push(`${newly.join("、")}（${m.title}）`);
      if (lit === a.length && b.filter((x) => x.lit).length < a.length) done.push(m.title);
      // only the steps this repo touches
      if (a.some((x) => x.lit) || newly.length || (repo && m.repo?.endsWith("/" + repo))) {
        rows.push(`${m.title}  ${"★".repeat(lit)}${"☆".repeat(a.length - lit)}  ${lit}/${a.length}`);
      }
    }
    if (fresh.length) lines.push("", ...fresh.map((x) => "★ 新点亮：" + x));
    if (done.length) lines.push(...done.map((x) => "🎉 完成了：" + x));
    if (!fresh.length && !done.length) lines.push("", "这次没有新的星星。继续加油！");
    if (rows.length) lines.push("", ...rows);
  }
  lines.push("", `去同窗看看：${origin}/tongxiu/${d.cohort}`);
  return text(lines.join("\n"));
}
