/** R-001 专注模式：三种模式的说明、心流的休息建议、同窗看到的文字 */
import type { FocusMode, FocusPrefs, LiveStatus, Profile } from "./types";
import { MIN } from "./time";

export const MODES: FocusMode[] = ["pomodoro", "stopwatch", "countdown"];

export const MODE_INFO: Record<FocusMode, { name: string; desc: string }> = {
  pomodoro: { name: "番茄钟", desc: "专注一段，休息一会" },
  stopwatch: { name: "心流", desc: "正计时，想停就停" },
  countdown: { name: "倒计时", desc: "专注到时间归零" },
};

/** anything unknown (or the old "stopwatch") counts as flow */
export function normMode(m: unknown): FocusMode {
  return m === "pomodoro" || m === "countdown" ? m : "stopwatch";
}

export const DEFAULT_PREFS: FocusPrefs = { flowBreak: "ratio", flowPct: 20, pomoOvertime: false };

export function prefsOf(p?: Profile | null): FocusPrefs {
  const f = p?.focusPrefs;
  if (!f || typeof f !== "object") return DEFAULT_PREFS;
  return {
    flowBreak: f.flowBreak === "table" ? "table" : "ratio",
    flowPct: Number.isFinite(+f.flowPct) ? Math.min(50, Math.max(5, Math.round(+f.flowPct))) : DEFAULT_PREFS.flowPct,
    pomoOvertime: !!f.pomoOvertime,
  };
}

/** [focused minutes below which, break minutes]; matched in order */
export const BREAK_TABLE: [number, number][] = [[25, 5], [50, 8], [90, 10], [Infinity, 15]];

/** suggested break after a flow (or countdown) block, in whole minutes */
export function suggestBreakMin(focusMs: number, prefs: FocusPrefs): number {
  const m = focusMs / MIN;
  if (prefs.flowBreak === "table") return (BREAK_TABLE.find(([upTo]) => m < upTo) || BREAK_TABLE[BREAK_TABLE.length - 1])[1];
  return Math.min(30, Math.max(2, Math.round((m * prefs.flowPct) / 100)));
}

/** flow mode: one star outside the window for every 25 focused minutes */
export const STAR_MS = 25 * MIN;

/** what classmates see next to the clock: "已专注" for flow, "还剩" for timers */
export function livePrefix(l: LiveStatus | undefined, now: number): string {
  if (!l || (l.state !== "focus" && l.state !== "paused")) return "";
  return l.plannedEnd && l.plannedEnd > now ? "还剩" : "已专注";
}

/** the status pill text: "心流中" instead of "专注中" while in flow mode */
export function liveStateText(l: LiveStatus | undefined): string {
  const s = l?.state || "idle";
  if (s === "focus") return normMode(l?.mode) === "stopwatch" ? "心流中" : "专注中";
  return s === "break" ? "休息中" : s === "paused" ? "暂停" : "离开";
}

/** remembered countdown length (per device) */
const CD_KEY = "tc-countdown-min";
export function lastCountdownMin(): number {
  try { const n = Number(localStorage.getItem(CD_KEY)); return n >= 1 && n <= 300 ? Math.round(n) : 30; } catch { return 30; }
}
export function rememberCountdownMin(m: number) {
  try { localStorage.setItem(CD_KEY, String(Math.round(m))); } catch { /* */ }
}
