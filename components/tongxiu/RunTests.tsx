"use client";
// R-030 同修: the commands to paste in a terminal. The last one runs the official tests and reports them; stars light up by themselves.
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import type { Course, Milestone } from "@/lib/courses";
import type { Cohort, TestResults } from "@/lib/types";
import { fakeResults, repoName, setupCommands, starStates } from "@/lib/tongxiu";
import { ago } from "@/lib/time";
import { ICopy } from "@/components/Icons";

function Cmd({ label, cmd }: { label: string; cmd: string }) {
  const app = useApp();
  const [copied, setCopied] = useState(false);
  return (
    <div className="tx-cmd">
      <div className="tx-cmd-label">{label}</div>
      <div className="tx-cmd-row">
        <code>{cmd}</code>
        <button type="button" className="btn sm" onClick={async () => {
          try { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1800); }
          catch { app.pushToast({ title: "复制失败", body: "手动选中复制吧" }); }
        }}><ICopy />{copied ? "已复制" : "复制"}</button>
      </div>
    </div>
  );
}

export function RunTests({ course, cohort, step, mine, compact = false }: {
  course: Course; cohort: Cohort; step: Milestone | null; mine?: TestResults; compact?: boolean;
}) {
  const app = useApp();
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    app.backend.getReportToken(cohort.id).then((t) => { if (alive) setToken(t); }).catch((e) => { if (alive) setErr((e as Error).message); });
    return () => { alive = false; };
  }, [app.backend, cohort.id]);

  // the repo of the step at hand, or the next step that has one
  const repoUrl = step?.repo || course.milestones.find((m) => m.repo && m.week >= (step?.week || 1))?.repo;
  const origin = typeof location !== "undefined" ? location.origin : "";
  const c = token ? setupCommands(origin, token, repoUrl) : null;
  const ranBefore = !!mine && Object.keys(mine.results).some((k) => k.startsWith(repoName(repoUrl) + "|"));

  // demo: each click passes the next star of this repo
  async function simulate() {
    if (!app.backend.simulateReport) return;
    setBusy(true);
    const lit = new Set<string>();
    let next: string | null = null;
    for (const m of course.milestones.filter((x) => x.repo === repoUrl)) {
      starStates(m, mine).forEach((s) => {
        if (s.lit) lit.add(`${m.id}/${s.star.id}`);
        else if (!next && !s.star.tests.includes("*")) next = `${m.id}/${s.star.id}`;
      });
    }
    if (next) lit.add(next);
    try { await app.backend.simulateReport(cohort.id, fakeResults(course, repoUrl, lit)); } finally { setBusy(false); }
  }

  return (
    <div className="tx-run">
      {!compact && <p className="muted">在终端里依次粘贴下面的命令。最后一条会跑官方测试，并把结果自动传回同窗：测试过了，对应的星星就自己亮，同修们也能看到。以后每次想对一下，只要在作业目录里再跑最后一条。</p>}
      {err && <p className="td-err">{err}</p>}
      {c ? (
        <>
          {!ranBefore && <Cmd label="1. 装 uv（Python 的包管理工具；装过可以跳过）" cmd={c.install} />}
          {!ranBefore && c.clone && <Cmd label={`2. 下载作业 ${repoName(repoUrl)}`} cmd={c.clone} />}
          <Cmd label={ranBefore ? "在作业目录里跑测试并上报" : "3. 跑测试并上报（第一次会自动装好依赖，要几分钟）"} cmd={c.report} />
          <p className="muted tx-run-foot">
            {mine ? `上次上报：${ago(mine.updatedAt, app.now)} · ${mine.lastPassed} 个通过，${mine.lastFailed} 个没过` : "还没上报过。"}
            {" "}命令里有你自己的上报码，别发给别人。Windows 请在 WSL 里跑。
          </p>
          {app.backend.simulateReport && (
            <button type="button" className="btn lamp" onClick={simulate} disabled={busy}>演示：假装在终端里跑了一次测试</button>
          )}
        </>
      ) : !err && <p className="muted">正在生成你的命令…</p>}
    </div>
  );
}
