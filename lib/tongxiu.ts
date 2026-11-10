/**
 * R-030 同修: deadlines, progress and the feedback prompt.
 *
 * Deadlines are "Anywhere on Earth" (AoE, UTC-12): a milestone due on 12-07 closes when 12-07 has ended
 * everywhere on Earth, i.e. 12-08 12:00 UTC. Nobody, in any time zone, loses part of the last day.
 */
import type { Course, Milestone, Star } from "./courses";
import type { Cohort, CohortMember, Submission, TestResults } from "./types";
import { addDaysKey, dayKey, DAY, partsIn, weekdayCn } from "./time";

export const MAX_EXTENSIONS = 3;
export const EXTENSION_DAYS = 3;
export const NOTE_MAX = 4000;
export const LINK_MAX = 500;
export const FEEDBACK_MAX = 20000;
export const COHORT_NAME_MAX = 40;
/** the error a backend throws while the R-030 tables do not exist yet (schema.sql not re-run) */
export const TONGXIU_MISSING = "同修还没开通：需要在 Supabase 里重新执行一遍 supabase/schema.sql";

/** "YYYY-MM-DD" of a milestone's last day, before any extension */
export function dueDay(startsOn: string, m: Milestone, extended = false) {
  return addDaysKey(startsOn, (m.week - 1) * 7 + (m.day ?? 7) - 1 + (extended ? EXTENSION_DAYS : 0));
}

/** the instant a day ends Anywhere on Earth (UTC-12): the next day, 12:00 UTC */
export function aoeEnd(key: string) {
  const [y, mo, d] = key.split("-").map(Number);
  return Date.UTC(y, mo - 1, d + 1, 12);
}

export function dueAt(cohort: Pick<Cohort, "startsOn">, m: Milestone, member?: Pick<CohortMember, "extensions"> | null) {
  return aoeEnd(dueDay(cohort.startsOn, m, !!member?.extensions.includes(m.id)));
}

/** "12月7日 周日" */
export function keyLabel(key: string) {
  const [y, mo, d] = key.split("-").map(Number);
  return `${mo}月${d}日 周${weekdayCn[new Date(Date.UTC(y, mo - 1, d, 12)).getUTCDay()]}`;
}

