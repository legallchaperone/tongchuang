/**
 * R-011 分享热力图：把一年的“庄稼长势”画成一张竖版像素卡片（纯 canvas，无依赖）。
 * Everything is drawn at a small native resolution (W x H) — text included, binarised so no
 * anti-aliasing survives — then scaled up by a whole number so every pixel stays sharp.
 */
import type { Session, Subject } from "./types";
import { byDay, streaks, subjectTotals, touching, yearGrid } from "./stats";
import { HOUR } from "./time";
import { drawGrid, portrait, shade, type AvatarLook, type Grid } from "./pixel";

export const CARD_W = 360;
export const CARD_H = 480;
/** 360 x 3 = 1080 px wide output */
export const CARD_SCALE = 3;

export type CardTheme = "light" | "dark";
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

/* ─────────── palettes (mirror the tokens in app/globals.css) ─────────── */
const PAL = {
  light: {
    floorA: "#c4874f", floorB: "#b97d47", seam: "#8e5730",
    panel: "#f8e6bd", panel2: "#f0d7a2", slot: "#e6c88e",
    ink: "#3a2016", ink2: "#6b4429", ink3: "#9a7350",
    wood: "#a8683a", woodHi: "#d39a5e", woodDk: "#6e3d1d", edge: "#3a2016", onWood: "#fff1d2",
    q: ["#e6c88e", "#c6d98a", "#93c467", "#5fa848", "#3e8a3c", "#25652a"],
    sprout: -0.32, grain: "#e9b23c",
    sky: ["#7cc6f2", "#9ad4f6", "#bfe5fa"], hill: "#5aa25a", night: false,
  },
  dark: {
    floorA: "#2b1d14", floorB: "#261a11", seam: "#1a110b",
    panel: "#33261c", panel2: "#3d2e22", slot: "#4a3828",
    ink: "#f6e7c8", ink2: "#d8bf96", ink3: "#a8885f",
    wood: "#5e3a20", woodHi: "#8a5a34", woodDk: "#2a1a10", edge: "#120b07", onWood: "#ffeccc",
    q: ["#4a3828", "#3c5a2c", "#4f7a35", "#64983f", "#84b852", "#b5d97a"],
    sprout: 0.3, grain: "#f5c75a",
    sky: ["#0f1533", "#172049", "#202c61"], hill: "#18304a", night: true,
  },
};
type Pal = (typeof PAL)["light"];

/** same thresholds as the heatmap on the stats page: 30 min / 1.5 h / 3 h / 5 h */
const LEVELS = [0, 0.5 * HOUR, 1.5 * HOUR, 3 * HOUR, 5 * HOUR];
const level = (ms: number) => (ms <= 0 ? 0 : LEVELS.filter((l) => ms >= l).length);

/* ─────────── pixel text ─────────── */
const FAMILY = '"Fusion Pixel 12px Proportional Simplified Chinese"';
const FONT = `12px ${FAMILY}, "Zpix", monospace`;

/** make sure the unicode-range slices for every glyph on the card are loaded before drawing */
export async function ensureCardFont(text: string) {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) return;
  try {
    await fonts.load(`12px ${FAMILY}`, text);
    await fonts.ready;
  } catch { /* fall back to whatever is available */ }
}

let measurer: CanvasRenderingContext2D | null = null;
function mctx() {
  if (!measurer) { measurer = document.createElement("canvas").getContext("2d")!; measurer.font = FONT; }
  return measurer;
}
export const textW = (t: string) => Math.ceil(mctx().measureText(t).width);

/** draws 12px text whose top-left is (x, y), thresholded to hard pixels, scaled by s; returns the width */
function text(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, color: string, s = 1) {
  if (!t) return 0;
  const w = textW(t) + 2, h = 16;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.font = FONT; g.textBaseline = "alphabetic"; g.fillStyle = "#000";
  g.fillText(t, 0, 10);
  const a = g.getImageData(0, 0, w, h).data;
  ctx.fillStyle = color;
  // glyph cell: 12px tall with the baseline at 10
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    if (a[(py * w + px) * 4 + 3] >= 110) ctx.fillRect(x + px * s, y + py * s, s, s);
  }
  return (w - 2) * s;
}
/** shorten to fit maxW (at scale s), adding … */
function fit(t: string, maxW: number, s = 1) {
  if (textW(t) * s <= maxW) return t;
  let out = t;
  while (out.length > 1 && textW(out + "…") * s > maxW) out = out.slice(0, -1);
  return out + "…";
}

/* ─────────── primitives ─────────── */
function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

