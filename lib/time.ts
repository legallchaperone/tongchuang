export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const browserTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions, locale = "en-CA") {
  const k = locale + tz + JSON.stringify(opts);
  let f = fmtCache.get(k);
  if (!f) {
    try { f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }); }
    catch { f = new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts }); }
    fmtCache.set(k, f);
  }
  return f;
}

/** wall-clock parts of an instant in a time zone */
export function partsIn(ms: number, tz: string) {
  const p = fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" }, "en-US").formatToParts(ms);
  const g = (t: string) => p.find((x) => x.type === t)?.value || "0";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { y: +g("year"), mo: +g("month"), d: +g("day"), h: +g("hour") % 24, mi: +g("minute"), s: +g("second"), wd };
}

/** offset of tz from UTC in minutes at instant ms */
export function offsetMin(tz: string, ms = Date.now()) {
  const p = partsIn(ms, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MIN);
}

/** epoch ms of a wall-clock time in tz */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - offsetMin(tz, guess) * MIN;
  t = guess - offsetMin(tz, t) * MIN;
  return t;
}

/** YYYY-MM-DD of an instant in tz */
export function dayKey(ms: number, tz: string) {
  const p = partsIn(ms, tz);
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** start (epoch ms) of the local day containing ms */
export function startOfDay(ms: number, tz: string) {
  const p = partsIn(ms, tz);
  return zonedToUtc(p.y, p.mo, p.d, 0, 0, tz);
}

/** list of the last n day keys ending today, oldest first */
export function lastDays(n: number, tz: string, now = Date.now()) {
  const out: string[] = [];
  const p = partsIn(now, tz);
  for (let i = n - 1; i >= 0; i--) {
    const t = Date.UTC(p.y, p.mo - 1, p.d - i, 12);
    const d = new Date(t);
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`);
  }
  return out;
}

export function addDaysKey(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n, 12));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
export function weekdayOfKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export const hhmm = (ms: number, tz: string) => {
  const p = partsIn(ms, tz);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
};

export function tzDiffLabel(theirTz: string, myTz: string, ms = Date.now()) {
  const d = (offsetMin(theirTz, ms) - offsetMin(myTz, ms)) / 60;
  if (d === 0) return "与你同时区";
  const n = Math.abs(d);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return d > 0 ? `快你 ${s} 小时` : `慢你 ${s} 小时`;
}

export function tzCity(tz: string) {
  const map: Record<string, string> = {
    "Asia/Shanghai": "上海", "Asia/Hong_Kong": "香港", "Asia/Taipei": "台北", "Asia/Tokyo": "东京", "Asia/Seoul": "首尔",
    "Asia/Singapore": "新加坡", "Europe/London": "伦敦", "Europe/Paris": "巴黎", "Europe/Berlin": "柏林", "Europe/Amsterdam": "阿姆斯特丹",
    "America/New_York": "纽约", "America/Chicago": "芝加哥", "America/Denver": "丹佛", "America/Los_Angeles": "洛杉矶", "America/Toronto": "多伦多",
    "America/Vancouver": "温哥华", "Australia/Sydney": "悉尼", "Australia/Melbourne": "墨尔本", "Pacific/Auckland": "奥克兰", "UTC": "UTC",
  };
  return map[tz] || tz.split("/").pop()!.replace(/_/g, " ");
}

/** time-of-day phase for the sky treatment */
export type Phase = "night" | "dawn" | "day" | "dusk";
export function phaseAt(hour: number): Phase {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}
export const phaseLabel: Record<Phase, string> = { night: "深夜", dawn: "清晨", day: "白天", dusk: "傍晚" };

export function clock(ms: number, withHours = false) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(sec).padStart(2, "0");
  return h > 0 || withHours ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "2小时15分" */
export function dur(ms: number) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}小时${r}分` : `${h}小时`;
}
/** "2.3h" / "45m" */
export function durShort(ms: number) {
  const h = ms / HOUR;
  if (h >= 10) return `${Math.round(h)}h`;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.round(ms / MIN)}m`;
}
/** hours with 1 decimal as a number string */
export const hrs = (ms: number) => (ms / HOUR).toFixed(1);

export function ago(ms: number, now = Date.now()) {
  const d = now - ms;
  const m = Math.floor(d / MIN);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  return days === 1 ? "昨天" : `${days} 天前`;
}

export const weekdayCn = ["日", "一", "二", "三", "四", "五", "六"];

export const COMMON_TZS = [
  "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Tokyo", "Asia/Seoul", "Asia/Singapore",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Amsterdam",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Vancouver",
  "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland", "UTC",
];