/** the last minute before the deadline, on the viewer's clock: "12月8日 周一 19:59" */
export function localDeadline(due: number, tz: string) {
  const p = partsIn(due - 60_000, tz);
  return `${p.mo}月${p.d}日 周${weekdayCn[p.wd]} ${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}

/** "还剩 2 天 5 小时" / "还剩 40 分钟" / "已截止 3 天" */
export function leftLabel(due: number, now: number) {
  const d = due - now;
  const a = Math.abs(d);
  const days = Math.floor(a / DAY), hours = Math.floor((a % DAY) / 3_600_000), mins = Math.max(1, Math.floor((a % 3_600_000) / 60_000));
  const span = days ? `${days} 天${hours ? ` ${hours} 小时` : ""}` : hours ? `${hours} 小时` : `${mins} 分钟`;
  return d >= 0 ? `还剩 ${span}` : `已截止 ${span}`;
}

/** 1-based week of the course on the viewer's calendar (0 = not started; can run past the last week) */
export function courseWeek(cohort: Pick<Cohort, "startsOn">, now: number, tz: string) {
  const [y, mo, d] = cohort.startsOn.split("-").map(Number);
  const [ty, tmo, td] = dayKey(now, tz).split("-").map(Number);
  const days = Math.round((Date.UTC(ty, tmo - 1, td) - Date.UTC(y, mo - 1, d)) / DAY);
  return days < 0 ? 0 : Math.floor(days / 7) + 1;
}

export const isLate = (s: Pick<Submission, "firstSubmittedAt" | "dueAt">) => s.firstSubmittedAt > s.dueAt;

export type CellState = "done" | "late" | "overdue" | "open" | "later";
export const CELL_LABEL: Record<CellState, string> = { done: "完成了", late: "完成了（晚了）", overdue: "还没完成（已过截止）", open: "进行中", later: "还没开始" };

/* ── stars: lit by reported test results ── */

/** "https://github.com/stanford-cs336/assignment1-basics" → "assignment1-basics" */
export const repoName = (url?: string) => (url ? url.replace(/\/+$/, "").split("/").pop()!.replace(/\.git$/, "") : "");

/** result keys look like "assignment1-basics|tests/test_model.py::test_rope[3]" (the repo part may be missing) */
export function splitTestKey(key: string) {
  const bar = key.indexOf("|");
  const repo = bar >= 0 ? key.slice(0, bar) : "";
  const rest = bar >= 0 ? key.slice(bar + 1) : key;
  const sep = rest.lastIndexOf("::");
  const file = sep >= 0 ? rest.slice(0, sep) : "";
  const name = (sep >= 0 ? rest.slice(sep + 2) : rest).replace(/\[.*$/, "");
  return { repo, file, name };
}

function matches(key: string, pattern: string, repo: string) {
  const k = splitTestKey(key);
  if (pattern === "*" || pattern === "**") return !!repo && k.repo === repo;
  if (pattern.endsWith(".py")) return k.file === pattern || k.file.endsWith("/" + pattern);
  return k.name === pattern;
}

export interface StarState { star: Star; lit: boolean; at: number | null }

export function starStates(m: Milestone, tr: TestResults | undefined): StarState[] {
  const repo = repoName(m.repo);
  return (m.stars || []).map((star) => {
    if (!tr) return { star, lit: false, at: null };
    const keys = Object.keys(tr.results).filter((k) => star.tests.some((p) => matches(k, p, repo)));
    if (star.tests.includes("*")) return { star, lit: keys.length > 0, at: keys.length ? tr.firstRunAt : null };
    const lit = keys.length > 0 && keys.every((k) => typeof tr.results[k] === "number");
    return { star, lit, at: lit ? Math.max(...keys.map((k) => tr.results[k] as number)) : null };
  });
}

export interface StepStatus {
  state: CellState; due: number; doneAt: number | null; stars: StarState[]; lit: number; total: number;
  /** 0..1, for the partly filled square */
  frac: number;
}

/** where one person stands on one step: handed in by hand, or every star lit (whichever came first) */
export function stepStatus(cohort: Pick<Cohort, "startsOn">, m: Milestone, member: (Pick<CohortMember, "extensions"> & { joinedAt?: number }) | null | undefined,
  sub: Submission | undefined, tr: TestResults | undefined, now: number): StepStatus {
  const due = dueAt(cohort, m, member);
  const stars = starStates(m, tr);
  const lit = stars.filter((x) => x.lit).length;
  const starsAt = stars.length && lit === stars.length ? Math.max(...stars.map((x) => x.at || 0)) : null;
  const times = [sub?.firstSubmittedAt, starsAt].filter((x): x is number => x != null);
  const doneAt = times.length ? Math.min(...times) : null;
  // a step that was already due when someone joined is never "late" for them
  const late = doneAt != null && doneAt > due && !(member?.joinedAt && member.joinedAt > due);
  const joinedLate = !!(member?.joinedAt && member.joinedAt > due);
  const state: CellState = doneAt != null ? (late ? "late" : "done") : now > due ? (joinedLate ? "open" : "overdue") : due - now < 8 * DAY ? "open" : "later";
  return { state, due, doneAt, stars, lit, total: stars.length, frac: doneAt != null ? 1 : stars.length ? lit / stars.length : 0 };
}

export const starsLit = (course: Course, tr: TestResults | undefined) =>
  course.milestones.reduce((a, m) => a + starStates(m, tr).filter((x) => x.lit).length, 0);
export const starsTotal = (course: Course) => course.milestones.reduce((a, m) => a + (m.stars?.length || 0), 0);

/** steps I should be looking at now: not done, due within 8 days or already past */
export function upcoming(course: Course, cohort: Cohort, member: CohortMember | null, mine: Submission[], tr: TestResults | undefined, now: number) {
  return course.milestones
    .map((m) => ({ m, st: stepStatus(cohort, m, member, mine.find((s) => s.milestoneId === m.id), tr, now) }))
    .filter((x) => x.st.doneAt == null && x.st.due - now < 8 * DAY)
    .sort((a, b) => a.st.due - b.st.due);
}

/** the step to show first: the earliest one not done yet */
export function currentStep(course: Course, cohort: Cohort, member: CohortMember | null, mine: Submission[], tr: TestResults | undefined, now: number) {
  const order = [...course.milestones].sort((a, b) => dueAt(cohort, a, member) - dueAt(cohort, b, member));
  for (const m of order) {
    const st = stepStatus(cohort, m, member, mine.find((s) => s.milestoneId === m.id), tr, now);
    if (st.doneAt == null) return { m, st };
  }
  return null;
}

/** what to paste in a terminal: get the code, run the tests, report them (the report URL carries my token) */
export function setupCommands(origin: string, token: string, repoUrl: string | undefined) {
  const repo = repoName(repoUrl);
  return {
    install: "curl -LsSf https://astral.sh/uv/install.sh | sh",
    clone: repoUrl ? `git clone ${repoUrl}.git && cd ${repo}` : "",
    report: `uv run pytest --junitxml=/tmp/tongxiu.xml; curl -sS --data-binary @/tmp/tongxiu.xml "${origin}/api/tongxiu/report?t=${token}&repo=$(basename "$PWD")"`,
  };
}

/**
 * The summary line pytest prints at the end, e.g. "==== 46 passed, 2 failed, 1 skipped in 3.21s ====".
 * Skipped and deselected tests are left out of the total; errors count as not passed.
 */
export function parsePytest(text: string): { passed: number; total: number } | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    if (!/\b(passed|failed|error|errors|no tests ran)\b/.test(line)) continue;
    const n = (w: string) => { const m = line.match(new RegExp(`(\\d+) ${w}\\b`)); return m ? Number(m[1]) : 0; };
    const passed = n("passed"), failed = n("failed"), errors = n("errors") + n("error"), xpassed = n("xpassed"), xfailed = n("xfailed");
    const total = passed + failed + errors + xpassed + xfailed;
    if (!total && !/no tests ran/.test(line)) continue;
    return { passed: passed + xpassed + xfailed, total };
  }
  return null;
}

/** what the developers paste into Claude to write feedback for one submission */
export function feedbackPrompt(o: {
  course: Course; m: Milestone; learner: string; tests: string; metric: string; link: string; note: string; late: boolean;
}) {
  const { course, m } = o;
  return [
    `你是 ${course.name}（${course.title}）的助教。一位自学的同学交了下面这个阶段的作业，请给出反馈。`,
    "",
    `## 这个阶段：${m.title}（第 ${m.week} 周）`,
    m.summary,
    "",
    "要交的东西：",
    ...m.deliverables.map((d) => `- ${d}`),
    "",
    "请重点看：",
    ...m.rubric.map((r) => `- ${r}`),
    m.offCampus ? `\n校外自学的情况：${m.offCampus}` : "",
    "",
    `## ${o.learner} 交的内容${o.late ? "（迟交）" : ""}`,
    o.tests ? `测试：${o.tests}` : "测试：没有填",
    o.metric ? `${m.metric?.name || "指标"}：${o.metric}` : "",
    o.link ? `链接：${o.link}` : "链接：没有填",
    "",
    "说明 / 报告：",
    o.note || "（没有写）",
    "",
    "## 反馈要求",
    "- 用中文，直接对这位同学说话，300–600 字。",
    "- 先说做得好的一两点，再按重要程度列出要改的地方，每条说清楚为什么、怎么改。",
    "- 链接里的代码或报告如果打不开，就只根据上面的文字给反馈，并说明这一点。",
    "- 不要打分，不要直接给出作业的完整答案代码。",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/** a sensible start: next Monday on the viewer's calendar */
export function nextMonday(now: number, tz: string) {
  const key = dayKey(now, tz);
  const [y, mo, d] = key.split("-").map(Number);
  const wd = new Date(Date.UTC(y, mo - 1, d, 12)).getUTCDay();
  return addDaysKey(key, ((8 - wd) % 7) || 7);
}

/**
 * Demo only: test results as if the step's repo had been run, with these stars ("milestoneId/starId") passing.
 * Real reports carry the real test names; these are just enough to light the right stars.
 */
export function fakeResults(course: Course, repoUrl: string | undefined, pass: Set<string>): Record<string, boolean> {
  const repo = repoName(repoUrl);
  const out: Record<string, boolean> = {};
  for (const m of course.milestones) {
    if (repoName(m.repo) !== repo) continue;
    for (const star of m.stars || []) {
      const ok = pass.has(`${m.id}/${star.id}`);
      for (const p of star.tests) {
        if (p === "*") continue;
        const key = p === "**" ? `${repo}|tests/test_all.py::test_${star.id}` : p.endsWith(".py") ? `${repo}|tests/${p}::test_${star.id}` : `${repo}|tests/test_${m.short.replace(/\W/g, "")}.py::${p}`;
        out[key] = ok;
      }
    }
  }
  return out;
}
