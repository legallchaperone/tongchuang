/**
 * R-020 里程碑徽章：全部由已有的专注记录算出来（不单独存），以及每枚像素小奖章的画法（原创，13 × 16）。
 * The same grid feeds the SVG on the page and the canvas of the share image.
 */
import type { Session } from "./types";
import { HOUR, partsIn } from "./time";
import { shade, type Grid } from "./pixel";

export type BadgeKind = "first" | "hours" | "streak" | "flow" | "pomo" | "early" | "night";

export interface Badge {
  id: string;
  kind: BadgeKind;
  /** 0 bronze · 1 silver · 2 gold · 3 jade */
  tier: number;
  name: string;
  desc: string;
  earned: boolean;
  /** how far along, for the ones not earned yet: "37 / 50 小时" */
  progress?: string;
}

/**
 * sessions: one person's finished records (as far back as loaded); bestStreak from stats.streaks().
 * Order = display order; earned ones are listed first by the caller when it wants.
 */
export function computeBadges(sessions: Session[], tz: string, bestStreak: number): Badge[] {
  const real = sessions.filter((s) => s.id !== "live");
  const total = real.reduce((a, s) => a + s.durationMs, 0);
  const longestFlow = real.filter((s) => s.mode === "stopwatch").reduce((a, s) => Math.max(a, s.durationMs), 0);
  const pomos = real.filter((s) => s.mode === "pomodoro").length;
  let early = false, night = false;
  for (const s of real) {
    if (!early) { const h = partsIn(s.startedAt, tz).h; if (h >= 4 && h < 6) early = true; }
    // still at it 10+ minutes past local midnight (but not a timer left running for half a day)
    if (!night && s.endedAt - s.startedAt < 12 * HOUR) { const p = partsIn(s.endedAt, tz); if (p.h < 3 && p.h * 60 + p.mi >= 10) night = true; }
    if (early && night) break;
  }
  const h = total / HOUR;
  const hours = (n: number, tier: number): Badge => ({
    id: `hours-${n}`, kind: "hours", tier, name: `${n} 小时`, desc: `累计专注 ${n} 小时`, earned: h >= n,
    progress: h >= n ? undefined : `${Math.floor(h)} / ${n} 小时`,
  });
  const streak = (n: number, tier: number): Badge => ({
    id: `streak-${n}`, kind: "streak", tier, name: `连续 ${n} 天`, desc: `连续 ${n} 天每天至少学 15 分钟`, earned: bestStreak >= n,
    progress: bestStreak >= n ? undefined : `最长 ${bestStreak} / ${n} 天`,
  });
  return [
    { id: "first", kind: "first", tier: 0, name: "起步", desc: "完成第一次专注", earned: real.length > 0 },
    hours(10, 0), hours(50, 1), hours(100, 2), hours(500, 3),
    streak(7, 0), streak(30, 1), streak(100, 3),
    { id: "flow-2h", kind: "flow", tier: 2, name: "心流 2 小时", desc: "一次心流专注满 2 小时", earned: longestFlow >= 2 * HOUR,
      progress: longestFlow >= 2 * HOUR ? undefined : `最长 ${Math.floor(longestFlow / 60_000)} / 120 分` },
    { id: "pomo-100", kind: "pomo", tier: 1, name: "百个番茄", desc: "完成 100 个番茄钟", earned: pomos >= 100,
      progress: pomos >= 100 ? undefined : `${pomos} / 100 个` },
    { id: "early", kind: "early", tier: 0, name: "早起的鸟", desc: "在当地早上 4–6 点开始专注", earned: early },
    { id: "night", kind: "night", tier: 0, name: "夜读", desc: "专注到当地午夜之后", earned: night },
  ];
}

/* ─────────── pixel medals ─────────── */
const OUT = "#3a2016";
const METALS = [
  { m: "#c98a4b", h: "#eab27c", d: "#8a5426" }, // bronze
  { m: "#b9c3cc", h: "#eef3f7", d: "#76828f" }, // silver
  { m: "#f2c14e", h: "#ffe9a0", d: "#b07c22" }, // gold
  { m: "#5fc7b5", h: "#b3f1e2", d: "#2c8676" }, // jade
];
const RIBBONS: Record<BadgeKind, [string, string]> = {
  first: ["#1baf7a", "#9bd27a"],
  hours: ["#2a78d6", "#7cc6f2"],
  streak: ["#e34948", "#eb6834"],
  flow: ["#6250d6", "#9085e9"],
  pomo: ["#e34948", "#1baf7a"],
  early: ["#eda100", "#ffe680"],
  night: ["#202c61", "#5a6bb0"],
};
const EMBLEMS: Record<BadgeKind, string[]> = {
  first: ["#...#", ".#.#.", "..#..", "..#..", ".###."],
  hours: ["#####", ".#.#.", "..#..", ".###.", "#####"],
  streak: ["..#..", ".##..", ".###.", "#####", ".###."],
  flow: ["..#..", ".###.", "#####", ".###.", "#...#"],
  pomo: [".#.#.", "..#..", ".###.", "#####", ".###."],
  early: ["#.#.#", ".###.", "#####", ".###.", "#.#.#"],
  night: [".###.", "##...", "##...", "##...", ".###."],
};
const RIBBON_ROWS = [
  ".oooo...oooo.",
  ".oaaao.obbbo.",
  "..oaaaobbbo..",
  "...oaaabbo...",
  "....oaabo....",
];
export const MEDAL_W = 13, MEDAL_H = 16;

/** one medal as a colour grid; locked medals are drawn as a grey outline */
export function medalGrid(b: Pick<Badge, "kind" | "tier" | "earned">, lockedTone: { fill: string; line: string } = { fill: "#d9c39a", line: "#b39a70" }): Grid {
  const g: Grid = Array.from({ length: MEDAL_H }, () => Array<string | null>(MEDAL_W).fill(null));
  const met = METALS[Math.max(0, Math.min(3, b.tier))];
  const [ra, rb] = RIBBONS[b.kind];
  const lock = !b.earned;
  RIBBON_ROWS.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === "o") g[y][x] = lock ? lockedTone.line : OUT;
    else if (ch === "a") g[y][x] = lock ? lockedTone.fill : ra;
    else if (ch === "b") g[y][x] = lock ? lockedTone.fill : rb;
  }));
  const cx = 6, cy = 10;
  for (let y = 4; y < MEDAL_H; y++) for (let x = 0; x < MEDAL_W; x++) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d > 5.6) continue;
    if (d > 4.6) { g[y][x] = lock ? lockedTone.line : OUT; continue; }
    if (lock) { g[y][x] = lockedTone.fill; continue; }
    g[y][x] = d > 3.4 && dx + dy < -2 ? met.h : d > 3.4 && dx + dy > 2 ? met.d : met.m;
  }
  const em = EMBLEMS[b.kind];
  const ink = lock ? lockedTone.line : shade(met.d, -0.25);
  em.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") g[cy - 2 + y][cx - 2 + x] = ink; }));
  return g;
}
