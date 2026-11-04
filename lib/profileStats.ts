/**
 * R-020 个人主页：一个人主页上所有小组件要用的数字，页面和分享图共用。
 * “今天”“本周”一律按主页主人的时区算。
 */
import type { DailyReview, LiveStatus, Profile, Session, Subject } from "./types";
import { byDay, hourProfile, streaks, subjectTotals, touching, weekRange, withLive, yearGrid } from "./stats";
import { dayKey, lastDays, MIN } from "./time";
import { computeBadges, type Badge } from "./badges";

export interface SubjectPart { key: string; name: string; /** palette index, null = 未分类 */ color: number | null; ms: number }

export interface ProfileStats {
  tz: string;
  todayKey: string;
  todayMs: number;
  goalMs: number;
  weekMs: number;
  /** Monday-first, ms per day of the current week */
  week: { key: string; ms: number }[];
  streak: { current: number; best: number };
  yearCols: { key: string; ms: number; future: boolean }[][];
  activeDays: number;
  subjects: Record<7 | 30, SubjectPart[]>;
  /** average focused ms per day in each local hour */
  hours: Record<30 | 90, number[]>;
  /** newest first, consecutive blocks of the same task merged */
  recent: { startedAt: number; endedAt: number; ms: number; task: string; subject: SubjectPart | null; mode: Session["mode"]; count: number }[];
  review: DailyReview | null;
  badges: Badge[];
}

function slices(list: Session[], subjects: Subject[]): SubjectPart[] {
  return subjectTotals(list, subjects).filter((x) => x.ms > 0).map((x) => ({ key: String(x.id), name: x.subject?.name || "未分类", color: x.subject ? x.subject.color : null, ms: x.ms }));
}

export function profileStats(o: { p: Profile; sessions: Session[]; subjects: Subject[]; live?: LiveStatus; reviews: DailyReview[]; now: number }): ProfileStats {
  const { p, now } = o;
  const tz = p.tz;
  const all = withLive(o.sessions, p.id, o.live, tz, now);
  const subs = o.subjects.filter((s) => s.userId === p.id);
  const daily = byDay(all, tz);
  const todayKey = dayKey(now, tz);
  const weekKeys = weekRange(tz, now);
  const week = weekKeys.map((key) => ({ key, ms: daily.get(key) || 0 }));
  const streak = streaks(daily, tz, now);
  const yearCols = yearGrid(daily, tz, 53, now);
  const since = yearCols[0][0].key;
  const inRange = (n: number) => touching(all, tz, new Set(lastDays(n, tz, now)));
  const hoursOf = (n: number) => hourProfile(inRange(n).filter((s) => s.id !== "live"), tz).map((x) => x.ms / n);

  const finished = all.filter((s) => s.id !== "live");
  const recent: ProfileStats["recent"] = [];
  for (const s of finished.slice(0, 60)) {
    const last = recent[recent.length - 1];
    const subj = subs.find((x) => x.id === s.subjectId);
    // a run of pomodoros on the same task reads as one entry
    if (last && last.task === s.task && (last.subject?.key ?? "null") === String(subj ? subj.id : null) && last.startedAt - s.endedAt < 20 * MIN && last.startedAt - s.endedAt >= -MIN) {
      last.startedAt = s.startedAt; last.ms += s.durationMs; last.count++;
      continue;
    }
    if (recent.length >= 8) break;
    recent.push({ startedAt: s.startedAt, endedAt: s.endedAt, ms: s.durationMs, task: s.task, mode: s.mode, count: 1,
      subject: subj ? { key: subj.id, name: subj.name, color: subj.color, ms: 0 } : null });
  }

  return {
    tz, todayKey, todayMs: daily.get(todayKey) || 0, goalMs: p.dailyGoalMin * MIN,
    weekMs: week.reduce((a, d) => a + d.ms, 0), week, streak, yearCols,
    activeDays: Array.from(daily).filter(([k, v]) => k >= since && v > 0).length,
    subjects: { 7: slices(inRange(7), subs), 30: slices(inRange(30), subs) },
    hours: { 30: hoursOf(30), 90: hoursOf(90) },
    recent,
    review: o.reviews.filter((r) => r.userId === p.id).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.updatedAt - a.updatedAt))[0] || null,
    badges: computeBadges(finished, tz, streak.best),
  };
}

/** the best two-hour stretch of the day, e.g. [20, 22]; null when there is nothing yet */
export function peakWindow(hours: number[]): [number, number] | null {
  let best = -1, at = 0;
  for (let h = 0; h < 24; h++) { const v = hours[h] + hours[(h + 1) % 24]; if (v > best) { best = v; at = h; } }
  return best > 0 ? [at, at + 2] : null;
}
export const peakLabel = (w: [number, number]) => `${w[0]}–${w[1] > 24 ? w[1] - 24 : w[1]} 点`;
