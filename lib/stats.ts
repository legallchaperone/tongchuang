import type { LiveStatus, Session, Subject, UserId } from "./types";
import { addDaysKey, DAY, dayKey, HOUR, lastDays, partsIn, startOfDay } from "./time";

/** focused ms of a live status right now */
export function liveFocusMs(l: LiveStatus | undefined, now = Date.now()) {
  if (!l || (l.state !== "focus" && l.state !== "paused")) return 0;
  return l.accumulatedMs + (l.state === "focus" && l.runningSince ? Math.max(0, now - l.runningSince) : 0);
}

/** sessions + the running one as a pseudo session */
export function withLive(sessions: Session[], userId: UserId, l: LiveStatus | undefined, tz: string, now = Date.now()): Session[] {
  const mine = sessions.filter((s) => s.userId === userId);
  const ms = liveFocusMs(l, now);
  if (l && ms > 0 && l.startedAt) {
    mine.unshift({ id: "live", userId, subjectId: null, task: l.task, startedAt: l.startedAt, endedAt: now, durationMs: ms, mode: l.mode, rating: null, note: "", tz });
  }
  return mine;
}

export function byDay(sessions: Session[], tz: string) {
  const m = new Map<string, number>();
  for (const s of sessions) { const k = dayKey(s.startedAt, tz); m.set(k, (m.get(k) || 0) + s.durationMs); }
  return m;
}

export function streaks(daily: Map<string, number>, tz: string, now = Date.now(), minMs = 15 * 60_000) {
  const today = dayKey(now, tz);
  let cur = 0;
  let k = (daily.get(today) || 0) >= minMs ? today : addDaysKey(today, -1);
  while ((daily.get(k) || 0) >= minMs) { cur++; k = addDaysKey(k, -1); }
  const keys = Array.from(daily.keys()).filter((x) => (daily.get(x) || 0) >= minMs).sort();
  let best = 0, run = 0, prev = "";
  for (const x of keys) { run = prev && addDaysKey(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; }
  return { current: cur, best: Math.max(best, cur) };
}

export interface Summary {
  totalMs: number; days: number; activeDays: number; sessions: number; avgDayMs: number;
  avgRating: number | null; longestMs: number; goalDays: number;
}
export function summarize(sessions: Session[], tz: string, keys: string[], goalMs: number): Summary {
  const set = new Set(keys);
  const inRange = sessions.filter((s) => set.has(dayKey(s.startedAt, tz)));
  const daily = byDay(inRange, tz);
  const totalMs = inRange.reduce((a, s) => a + s.durationMs, 0);
  const rated = inRange.filter((s) => s.rating != null);
  return {
    totalMs, days: keys.length, activeDays: daily.size, sessions: inRange.filter((s) => s.id !== "live").length,
    avgDayMs: totalMs / Math.max(1, keys.length),
    avgRating: rated.length ? rated.reduce((a, s) => a + (s.rating || 0), 0) / rated.length : null,
    longestMs: inRange.reduce((a, s) => Math.max(a, s.durationMs), 0),
    goalDays: Array.from(daily.values()).filter((v) => v >= goalMs).length,
  };
}

/** per-day, per-subject minutes for a stacked bar chart */
export function dailyBySubject(sessions: Session[], tz: string, keys: string[]) {
  const idx = new Map(keys.map((k, i) => [k, i]));
  const rows = keys.map((k) => ({ key: k, total: 0, parts: new Map<string | null, number>() }));
  for (const s of sessions) {
    const i = idx.get(dayKey(s.startedAt, tz));
    if (i == null) continue;
    rows[i].total += s.durationMs;
    rows[i].parts.set(s.subjectId, (rows[i].parts.get(s.subjectId) || 0) + s.durationMs);
  }
  return rows;
}

export function subjectTotals(sessions: Session[], subjects: Subject[]) {
  const m = new Map<string | null, number>();
  sessions.forEach((s) => m.set(s.subjectId, (m.get(s.subjectId) || 0) + s.durationMs));
  return Array.from(m.entries())
    .map(([id, ms]) => ({ id, ms, subject: subjects.find((x) => x.id === id) || null }))
    .sort((a, b) => b.ms - a.ms);
}

/** minutes focused in each local hour of day + avg rating, spreads a session across the hours it covers */
export function hourProfile(sessions: Session[], tz: string) {
  const ms = new Array(24).fill(0);
  const rSum = new Array(24).fill(0), rW = new Array(24).fill(0);
  for (const s of sessions) {
    const ratio = s.durationMs / Math.max(1, s.endedAt - s.startedAt);
    for (let t = s.startedAt; t < s.endedAt; ) {
      const p = partsIn(t, tz);
      const h = p.h;
      const toNextHour = HOUR - (p.mi * 60 + p.s) * 1000 - (t % 1000);
      const step = Math.max(1000, Math.min(s.endedAt, t + toNextHour) - t);
      ms[h] += step * ratio;
      if (s.rating != null) { rSum[h] += s.rating * step; rW[h] += step; }
      t += step;
    }
  }
  return ms.map((v, h) => ({ h, ms: v, rating: rW[h] ? rSum[h] / rW[h] : null }));
}

/** same, but expressed in another time zone's hours (the viewer's), averaged per day over `days` */
export function hourHeatInViewerTz(sessions: Session[], viewerTz: string, days: number, now = Date.now()) {
  const since = now - days * DAY;
  const arr = new Array(24).fill(0);
  for (const s of sessions) {
    if (s.endedAt < since) continue;
    for (let t = Math.max(s.startedAt, since); t < s.endedAt; t += 5 * 60_000) arr[partsIn(t, viewerTz).h] += Math.min(5 * 60_000, s.endedAt - t);
  }
  return arr.map((v) => v / days);
}

/** heatmap cells: last `weeks` weeks, Monday-first columns */
export function yearGrid(daily: Map<string, number>, tz: string, weeks = 53, now = Date.now()) {
  const today = dayKey(now, tz);
  const wd = (partsIn(now, tz).wd + 6) % 7; // 0 = Monday
  const start = addDaysKey(today, -(weeks - 1) * 7 - wd);
  const cols: { key: string; ms: number; future: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const key = addDaysKey(start, w * 7 + d);
      col.push({ key, ms: daily.get(key) || 0, future: key > today });
    }
    cols.push(col);
  }
  return cols;
}

export function weekRange(tz: string, now = Date.now(), offsetWeeks = 0) {
  const today = dayKey(now, tz);
  const wd = (partsIn(now, tz).wd + 6) % 7;
  const monday = addDaysKey(today, -wd - offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));
}

export const rangeKeys = (n: number, tz: string, now = Date.now()) => lastDays(n, tz, now);
export const dayStart = startOfDay;
