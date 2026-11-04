/**
 * R-020 个人主页：存在 profiles.page（jsonb）里的结构、各小组件的说明和默认设置、读入时的清洗。
 * Shape: { bio, widgets: [{ id, type, size, config }], guestbook?: boolean } — guestbook === false turns the board off.
 */

export const BIO_MAX = 40;
export const NOTE_MAX = 200;
export const NOTE_TITLE_MAX = 12;
export const GOAL_TITLE_MAX = 16;
export const GOALS_MAX = 3;
export const WIDGETS_MAX = 16;

export type WidgetType = "today" | "streak" | "heatmap" | "subjects" | "hours" | "recent" | "review" | "goals" | "badges" | "note";
export type WidgetSize = "s" | "w";

export interface Goal { title: string; /** YYYY-MM-DD in the owner's time zone */ date: string }

export interface WidgetConfig {
  /** subjects: 7 / 30; hours: 30 / 90 */
  days?: number;
  /** recent: how many entries */
  count?: number;
  /** recent: show subjects only */
  hideTask?: boolean;
  /** goals */
  goals?: Goal[];
  /** note */
  title?: string;
  text?: string;
  /** badges: also show the ones not earned yet (greyed) */
  showLocked?: boolean;
}

export interface Widget { id: string; type: WidgetType; size: WidgetSize; config: WidgetConfig }

export interface ProfilePage {
  bio: string;
  widgets: Widget[];
  /** false = guestbook turned off; missing/true = on */
  guestbook?: boolean;
}

export const WIDGET_INFO: Record<WidgetType, { name: string; desc: string; size: WidgetSize; config: () => WidgetConfig; /** may be added more than once */ multi?: boolean }> = {
  today: { name: "今天 / 本周", desc: "今天和本周的时长、目标进度", size: "s", config: () => ({}) },
  streak: { name: "连续天数", desc: "现在连续了几天，最长连续", size: "s", config: () => ({}) },
  heatmap: { name: "一年的长势", desc: "一年里每天学了多久", size: "w", config: () => ({}) },
  subjects: { name: "科目分布", desc: "最近 7 / 30 天各科目的占比", size: "s", config: () => ({ days: 30 }) },
  hours: { name: "最专注的时段", desc: "一天里最常学习的几个小时", size: "s", config: () => ({ days: 30 }) },
  recent: { name: "最近的专注", desc: "最近几次专注，可以只显示科目", size: "w", config: () => ({ count: 5, hideTask: false }) },
  review: { name: "最近一次收工", desc: "“明天先做什么”和精力、收获", size: "s", config: () => ({}) },
  goals: { name: "正在攻克", desc: "1–3 个长期目标和倒计时", size: "s", config: () => ({ goals: [] }) },
  badges: { name: "里程碑徽章", desc: "累计时长、连续天数、长时间心流…", size: "w", config: () => ({ showLocked: true }) },
  note: { name: "便签", desc: "随便写点什么", size: "s", config: () => ({ title: "", text: "" }), multi: true },
};
export const WIDGET_ORDER: WidgetType[] = ["today", "streak", "heatmap", "subjects", "hours", "recent", "review", "goals", "badges", "note"];

export const newWidgetId = () => "w" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export function newWidget(type: WidgetType): Widget {
  return { id: newWidgetId(), type, size: WIDGET_INFO[type].size, config: WIDGET_INFO[type].config() };
}

/** what a new person (no page saved yet) shows */
export function defaultPage(): ProfilePage {
  const w = (id: string, type: WidgetType, size?: WidgetSize): Widget => ({ id, type, size: size || WIDGET_INFO[type].size, config: WIDGET_INFO[type].config() });
  return {
    bio: "",
    widgets: [w("d-today", "today"), w("d-streak", "streak"), w("d-heat", "heatmap"), w("d-subj", "subjects"), w("d-badges", "badges"), w("d-recent", "recent")],
  };
}

const isKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (s: unknown, max: number) => (typeof s === "string" ? s.slice(0, max) : "");

function cleanConfig(type: WidgetType, c: unknown): WidgetConfig {
  const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
  const base = WIDGET_INFO[type].config();
  switch (type) {
    case "subjects": return { days: o.days === 7 ? 7 : 30 };
    case "hours": return { days: o.days === 90 ? 90 : 30 };
    case "recent": return { count: [3, 5, 8].includes(o.count as number) ? (o.count as number) : 5, hideTask: !!o.hideTask };
    case "goals": return {
      goals: (Array.isArray(o.goals) ? o.goals : []).slice(0, GOALS_MAX)
        .map((g) => ({ title: str((g as Goal)?.title, GOAL_TITLE_MAX), date: isKey((g as Goal)?.date) ? (g as Goal).date : "" }))
        .filter((g) => g.title || g.date),
    };
    case "note": return { title: str(o.title, NOTE_TITLE_MAX), text: str(o.text, NOTE_MAX) };
    case "badges": return { showLocked: o.showLocked !== false };
    default: return base;
  }
}

/** read whatever is stored (possibly nothing, possibly from an older or newer version) into a valid page */
export function normalizePage(raw: unknown): ProfilePage {
  if (!raw || typeof raw !== "object") return defaultPage();
  const o = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const widgets: Widget[] = [];
  for (const x of Array.isArray(o.widgets) ? o.widgets : []) {
    const w = x as Partial<Widget>;
    if (!w || typeof w !== "object" || !w.type || !(w.type in WIDGET_INFO)) continue; // unknown types are dropped
    let id = typeof w.id === "string" && w.id ? w.id.slice(0, 40) : newWidgetId();
    if (seen.has(id)) id = newWidgetId();
    seen.add(id);
    widgets.push({ id, type: w.type, size: w.size === "w" ? "w" : "s", config: cleanConfig(w.type, w.config) });
    if (widgets.length >= WIDGETS_MAX) break;
  }
  const page: ProfilePage = { bio: str(o.bio, BIO_MAX), widgets };
  if (o.guestbook === false) page.guestbook = false;
  return page;
}

/** whole days from today to `date`, both in the owner's calendar (negative = past) */
export function daysUntil(date: string, todayKey: string) {
  const [y1, m1, d1] = todayKey.split("-").map(Number);
  const [y2, m2, d2] = date.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
export function countdownLabel(date: string, todayKey: string) {
  if (!date) return "";
  const n = daysUntil(date, todayKey);
  return n > 1 ? `还剩 ${n} 天` : n === 1 ? "明天" : n === 0 ? "就是今天" : `已过 ${-n} 天`;
}
