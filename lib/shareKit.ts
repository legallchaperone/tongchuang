/**
 * 分享图公用的画法（R-011 / R-020 / R-021 / R-022）：调色板、硬边像素字、木框、小块、天空、台灯 logo、
 * 带二维码的底部条，以及“小画布画好 → 整数倍放大 → PNG”。
 * Everything is drawn at a small native resolution, text included (binarised so no anti-aliasing
 * survives), then scaled up by a whole number so every pixel stays sharp.
 */
import qrcode from "qrcode-generator";
import { shade } from "./pixel";

export type CardTheme = "light" | "dark";

/* ─────────── palettes (mirror the tokens in app/globals.css) ─────────── */
export const PAL = {
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
export type Pal = (typeof PAL)["light"];

/* ─────────── pixel text ─────────── */
export const FAMILY = '"Fusion Pixel 12px Proportional Simplified Chinese"';
export const FONT = `12px ${FAMILY}, "Zpix", monospace`;

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
/** call after fonts finish loading so widths are measured with the real font */
export function resetMeasure() { measurer = null; }
function mctx() {
  if (!measurer) { measurer = document.createElement("canvas").getContext("2d")!; measurer.font = FONT; }
  return measurer;
}
export const textW = (t: string) => Math.ceil(mctx().measureText(t).width);

/** draws 12px text whose top-left is (x, y), thresholded to hard pixels, scaled by s; returns the width */
export function text(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, color: string, s = 1) {
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
export function fit(t: string, maxW: number, s = 1) {
  if (textW(t) * s <= maxW) return t;
  let out = t;
  while (out.length > 1 && textW(out + "…") * s > maxW) out = out.slice(0, -1);
  return out + "…";
}

/* ─────────── primitives ─────────── */
export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

/** pixel frame like the app's cards: notched outline, bevelled wood rim, parchment fill */
export function woodFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: Pal) {
  rect(ctx, x + 1, y, w - 2, h, p.edge); rect(ctx, x, y + 1, w, h - 2, p.edge);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, p.wood);
  rect(ctx, x + 1, y + 1, w - 2, 1, p.woodHi); rect(ctx, x + 1, y + 1, 1, h - 2, p.woodHi);
  rect(ctx, x + 1, y + h - 2, w - 2, 1, p.woodDk); rect(ctx, x + w - 2, y + 1, 1, h - 2, p.woodDk);
  rect(ctx, x + 3, y + 3, w - 6, h - 6, p.edge);
}
/** a small inset tile with notched corners */
export function tile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: Pal) {
  rect(ctx, x + 1, y, w - 2, h, p.edge); rect(ctx, x, y + 1, w, h - 2, p.edge);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, p.panel2);
  rect(ctx, x + 1, y + h - 3, w - 2, 2, shade(p.panel2, p.night ? -0.25 : -0.06));
}
/** a wooden name tag (like the card headings in the app) */
export function tag(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, p: Pal) {
  const w = textW(t) + 12, h = 16;
  rect(ctx, x + 1, y, w - 2, h, p.edge); rect(ctx, x, y + 1, w, h - 2, p.edge);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, p.wood); rect(ctx, x + 1, y + 1, w - 2, 1, p.woodHi);
  text(ctx, t, x + 6, y + 2, p.onWood);
  return w;
}

export function sky(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: Pal) {
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

/** a tiny desk lamp, the app's mark */
export function logo(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal) {
  const shadeC = "#3f7d5c";
  rect(ctx, x + 1, y, 10, 1, shadeC); rect(ctx, x, y + 1, 12, 4, shadeC); rect(ctx, x, y + 1, 12, 1, "#5aa27a");
  rect(ctx, x + 2, y + 5, 8, 1, "#fff2a8");
  rect(ctx, x + 5, y + 6, 2, 8, p.night ? "#5aa27a" : "#2f4a3a");
  rect(ctx, x + 2, y + 14, 8, 3, p.night ? "#5aa27a" : "#2f4a3a");
}

/* ─────────── R-022: shared footer with a QR code to the product page ─────────── */

/** where every share image points: the product page, tagged with which image brought the visitor */
export const shareUrl = (from: string) => `https://study.cwx.world/release?from=${encodeURIComponent(from)}`;

/** QR modules for `data` (true = dark), error correction M */
export function qrMatrix(data: string): boolean[][] {
  const q = qrcode(0, "M");
  q.addData(data);
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

/**
 * draw a scannable QR code: dark modules on a light card, `quiet` modules of margin, `m` px per module.
 * Always dark-on-light, also on the night theme — many phone scanners refuse inverted codes.
 * returns the drawn size in px
 */
export function drawQr(ctx: CanvasRenderingContext2D, data: string, x: number, y: number, m = 1, quiet = 3) {
  const mat = qrMatrix(data);
  const size = (mat.length + quiet * 2) * m;
  rect(ctx, x, y, size, size, "#fffaf0");
  ctx.fillStyle = "#2a160c";
  mat.forEach((row, r) => row.forEach((d, c) => { if (d) ctx.fillRect(x + (quiet + c) * m, y + (quiet + r) * m, m, m); }));
  return size;
}

/** height of the shared footer at native resolution */
export const FOOTER_H = 76;

/**
 * the footer every share image ends with: dotted rule, lamp logo, “同窗”, a one-line pitch, the site,
 * and a QR code (right) that opens study.cwx.world/release?from=<from>.
 * (x, y) is the top-left of the footer band, w its width. Characters used: see FOOTER_TEXT.
 */
export function drawShareFooter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, p: Pal, from: string) {
  for (let i = x; i < x + w; i += 4) rect(ctx, i, y, 2, 1, p.slot);
  const qx = x + w - 1, qy = y + 4;
  // QR: 2 px per module at native size → 6 px per module in the ×3 export, so it still scans when the
  // picture is shown small (a chat thumbnail, another phone's screen)
  const mat = qrMatrix(shareUrl(from));
  const qs = (mat.length + 4) * 2;
  const qLeft = qx - qs;
  rect(ctx, qLeft - 1, qy - 1, qs + 2, qs + 2, p.edge);
  drawQr(ctx, shareUrl(from), qLeft, qy, 2, 2);
  // brand block, vertically centred on the code
  const cy = qy + Math.round(qs / 2);
  logo(ctx, x + 2, cy - 22, p);
  text(ctx, "同窗", x + 20, cy - 26, p.ink, 2);
  text(ctx, "隔着时差，一起自习", x + 2, cy + 2, p.ink2);
  text(ctx, "扫码看看 · study.cwx.world", x + 2, cy + 16, p.ink3);
}
/** glyphs the footer needs (pass to ensureCardFont together with the card's own text) */
export const FOOTER_TEXT = "同窗隔着时差，一起自习扫码看看 · study.cwx.world";

/** draw at native size with `draw`, then scale up by `scale` into a PNG (blob + data URL) */
export async function renderPixelPng(w: number, h: number, scale: number, glyphs: string, draw: (ctx: CanvasRenderingContext2D) => void): Promise<{ blob: Blob; url: string }> {
  await ensureCardFont(glyphs + FOOTER_TEXT);
  resetMeasure();
  const base = document.createElement("canvas");
  base.width = w; base.height = h;
  draw(base.getContext("2d")!);
  const out = document.createElement("canvas");
  out.width = w * scale; out.height = h * scale;
  const o = out.getContext("2d")!;
  o.imageSmoothingEnabled = false;
  o.drawImage(base, 0, 0, out.width, out.height);
  const url = out.toDataURL("image/png");
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
  return { blob, url };
}
