/* R-005 personal status: presets, expiry and display helpers */
import type { LiveStatus, PersonalStatus } from "./types";
import { DAY, HOUR, partsIn, zonedToUtc } from "./time";

export const STATUS_MAX = 20;

export const STATUS_PRESETS: { emoji: string; label: string; text: string }[] = [
  { emoji: "😴", label: "睡觉", text: "睡觉了" },
  { emoji: "🎮", label: "出去玩", text: "出去玩" },
  { emoji: "🏫", label: "上课", text: "在上课" },
  { emoji: "🚇", label: "通勤", text: "在路上" },
  { emoji: "🍜", label: "吃饭", text: "吃饭去了" },
  { emoji: "🤒", label: "生病", text: "生病了" },
  { emoji: "✈️", label: "旅行", text: "在旅行" },
];
/** extra icons for a custom status */
export const STATUS_EMOJIS = ["📚", "☕", "🏃", "🎵", "🛒", "💼", "🧹", "🎬", "🏥", "🏠", "🤔", "🔋"];

export type StatusDuration = "hour" | "today" | "manual";
export const DURATIONS: { key: StatusDuration; label: string }[] = [
  { key: "hour", label: "1 小时" },
  { key: "today", label: "今天之内" },
  { key: "manual", label: "直到我清除" },
];

/** next local midnight in tz */
export function nextMidnight(tz: string, now = Date.now()) {
  const p = partsIn(now, tz);
  const t = new Date(Date.UTC(p.y, p.mo - 1, p.d + 1, 12));
  return zonedToUtc(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 0, 0, tz);
}

export function untilFor(d: StatusDuration, tz: string, now = Date.now()) {
  return d === "hour" ? now + HOUR : d === "today" ? nextMidnight(tz, now) : null;
}

export function durationOf(until: number | null | undefined, setAt: number | null | undefined, tz: string): StatusDuration {
  if (until == null) return "manual";
  if (setAt != null && Math.abs(until - setAt - HOUR) < 60_000) return "hour";
  return "today";
}

export interface ActiveStatus { emoji: string; text: string; until: number | null; setAt: number }

/** the status that is set and not yet expired, regardless of focus */
export function activeStatus(l: LiveStatus | undefined, now = Date.now()): ActiveStatus | null {
  if (!l || !l.statusEmoji) return null;
  if (l.statusUntil != null && l.statusUntil <= now) return null;
  return { emoji: l.statusEmoji, text: l.statusText || "", until: l.statusUntil ?? null, setAt: l.statusSetAt ?? l.updatedAt };
}

/** what others should see: focus (and breaks) win over the status */
export function shownStatus(l: LiveStatus | undefined, now = Date.now()) {
  if (l && (l.state === "focus" || l.state === "paused" || l.state === "break")) return null;
  return activeStatus(l, now);
}

export const isSleep = (s: { emoji: string } | null | undefined) => s?.emoji === "😴";

/** "到 23:00" / "到今晚 0 点" / "" */
export function untilLabel(until: number | null, tz: string, now = Date.now()) {
  if (until == null) return "";
  const p = partsIn(until, tz);
  const t = `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
  if (p.h === 0 && p.mi === 0 && until - now < DAY) return "到今晚 0 点";
  return `到 ${t}`;
}

export const statusPatch = (s: PersonalStatus | null, now = Date.now()) => ({
  statusEmoji: s ? s.emoji : null,
  statusText: s ? s.text.trim().slice(0, STATUS_MAX) : null,
  statusUntil: s ? s.until : null,
  statusSetAt: s ? now : null,
});

/* per-device preferences (kept in this browser so they don't need a schema change) */
export interface StatusPrefs {
  /** keep my status when I start focusing (default: clear it) */
  keepOnFocus: boolean;
  /** show classmates' statuses in the feed */
  showInFeed: boolean;
}
const PREFS = "tc-status-prefs-v1";
const DEFAULT_PREFS: StatusPrefs = { keepOnFocus: false, showInFeed: true };
export function readStatusPrefs(): StatusPrefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS) || "{}") }; } catch { return DEFAULT_PREFS; }
}
export function writeStatusPrefs(p: StatusPrefs) {
  try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("tc-status-prefs"));
}