/** pixel frame like the app's cards: notched outline, bevelled wood rim, parchment fill */
function woodFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: Pal) {
  rect(ctx, x + 1, y, w - 2, h, p.edge); rect(ctx, x, y + 1, w, h - 2, p.edge);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, p.wood);
  rect(ctx, x + 1, y + 1, w - 2, 1, p.woodHi); rect(ctx, x + 1, y + 1, 1, h - 2, p.woodHi);
  rect(ctx, x + 1, y + h - 2, w - 2, 1, p.woodDk); rect(ctx, x + w - 2, y + 1, 1, h - 2, p.woodDk);
  rect(ctx, x + 3, y + 3, w - 6, h - 6, p.edge);
}
/** a small inset tile with notched corners */
function tile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: Pal) {
  rect(ctx, x + 1, y, w - 2, h, p.edge); rect(ctx, x, y + 1, w, h - 2, p.edge);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, p.panel2);
  rect(ctx, x + 1, y + h - 3, w - 2, 2, shade(p.panel2, p.night ? -0.25 : -0.06));
}
/** a wooden name tag (like the card headings in the app) */
function tag(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, p: Pal) {
  const w = textW(t) + 12, h = 16;
  rect(ctx, x + 1, y, w - 2, h, p.edge); rect(ctx, x, y + 1, w, h - 2, p.edge);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, p.wood); rect(ctx, x + 1, y + 1, w - 2, 1, p.woodHi);
  text(ctx, t, x + 6, y + 2, p.onWood);
  return w;
}

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

function sky(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: Pal) {
  const bh = Math.ceil(h / 3);
  p.sky.forEach((c, i) => rect(ctx, x, y + i * bh, w, Math.min(bh, h - i * bh), c));
  if (p.night) {
    [[6, 5], [30, 3], [40, 12], [14, 15], [24, 9]].forEach(([sx, sy]) => rect(ctx, x + sx, y + sy, 1, 1, "#c9d3ff"));
    rect(ctx, x + w - 12, y + 4, 4, 1, "#f6f0c8"); rect(ctx, x + w - 13, y + 5, 5, 3, "#f6f0c8"); rect(ctx, x + w - 12, y + 8, 4, 1, "#f6f0c8");
    rect(ctx, x + w - 11, y + 5, 3, 3, p.sky[0]);
  } else {
    const sx = x + w - 13, sy = y + 4;
    rect(ctx, sx + 1, sy, 3, 5, "#ffe680"); rect(ctx, sx, sy + 1, 5, 3, "#ffe680");
    rect(ctx, x + 4, y + 8, 9, 2, "#ffffff"); rect(ctx, x + 6, y + 7, 5, 1, "#ffffff");
  }
  for (let i = 0; i < w; i++) {
    const hh = 3 + Math.round(Math.sin(i / 3.2) * 1.5 + Math.sin(i / 7) * 1.5);
    rect(ctx, x + i, y + h - hh, 1, hh, p.hill);
  }
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
  text(ctx, fit(titleOf(d), W - tx - 20, 2), tx, 24, p.ink, 2);
  text(ctx, "最近一年的庄稼长势", tx, 52, p.ink2);
  text(ctx, `${fmtDate(d.from)} – ${fmtDate(d.to)}`, tx, 66, p.ink3);

  // divider
  for (let x = 22; x < W - 22; x += 4) rect(ctx, x, 86, 2, 1, p.slot);

  // the year, in two half-year fields
  const half = Math.ceil(d.cols.length / 2);
  const hx = Math.round((W - (half * 11 - 2)) / 2) + 6;
  heatBlock(ctx, d.cols.slice(0, half), d.cols, 0, hx, 96, p);
  heatBlock(ctx, d.cols.slice(half), d.cols, half, hx, 194, p);

  // legend
  const ly = 290;
  text(ctx, "一格是一天", hx - 15, ly, p.ink3);
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

  // footer: a row of crops and the site
  const fy = 432;
  for (let x = 22; x < W - 22; x += 4) rect(ctx, x, fy - 6, 2, 1, p.slot);
  const brand = "同窗", site = "study.cwx.world";
  const bw = textW(brand) * 2, sw = textW(site);
  const bx = Math.round((W - (bw + 8 + sw)) / 2);
  logo(ctx, bx - 18, fy + 4, p);
  text(ctx, brand, bx, fy + 2, p.ink, 2);
  text(ctx, site, bx + bw + 8, fy + 13, p.ink2);
}

/** a tiny desk lamp, the app's mark */
function logo(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal) {
  const shadeC = "#3f7d5c";
  rect(ctx, x + 1, y, 10, 1, shadeC); rect(ctx, x, y + 1, 12, 4, shadeC); rect(ctx, x, y + 1, 12, 1, "#5aa27a");
  rect(ctx, x + 2, y + 5, 8, 1, "#fff2a8");
  rect(ctx, x + 5, y + 6, 2, 8, p.night ? "#5aa27a" : "#2f4a3a");
  rect(ctx, x + 2, y + 14, 8, 3, p.night ? "#5aa27a" : "#2f4a3a");
}

/** render the full-size PNG */
export async function renderCard(d: ShareData, theme: CardTheme, scale = CARD_SCALE): Promise<{ blob: Blob; url: string }> {
  await ensureCardFont(cardText(d));
  measurer = null; // re-measure with the loaded font
  const base = document.createElement("canvas");
  base.width = CARD_W; base.height = CARD_H;
  drawCard(base.getContext("2d")!, d, theme);
  const out = document.createElement("canvas");
  out.width = CARD_W * scale; out.height = CARD_H * scale;
  const o = out.getContext("2d")!;
  o.imageSmoothingEnabled = false;
  o.drawImage(base, 0, 0, out.width, out.height);
  const url = out.toDataURL("image/png");
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
  return { blob, url };
}
