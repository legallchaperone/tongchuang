/**
 * R-030 同修: deadlines, progress and the feedback prompt.
 *
 * Deadlines are "Anywhere on Earth" (AoE, UTC-12): a milestone due on 12-07 closes when 12-07 has ended
 * everywhere on Earth, i.e. 12-08 12:00 UTC. Nobody, in any time zone, loses part of the last day.
 */
import type { Course, Milestone } from "./courses";
import type { Cohort, CohortMember, Submission } from "./types";
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
/** how one milestone looks for one person in the progress grid */
export function cellState(due: number, sub: Submission | undefined, now: number): CellState {
  if (sub) return isLate(sub) ? "late" : "done";
  if (now > due) return "overdue";
  return due - now < 8 * DAY ? "open" : "later";
}
export const CELL_LABEL: Record<CellState, string> = { done: "按时交了", late: "迟交", overdue: "还没交（已过截止）", open: "进行中", later: "还没开始" };

/** milestones I should be looking at now: not handed in, due within 8 days or already past */
export function upcoming(course: Course, cohort: Cohort, member: CohortMember | null, mine: Submission[], now: number) {
  const done = new Set(mine.map((s) => s.milestoneId));
  return course.milestones
    .filter((m) => !done.has(m.id))
    .map((m) => ({ m, due: dueAt(cohort, m, member) }))
    .filter((x) => x.due - now < 8 * DAY)
    .sort((a, b) => a.due - b.due);
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
