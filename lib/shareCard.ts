/**
 * R-011 分享热力图：把一年的“庄稼长势”画成一张竖版像素卡片（纯 canvas，无依赖）。
 * Everything is drawn at a small native resolution (W x H) — text included, binarised so no
 * anti-aliasing survives — then scaled up by a whole number so every pixel stays sharp.
 */
import type { Session, Subject } from "./types";
import { byDay, streaks, subjectTotals, touching, yearGrid } from "./stats";
import { HOUR } from "./time";
import { drawGrid, portrait, shade, type AvatarLook, type Grid } from "./pixel";
import { drawShareFooter, FOOTER_H, PAL, renderPixelPng, sky, text, textW, fit, rect, tile, woodFrame, type CardTheme, type Pal } from "./shareKit";
export type { CardTheme } from "./shareKit";

export const CARD_W = 360;
export const CARD_H = 524;
/** 360 x 3 = 1080 px wide output */
export const CARD_SCALE = 3;

type Cell = { key: string; ms: number; future: boolean };

export interface ShareData {
  name: string;
  look: AvatarLook;
  shirt: string;
  cols: Cell[][];
  from: string; // YYYY-MM-DD
  to: string;
  totalMs: number;
  activeDays: number;
  bestStreak: number;
  top: { name: string; pct: number } | null;
}

/** the numbers on the card: the last 53 weeks of one person's own records */
export function shareData(o: { sessions: Session[]; subjects: Subject[]; tz: string; now: number; name: string; look: AvatarLook; shirt: string }): ShareData {
  const daily = byDay(o.sessions, o.tz);
  const cols = yearGrid(daily, o.tz, 53, o.now);
  const days = cols.flat().filter((c) => !c.future);
  const from = days[0].key, to = days[days.length - 1].key;
  const inYear = new Map(days.filter((d) => d.ms > 0).map((d) => [d.key, d.ms]));
  const totalMs = Array.from(inYear.values()).reduce((a, v) => a + v, 0);
  const subj = subjectTotals(touching(o.sessions, o.tz, new Set(days.map((d) => d.key))), o.subjects);
  const subjMs = subj.reduce((a, x) => a + x.ms, 0);
  const t = subj[0];
  return {
    name: o.name, look: o.look, shirt: o.shirt, cols, from, to, totalMs,
    activeDays: inYear.size,
    bestStreak: streaks(inYear, o.tz, o.now).best,
    top: t && subjMs > 0 ? { name: t.subject?.name || "未分类", pct: Math.round((t.ms / subjMs) * 100) } : null,
  };
}

/** same thresholds as the heatmap on the stats page: 30 min / 1.5 h / 3 h / 5 h */
const LEVELS = [0, 0.5 * HOUR, 1.5 * HOUR, 3 * HOUR, 5 * HOUR];
const level = (ms: number) => (ms <= 0 ? 0 : LEVELS.filter((l) => ms >= l).length);

/* crops growing in a heatmap cell, one sprite per level (9 x 9 cell) */
const CROPS: string[][] = [
  [],
  [".........", ".........", ".........", ".........", ".........", "...o.o...", "....o....", "....o....", "........."],
  [".........", ".........", ".........", "..o...o..", "...o.o...", "....o....", "....o....", "....o....", "........."],
  [".........", "....o....", "...ooo...", "..o.o.o..", "....o....", "..o.o.o..", "...ooo...", "....o....", "........."],
  [".........", "..o...o..", ".ooo.ooo.", "..o...o..", "o.o.o.o.o", ".oo...oo.", "..o...o..", "..o...o..", "........."],
  ["....g....", "...ggg...", "...ggg...", "..o.g.o..", "...ooo...", "..o.o.o..", "...ooo...", "....o....", "........."],
];

function cell(ctx: CanvasRenderingContext2D, x: number, y: number, lv: number, p: Pal) {
  const base = p.q[lv];
  rect(ctx, x, y, 9, 9, base);
  rect(ctx, x, y + 8, 9, 1, shade(base, -0.16)); rect(ctx, x + 8, y, 1, 9, shade(base, -0.16));
  const map = CROPS[lv];
  // dark theme: the ripest cells are pale, so their crops are drawn darker instead
  const sprout = shade(base, p.night && lv >= 3 ? -0.38 : p.sprout);
  map.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) {
    const ch = row[rx];
    if (ch === "o") rect(ctx, x + rx, y + ry, 1, 1, sprout);
    else if (ch === "g") rect(ctx, x + rx, y + ry, 1, 1, p.grain);
  } });
  if (lv === 0) { const d = shade(base, p.night ? 0.12 : -0.09); rect(ctx, x + 2, y + 5, 1, 1, d); rect(ctx, x + 5, y + 3, 1, 1, d); }
}

function heatBlock(ctx: CanvasRenderingContext2D, cols: Cell[][], allCols: Cell[][], offset: number, x: number, y: number, p: Pal) {
  // month labels (skip one that would collide with the previous)
  let lastEnd = -99;
  cols.forEach((c, i) => {
    const gi = offset + i;
    const m = c[0].key.slice(5, 7);
    if (i !== 0 && m === allCols[gi - 1][0].key.slice(5, 7)) return;
    const lx = x + i * 11;
    const label = Number(m) + "月";
    if (lx < lastEnd + 4) return;
    const w = text(ctx, label, lx, y, p.ink3);
    lastEnd = lx + w;
  });
  const gy = y + 15;
  ["一", "", "三", "", "五", "", "日"].forEach((d, i) => d && text(ctx, d, x - 15, gy + i * 11 - 2, p.ink3));
  cols.forEach((c, ci) => c.forEach((d, di) => {
    const cx = x + ci * 11, cy = gy + di * 11;
    if (d.future) { rect(ctx, cx + 4, cy + 4, 1, 1, p.slot); return; }
    cell(ctx, cx, cy, level(d.ms), p);
  }));
}

