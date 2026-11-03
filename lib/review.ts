/**
 * R-007 收工: which day a review belongs to, today's totals, and whether someone's desk is dark.
 * A “work day” runs until 5 a.m. local time, so closing up at 1 a.m. still counts for the evening before.
 */
import type { DailyReview, LiveStatus, Session, UserId } from "./types";
import { addDaysKey, dayKey, partsIn } from "./time";
import { msOnDay, withLive } from "./stats";

export const DAY_ROLLS_AT = 5;

/** local date key of the work day containing `now` */
export function workDay(now: number, tz: string) {
  const k = dayKey(now, tz);
  return partsIn(now, tz).h < DAY_ROLLS_AT ? addDaysKey(k, -1) : k;
}

/** focused ms of the current work day (the small hours after midnight count for the evening before) */
export function workDayMs(sessions: Session[], userId: UserId, live: LiveStatus | undefined, tz: string, now: number) {
  const mine = withLive(sessions, userId, live, tz, now);
  const wd = workDay(now, tz);
  const today = dayKey(now, tz);
  return msOnDay(mine, tz, wd) + (wd !== today ? msOnDay(mine, tz, today) : 0);
}

/** sessions (running one included) that count for the work day */
export function workDaySessions(sessions: Session[], userId: UserId, live: LiveStatus | undefined, tz: string, now: number) {
  const mine = withLive(sessions, userId, live, tz, now);
  const wd = workDay(now, tz);
  const keys = new Set([wd, dayKey(now, tz)]);
  return mine.filter((s) => keys.has(dayKey(s.startedAt, tz)) || keys.has(dayKey(s.endedAt, tz)));
}

/** the evening hours when the 收工 button lights up */
export const isWindDown = (now: number, tz: string) => { const h = partsIn(now, tz).h; return h >= 21 || h < DAY_ROLLS_AT; };

/**
 * someone's review for today if their desk is closed: they reviewed this work day
 * and have not started focusing again since.
 */
export function closedReview(reviews: DailyReview[], sessions: Session[], live: LiveStatus | undefined, userId: UserId, tz: string, now: number): DailyReview | null {
  const wd = workDay(now, tz);
  const r = reviews.find((x) => x.userId === userId && x.day === wd);
  if (!r) return null;
  if (live && (live.state === "focus" || live.state === "paused" || live.state === "break") && (live.updatedAt || 0) > r.updatedAt) return null;
  if (sessions.some((s) => s.userId === userId && s.startedAt > r.updatedAt)) return null;
  return r;
}

export const ENERGY = [
  { v: 1, label: "累了" },
  { v: 2, label: "还行" },
  { v: 3, label: "满格" },
] as const;
export const IMPACT = [
  { v: 1, label: "很少" },
  { v: 2, label: "一些" },
  { v: 3, label: "不少" },
  { v: 4, label: "很多" },
] as const;

/** “昨天” / “前天” / “11月1日” relative to the current work day */
export function dayLabel(day: string, current: string) {
  if (day === current) return "今天";
  if (addDaysKey(day, 1) === current) return "昨天";
  if (addDaysKey(day, 2) === current) return "前天";
  return `${Number(day.slice(5, 7))}月${Number(day.slice(8))}日`;
}