function fmtDate(k: string) { return k.replace(/-/g, "."); }

/** all the text on the card, so the font slices can be loaded up front */
export function cardText(d: ShareData) {
  return [
    titleOf(d), "最近一年的庄稼长势", fmtDate(d.from), fmtDate(d.to), "–", "一二三四五六日月0123456789",
    "少多一格是一天", "总时长", "小时", "专注天数", "天", "最长连续", "最常学", "占", "%", "同窗", "study.cwx.world", "…",
    d.top?.name || "", "还没有记录",
  ].join("");
}
const titleOf = (d: ShareData) => (d.name === "我" ? "我的一年" : `${d.name}的一年`);

/** draw the card at native size into ctx (CARD_W x CARD_H) */
export function drawCard(ctx: CanvasRenderingContext2D, d: ShareData, theme: CardTheme) {
  const p = PAL[theme];
  const W = CARD_W, H = CARD_H;
  // plank floor
  for (let y = 0; y < H; y += 8) {
    rect(ctx, 0, y, W, 8, (y / 8) % 2 ? p.floorB : p.floorA);
    rect(ctx, 0, y + 7, W, 1, p.seam);
    const off = (y / 8) % 2 ? 37 : 91;
    for (let x = off; x < W; x += 120) rect(ctx, x, y, 1, 7, p.seam);
  }
  // the card
  woodFrame(ctx, 6, 6, W - 12, H - 12, p);
  rect(ctx, 10, 10, W - 20, H - 20, p.panel);

  // header: portrait in a little window
  const wx = 22, wy = 22;
  rect(ctx, wx + 1, wy, 52, 54, p.edge); rect(ctx, wx, wy + 1, 54, 52, p.edge);
  rect(ctx, wx + 1, wy + 1, 52, 52, p.wood); rect(ctx, wx + 1, wy + 1, 52, 1, p.woodHi);
  rect(ctx, wx + 2, wy + 2, 50, 50, p.edge);
  sky(ctx, wx + 3, wy + 3, 48, 48, p);
  const g: Grid = portrait(d.look, d.shirt).slice(1);
  ctx.save(); ctx.translate(wx + 3, wy + 3 + 48 - g.length * 3); ctx.scale(3, 3); drawGrid(ctx, g, 0, 0); ctx.restore();

  const tx = 88;
  text(ctx, fit(titleOf(d), W - tx - 20, 2), tx, 36, p.ink, 2);

  // divider
  for (let x = 22; x < W - 22; x += 4) rect(ctx, x, 86, 2, 1, p.slot);

  // the year, in two half-year fields
  const half = Math.ceil(d.cols.length / 2);
  const hx = Math.round((W - (half * 11 - 2)) / 2) + 6;
  heatBlock(ctx, d.cols.slice(0, half), d.cols, 0, hx, 96, p);
  heatBlock(ctx, d.cols.slice(half), d.cols, half, hx, 194, p);

  // legend
  const ly = 290;
  let lx = hx + half * 11 - 2;
  const lw = 6 * 11 - 2;
  lx -= textW("多") + 4 + lw + 4 + textW("少");
  lx += text(ctx, "少", lx, ly, p.ink3) + 4;
  for (let i = 0; i < 6; i++) cell(ctx, lx + i * 11, ly + 1, i, p);
  lx += lw + 4;
  text(ctx, "多", lx, ly, p.ink3);

  // key numbers: 2 x 2 tiles
  const ty = 314, tw = 155, th = 50, gap = 6;
  const tx0 = Math.round((W - (tw * 2 + gap)) / 2);
  const hoursStr = d.totalMs >= 100 * HOUR ? String(Math.round(d.totalMs / HOUR)) : (d.totalMs / HOUR).toFixed(1);
  const tiles: { k: string; v: string; u: string }[] = [
    { k: "总时长", v: hoursStr, u: "小时" },
    { k: "专注天数", v: String(d.activeDays), u: "天" },
    { k: "最长连续", v: String(d.bestStreak), u: "天" },
    d.top ? { k: "最常学", v: d.top.name, u: `占${d.top.pct}%` } : { k: "最常学", v: "—", u: "" },
  ];
  tiles.forEach((t, i) => {
    const x = tx0 + (i % 2) * (tw + gap), y = ty + Math.floor(i / 2) * (th + gap);
    tile(ctx, x, y, tw, th, p);
    text(ctx, t.k, x + 8, y + 5, p.ink3);
    const uw = t.u ? textW(t.u) + 4 : 0;
    const v = fit(t.v, tw - 16 - uw, 2);
    const vw = text(ctx, v, x + 8, y + 20, p.ink, 2);
    if (t.u) text(ctx, t.u, x + 8 + vw + 4, y + 32, p.ink2);
  });

  // R-022: shared footer with the QR code to the product page
  drawShareFooter(ctx, 22, H - 14 - FOOTER_H, W - 44, p, "share-year");
}

/** render the full-size PNG */
export async function renderCard(d: ShareData, theme: CardTheme, scale = CARD_SCALE): Promise<{ blob: Blob; url: string }> {
  return renderPixelPng(CARD_W, CARD_H, scale, cardText(d), (ctx) => drawCard(ctx, d, theme));
}
