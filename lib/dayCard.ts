/**
 * R-021 分享一天：把某一天的学习画成一张竖版像素卡片。
 * 日期与当地时间范围、总时长和目标、按时间排开的专注时间线、科目饼图、最长的一次、收工记录，
 * 以及坐在书桌前的小人（窗外是那天最后一段结束时的天色）。
 * Drawn at 360 px native width with lib/shareKit (hard-edged text, frames, footer with QR), exported ×3.
 */
import type { DailyReview, FocusMode, Session, Subject } from "./types";
import { dayShares, touching } from "./stats";
import { addDaysKey, dur, durShort, partsIn, phaseAt, tzCity, weekdayCn, weekdayOfKey, zonedToUtc } from "./time";
import { drawScene, SCENE_H, SCENE_W, shade, type AvatarLook } from "./pixel";
import { ENERGY, IMPACT } from "./review";
import { drawShareFooter, ensureCardFont, fit, FOOTER_H, FOOTER_TEXT, resetMeasure, PAL, rect, renderPixelPng, tag, text, textW, tile, woodFrame, type CardTheme, type Pal } from "./shareKit";
export type { CardTheme } from "./shareKit";

export const DAY_W = 360;
/** 360 x 3 = 1080 px wide output */
export const DAY_SCALE = 3;

/** the categorical series colours (mirror --s0…--s7 in app/globals.css) */
const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};
const seriesColor = (theme: CardTheme, c: number | null, p: Pal) => (c == null ? p.ink3 : SERIES[theme][((c % 8) + 8) % 8]);

export interface DayBlock {
  /** local wall-clock hours on that day, 0–24 */
  a: number; b: number;
  /** the record started the day before / ran past midnight: only this day's part is drawn */
  cutL: boolean; cutR: boolean;
  color: number | null;
  mode: FocusMode;
}
export interface DaySlice { name: string; color: number | null; ms: number }

export interface DayData {
  name: string; look: AvatarLook; shirt: string; seed: number;
  tz: string;
  /** YYYY-MM-DD, the owner's local date */
  day: string;
  totalMs: number; goalMs: number;
  blocks: DayBlock[];
  slices: DaySlice[];
  count: number; pomos: number;
  longest: { task: string; subject: string | null; color: number | null; mode: FocusMode; ms: number; from: string; to: string } | null;
  review: { energy: number | null; impact: number | null; note: string } | null;
  /** the instant the day's last record ended (for the sky in the window) */
  endAt: number;
  /** first start / last end on that day, "08:12" / "23:40" */
  span: [string, string] | null;
  /** still focusing right now */
  live: boolean;
}

const hm = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** a person's records for one local day; sessions may include the running pseudo session (id "live") */
export function dayData(o: {
  sessions: Session[]; subjects: Subject[]; reviews: DailyReview[]; userId: string; tz: string; day: string; goalMs: number;
  name: string; look: AvatarLook; shirt: string; now: number;
}): DayData {
  const { tz, day } = o;
  const [y, mo, d] = day.split("-").map(Number);
  const [y2, mo2, d2] = addDaysKey(day, 1).split("-").map(Number);
  const start = zonedToUtc(y, mo, d, 0, 0, tz), end = zonedToUtc(y2, mo2, d2, 0, 0, tz);
  // local hour of an instant inside the day (wall clock, so the axis reads like a clock even on DST days)
  const hourOf = (t: number) => {
    if (t >= end) return 24;
    if (t <= start) return 0;
    const p = partsIn(t, tz);
    return p.h + p.mi / 60 + p.s / 3600;
  };
  const mine = o.sessions.filter((s) => s.userId === o.userId);
  const ss = touching(mine, tz, new Set([day])).sort((a, b) => a.startedAt - b.startedAt);
  const subj = (id: string | null) => o.subjects.find((x) => x.id === id) || null;
  const onDay = (s: Session) => dayShares(s, tz).filter(([k]) => k === day).reduce((a, [, v]) => a + v, 0);

  let totalMs = 0;
  const bySubj = new Map<string | null, number>();
  const blocks: DayBlock[] = [];
  let endAt = 0;
  for (const s of ss) {
    const ms = onDay(s);
    totalMs += ms;
    bySubj.set(s.subjectId, (bySubj.get(s.subjectId) || 0) + ms);
    const a = Math.max(s.startedAt, start), b = Math.min(Math.max(s.endedAt, s.startedAt), end);
    if (b <= a) continue;
    blocks.push({ a: hourOf(a), b: hourOf(b), cutL: s.startedAt < start, cutR: s.endedAt > end, color: subj(s.subjectId)?.color ?? null, mode: s.mode });
    endAt = Math.max(endAt, b);
  }
  const slices = Array.from(bySubj).filter(([, ms]) => ms > 0).map(([id, ms]) => ({ name: subj(id)?.name || "未分类", color: subj(id)?.color ?? null, ms }))
    .sort((a, b) => b.ms - a.ms);
  // at most 5 slices: fold the rest into 其他
  const folded = slices.length <= 5 ? slices : [...slices.slice(0, 4), { name: "其他", color: null, ms: slices.slice(4).reduce((a, s) => a + s.ms, 0) }];
  const lg = ss.reduce<Session | null>((a, s) => (!a || s.durationMs > a.durationMs ? s : a), null);
  const nextDay = (t: number) => (t >= end ? "次日" : t < start ? "前一天 " : "");
  const r = o.reviews.find((x) => x.userId === o.userId && x.day === day);
  return {
    name: o.name, look: o.look, shirt: o.shirt, seed: seedOf(o.userId), tz, day, totalMs, goalMs: o.goalMs, blocks, slices: folded,
    count: ss.length, pomos: ss.filter((s) => s.mode === "pomodoro").length,
    longest: lg ? {
      task: lg.task, subject: subj(lg.subjectId)?.name || null, color: subj(lg.subjectId)?.color ?? null, mode: lg.mode, ms: lg.durationMs,
      from: nextDay(lg.startedAt) + hm(hourOfAny(lg.startedAt, tz)), to: (lg.id === "live" ? "" : nextDay(lg.endedAt)) + (lg.id === "live" ? "现在" : hm(hourOfAny(lg.endedAt, tz))),
    } : null,
    review: r ? { energy: r.energy, impact: r.impact, note: r.note } : null,
    endAt: endAt || zonedToUtc(y, mo, d, 21, 30, tz),
    span: blocks.length ? [hm(blocks[0].a), hm(Math.max(...blocks.map((b) => b.b)))] : null,
    live: ss.some((s) => s.id === "live"),
  };
}
function hourOfAny(t: number, tz: string) { const p = partsIn(t, tz); return p.h + p.mi / 60; }
function seedOf(id: string) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

/* ─────────── little sprites ─────────── */
const MODE_ICON: Record<FocusMode, string[]> = {
  // a tomato
  pomodoro: ["..g.g..", "...g...", ".rrrrr.", "rrhrrrr", "rrrrrrr", "rrrrrrr", ".rrrrr."],
  // flow: a star, like the ones that light up outside the window
  stopwatch: ["...y...", "..yyy..", "yyywyyy", ".yyyyy.", "..yyy..", ".yy.yy.", ".y...y."],
  // countdown: an hourglass
  countdown: ["kkkkkkk", ".ksssk.", "..ksk..", "...s...", "..ksk..", ".ksssk.", "kkkkkkk"],
};
const MODE_NAME: Record<FocusMode, string> = { pomodoro: "番茄", stopwatch: "心流", countdown: "倒计时" };
function modeIcon(ctx: CanvasRenderingContext2D, m: FocusMode, x: number, y: number, p: Pal) {
  const col: Record<string, string> = { g: "#4f9a3e", r: "#d9483b", h: "#ff9a86", y: "#e9b23c", w: "#fff4c2", k: p.night ? "#d8bf96" : "#6e3d1d", s: "#e9b23c" };
  MODE_ICON[m].forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] !== ".") rect(ctx, x + rx, y + ry, 1, 1, col[row[rx]]); });
}
// energy faces, same art as the 收工 page (components/Wrap.tsx)
const FACE_BASE = ["..oooooo..", ".offffffo.", "offffffffo", "offffffffo", "offffffffo", "offffffffo", "offffffffo", "offffffffo", ".offffffo.", "..oooooo.."];
const FACE_MARKS: Record<number, [number, number][]> = {
  1: [[2, 4], [3, 4], [6, 4], [7, 4], [3, 7], [4, 6], [5, 7], [6, 6]],
  2: [[3, 3], [3, 4], [6, 3], [6, 4], [3, 6], [4, 6], [5, 6], [6, 6]],
  3: [[3, 3], [3, 4], [6, 3], [6, 4], [2, 6], [3, 7], [4, 7], [5, 7], [6, 7], [7, 6]],
};
function face(ctx: CanvasRenderingContext2D, v: number, x: number, y: number, s: number, p: Pal) {
  FACE_BASE.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) {
    const c = row[rx];
    if (c === "o") rect(ctx, x + rx * s, y + ry * s, s, s, p.edge);
    if (c === "f") rect(ctx, x + rx * s, y + ry * s, s, s, v === 3 ? "#ffd86b" : v === 2 ? "#f3c98a" : "#d9c3a0");
  } });
  FACE_MARKS[v]?.forEach(([fx, fy]) => rect(ctx, x + fx * s, y + fy * s, s, s, "#3a2016"));
  if (v === 3) { rect(ctx, x + s, y + 5 * s, s, s, "#f08a8a"); rect(ctx, x + 8 * s, y + 5 * s, s, s, "#f08a8a"); }
}

/** pixel donut like components/Charts.tsx PixelDonut: n cells per side, `cell` px each, clockwise from 12 o'clock */
function donut(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, cell: number, items: { ms: number; color: string }[], empty: string) {
  const total = items.reduce((a, s) => a + s.ms, 0);
  let acc = 0;
  const bounds = items.map((s) => { const a0 = acc; acc += total ? s.ms / total : 0; return { a0, a1: acc, color: s.color }; });
  const c = (n - 1) / 2, rOut = n / 2 - 0.4, rIn = n / 2 - 7.6;
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    const dx = gx - c, dy = gy - c, r = Math.hypot(dx, dy);
    if (r > rOut || r < rIn) continue;
    const a = ((Math.atan2(dx, -dy) / (2 * Math.PI)) + 1) % 1;
    const b = bounds.find((s) => a >= s.a0 && a < s.a1) || bounds[bounds.length - 1];
    if (!b) { rect(ctx, x + gx * cell, y + gy * cell, cell, cell, empty); continue; }
    if (bounds.length > 1 && Math.min(a - b.a0, b.a1 - a) * 2 * Math.PI * r < 0.55) continue;
    rect(ctx, x + gx * cell, y + gy * cell, cell, cell, b.color);
  }
}

/** split text into at most `max` lines that fit width w */
function wrap(t: string, w: number, max: number) {
  const out: string[] = [];
  let rest = t;
  while (rest && out.length < max) {
    if (textW(rest) <= w) { out.push(rest); rest = ""; break; }
    let n = rest.length;
    while (n > 1 && textW(rest.slice(0, n)) > w) n--;
    out.push(rest.slice(0, n)); rest = rest.slice(n);
  }
  if (rest) out[out.length - 1] = fit(out[out.length - 1] + rest, w);
  return out;
}

const fmtDay = (k: string) => `${Number(k.slice(5, 7))}月${Number(k.slice(8))}日`;
const titleOf = (d: DayData) => (d.name === "我" ? "我的一天" : `${d.name}的一天`);
const shownTask = (d: DayData, hide: boolean) => {
  const l = d.longest!;
  return hide ? l.subject || "自习" : l.task || l.subject || "自习";
};
const durTxt = (ms: number) => dur(ms);

/** every glyph that can appear on the card, so the font slices load before drawing */
export function dayText(d: DayData, hide: boolean) {
  return [
    titleOf(d), fmtDay(d.day), d.day.slice(0, 4), "星期" + weekdayCn[weekdayOfKey(d.day)], tzCity(d.tz), "当地时间", "·–:0123456789",
    "当天专注", "目标", "达成", "%", "小时分", "时间线", "科目", "最长的一次", "收工", "精力", "收获", "明天先：", "次日前一天现在",
    "次专注", "个番茄", "这一天没有专注记录", "跨过午夜的一段只画了这一天的部分", "进行中", "…",
    ...Object.values(MODE_NAME), ...ENERGY.map((e) => e.label), ...IMPACT.map((e) => e.label),
    ...d.slices.map((s) => s.name), d.longest ? shownTask(d, hide) + (d.longest.subject || "") : "", d.review?.note || "",
  ].join("");
}

/* ─────────── layout ─────────── */
const X = 22, CW = DAY_W - 44;

function layout(d: DayData) {
  let y = 118; // header ends at 108
  const total = { y, h: 56 }; y += 56 + 12;
  const cut = d.blocks.some((b) => b.cutL || b.cutR);
  const tl = { y, h: 32 + 20 + 16 + (cut ? 14 : 0) }; y += tl.h + 10;
  const subj = d.slices.length ? { y, h: 20 + Math.max(68, d.slices.length * 15) } : null; if (subj) y += subj.h + 6;
  const longest = d.longest ? { y, h: 40 } : null; if (longest) y += 40 + 8;
  const noteLines = d.review?.note ? wrap(d.review.note, CW - 16 - textW("明天先："), 2).length : 0;
  const review = d.review ? { y, h: 20 + 22 + (noteLines ? 6 + noteLines * 14 : 0) + 8 } : null; if (review) y += review.h + 8;
  const H = y + 6 + FOOTER_H + 14;
  return { total, tl, subj, longest, review, cut, H };
}
export function dayCardHeight(d: DayData) { return layout(d).H; }

/** draw the card at native size into ctx (DAY_W x dayCardHeight(d)) */
export function drawDayCard(ctx: CanvasRenderingContext2D, d: DayData, theme: CardTheme, hide: boolean) {
  const p = PAL[theme];
  const L = layout(d);
  const W = DAY_W, H = L.H;
  const sc = (c: number | null) => seriesColor(theme, c, p);

  // plank floor + the card
  for (let y = 0; y < H; y += 8) {
    rect(ctx, 0, y, W, 8, (y / 8) % 2 ? p.floorB : p.floorA);
    rect(ctx, 0, y + 7, W, 1, p.seam);
    const off = (y / 8) % 2 ? 37 : 91;
    for (let x = off; x < W; x += 120) rect(ctx, x, y, 1, 7, p.seam);
  }
  woodFrame(ctx, 6, 6, W - 12, H - 12, p);
  rect(ctx, 10, 10, W - 20, H - 20, p.panel);

  /* header: the desk at the end of the day, in a wooden window */
  const fx = X, fy = 22, fw = SCENE_W + 6, fh = SCENE_H + 6;
  rect(ctx, fx + 1, fy, fw - 2, fh, p.edge); rect(ctx, fx, fy + 1, fw, fh - 2, p.edge);
  rect(ctx, fx + 1, fy + 1, fw - 2, fh - 2, p.wood); rect(ctx, fx + 1, fy + 1, fw - 2, 1, p.woodHi);
  rect(ctx, fx + 2, fy + 2, fw - 4, fh - 4, p.edge);
  const sceneC = document.createElement("canvas");
  sceneC.width = SCENE_W; sceneC.height = SCENE_H;
  const t = partsIn(d.endAt, d.tz);
  drawScene(sceneC.getContext("2d")!, {
    look: d.look, shirt: d.shirt, state: "focus", hour: t.h + t.mi / 60, minute: t.mi, phase: phaseAt(t.h),
    frame: 25, seed: d.seed, present: true,
  });
  ctx.drawImage(sceneC, fx + 3, fy + 3);

  const tx = fx + fw + 12, tw = W - X - tx;
  text(ctx, fit(titleOf(d), tw), tx, 24, p.ink2);
  const dw = text(ctx, fmtDay(d.day), tx, 40, p.ink, 2);
  text(ctx, "星期" + weekdayCn[weekdayOfKey(d.day)], tx + dw + 6, 52, p.ink2);
  text(ctx, fit(`${d.day.slice(0, 4)} · ${tzCity(d.tz)}当地时间`, tw), tx, 72, p.ink3);
  if (d.span) text(ctx, `${d.span[0]} – ${d.live ? "进行中" : d.span[1]}`, tx, 87, p.ink2);
  // a short tally under the time range
  const tally = d.count ? `${d.count} 次专注${d.pomos ? ` · ${d.pomos} 个番茄` : ""}` : "这一天没有专注记录";
  text(ctx, fit(tally, tw), tx, d.span ? 101 : 87, p.ink3);

  /* total + goal */
  {
    const { y, h } = L.total;
    tile(ctx, X, y, CW, h, p);
    text(ctx, "当天专注", X + 8, y + 5, p.ink3);
    text(ctx, fit(durTxt(d.totalMs), 150, 2), X + 8, y + 20, p.ink, 2);
    const gx = X + 170, gw = CW - 170 - 10;
    const pct = d.goalMs > 0 ? Math.round((d.totalMs / d.goalMs) * 100) : 0;
    text(ctx, `目标 ${durTxt(d.goalMs)}`, gx, y + 5, p.ink3);
    const pt = pct >= 100 ? `${pct}% 达成` : `${pct}%`;
    text(ctx, pt, gx + gw - textW(pt), y + 5, pct >= 100 ? (p.night ? "#9ed36a" : "#2f7a2c") : p.ink2);
    // segmented pixel bar
    const by = y + 23, bh = 12;
    rect(ctx, gx, by, gw, bh, p.edge);
    rect(ctx, gx + 1, by + 1, gw - 2, bh - 2, p.slot);
    const fillW = Math.round((gw - 2) * Math.min(1, pct / 100));
    const good = p.q[3], goodHi = shade(p.q[3], 0.25), goodDk = shade(p.q[3], -0.2);
    if (fillW > 0) {
      rect(ctx, gx + 1, by + 1, fillW, bh - 2, good);
      rect(ctx, gx + 1, by + 1, fillW, 2, goodHi);
      rect(ctx, gx + 1, by + bh - 3, fillW, 2, goodDk);
      for (let sx = gx + 1 + 9; sx < gx + 1 + fillW; sx += 10) rect(ctx, sx, by + 1, 1, bh - 2, goodDk);
    }
    text(ctx, pct >= 100 ? "目标完成了" : `还差 ${durTxt(Math.max(0, d.goalMs - d.totalMs))}`, gx, by + bh + 3, p.ink3);
  }

  /* timeline */
  {
    const y0 = L.tl.y;
    tag(ctx, "时间线", X, y0, p);
    // legend of the modes used, right-aligned on the tag row
    const modes = (["pomodoro", "stopwatch", "countdown"] as FocusMode[]).filter((m) => d.blocks.some((b) => b.mode === m));
    let lx = X + CW;
    for (const m of [...modes].reverse()) {
      const w = textW(MODE_NAME[m]);
      lx -= w; text(ctx, MODE_NAME[m], lx, y0 + 3, p.ink2);
      lx -= 10; modeIcon(ctx, m, lx, y0 + 4, p);
      lx -= 10;
    }
    // axis range: the day's study span (whole hours, at least 6 h), or the full day
    let h0 = 0, h1 = 24;
    if (d.blocks.length) {
      h0 = Math.floor(Math.min(...d.blocks.map((b) => b.a)));
      h1 = Math.ceil(Math.max(...d.blocks.map((b) => b.b)));
      while (h1 - h0 < 6) { if (h0 > 0) h0--; if (h1 - h0 < 6 && h1 < 24) h1++; }
    }
    const inner = CW - 2, ox = X + 1;
    // label every `step` hours, the ends snapped to it so both ends get a label (e.g. 8:00 … 24:00)
    const steps = [1, 2, 3, 4, 6];
    let step = 6;
    for (const s of steps) {
      const a = Math.floor(h0 / s) * s, b = Math.ceil(h1 / s) * s;
      if ((s / (b - a)) * inner >= 44) { step = s; break; }
    }
    if (d.blocks.length) { h0 = Math.floor(h0 / step) * step; h1 = Math.min(24, Math.ceil(h1 / step) * step); }
    const iy = y0 + 22, ty = iy + 10, th = 20;
    const px = (h: number) => ox + Math.round(((h - h0) / (h1 - h0)) * inner);
    rect(ctx, X + 1, ty, CW - 2, th, p.edge); rect(ctx, X, ty + 1, CW, th - 2, p.edge);
    rect(ctx, ox, ty + 1, inner, th - 2, p.slot);
    rect(ctx, ox, ty + th - 3, inner, 2, shade(p.slot, p.night ? 0.08 : -0.06));
    // hour gridlines inside the track
    for (let h = h0 + 1; h < h1; h++) {
      const gxp = px(h);
      for (let yy = ty + 2; yy < ty + th - 2; yy += 2) rect(ctx, gxp, yy, 1, 1, shade(p.slot, p.night ? 0.18 : -0.12));
    }
    // blocks
    let lastIcon = -99;
    d.blocks.forEach((b, i) => {
      const x0 = px(b.a), x1 = px(b.b);
      const next = d.blocks[i + 1];
      const gap = next && px(next.a) <= x1 ? 1 : 0;
      const w = Math.max(1, x1 - x0 - gap);
      const c = sc(b.color);
      rect(ctx, x0, ty + 2, w, th - 4, c);
      rect(ctx, x0, ty + 2, w, 1, shade(c, 0.3));
      rect(ctx, x0, ty + th - 4, w, 2, shade(c, -0.25));
      // torn edge where a record crosses midnight
      if (b.cutL) for (let yy = ty + 2; yy < ty + th - 2; yy += 2) rect(ctx, x0, yy, 1, 1, p.slot);
      if (b.cutR) for (let yy = ty + 3; yy < ty + th - 2; yy += 2) rect(ctx, x0 + w - 1, yy, 1, 1, p.slot);
      const cx = Math.round(x0 + w / 2) - 3;
      if (cx >= lastIcon + 8) { modeIcon(ctx, b.mode, Math.max(X, Math.min(X + CW - 7, cx)), iy, p); lastIcon = cx; }
    });
    if (!d.blocks.length) { const m = "这一天没有专注记录"; text(ctx, m, X + Math.round((CW - textW(m)) / 2), ty + 3, p.ink3); }
    // ticks + labels
    const labels: { x: number; w: number; t: string }[] = [];
    for (let h = h0; h <= h1; h += step) {
      const gxp = px(h);
      rect(ctx, gxp, ty + th, 1, 3, p.ink3);
      const t = `${h}:00`, w = textW(t);
      labels.push({ t, w, x: Math.max(X, Math.min(X + CW - w, gxp - Math.round(w / 2))) });
    }
    // both ends always get a label; a middle one that would touch a neighbour is dropped
    const lastL = labels[labels.length - 1];
    let lastEnd = -99;
    labels.forEach((l, i) => {
      if (i > 0 && (l.x < lastEnd + 6 || (l !== lastL && l.x + l.w + 6 > lastL.x))) return;
      text(ctx, l.t, l.x, ty + th + 4, p.ink3);
      lastEnd = l.x + l.w;
    });
    if (L.cut) text(ctx, "跨过午夜的一段只画了这一天的部分", X, ty + th + 19, p.ink3);
  }

  /* subjects */
  if (L.subj) {
    const y0 = L.subj.y;
    tag(ctx, "科目", X, y0, p);
    const n = 32, cell = 2, size = n * cell;
    const dy = y0 + 22;
    donut(ctx, X + 6, dy, n, cell, d.slices.map((s) => ({ ms: s.ms, color: sc(s.color) })), p.slot);
    const tot = d.slices.reduce((a, s) => a + s.ms, 0) || 1;
    // the hole shows the day's total, like the donut on the stats page
    const pc = durShort(tot);
    text(ctx, pc, X + 6 + Math.round((size - textW(pc)) / 2), dy + size / 2 - 6, p.ink);
    const lx = X + 6 + size + 18, rw = X + CW - lx;
    const rows = d.slices.length;
    const ly = dy + Math.max(0, Math.round((size - rows * 15) / 2));
    d.slices.forEach((s, i) => {
      const yy = ly + i * 15;
      const c = sc(s.color);
      rect(ctx, lx, yy + 2, 9, 9, p.edge); rect(ctx, lx + 1, yy + 3, 7, 7, c); rect(ctx, lx + 1, yy + 3, 7, 1, shade(c, 0.3));
      const dv = durTxt(s.ms), pv = `${Math.round((s.ms / tot) * 100)}%`;
      const dvx = lx + rw - textW(dv);
      text(ctx, dv, dvx, yy, p.ink2);
      const pvx = dvx - 12 - textW("100%") + (textW("100%") - textW(pv));
      text(ctx, pv, pvx, yy, p.ink3);
      text(ctx, fit(s.name, pvx - (lx + 14) - 6), lx + 14, yy, p.ink);
    });
  }

  /* the longest one */
  if (L.longest && d.longest) {
    const { y, h } = L.longest, l = d.longest;
    tile(ctx, X, y, CW, h, p);
    text(ctx, "最长的一次", X + 8, y + 4, p.ink3);
    const range = `${l.from} – ${l.to}`;
    text(ctx, range, X + CW - 8 - textW(range), y + 4, p.ink3);
    const ry = y + 20;
    modeIcon(ctx, l.mode, X + 8, ry + 2, p);
    const c = sc(l.color);
    rect(ctx, X + 19, ry + 3, 5, 5, c);
    const dv = durTxt(l.ms);
    const dvx = X + CW - 8 - textW(dv);
    text(ctx, dv, dvx, ry, p.ink);
    const name = shownTask(d, hide) + (!hide && l.task && l.subject ? ` · ${l.subject}` : "");
    text(ctx, fit(name, dvx - (X + 28) - 8), X + 28, ry, p.ink);
  }

  /* 收工 */
  if (L.review && d.review) {
    const { y, h } = L.review, r = d.review;
    tile(ctx, X, y, CW, h, p);
    text(ctx, "收工", X + 8, y + 4, p.ink3);
    const ry = y + 20;
    // energy
    let cx = X + 8;
    if (r.energy) face(ctx, r.energy, cx, ry, 2, p);
    else { rect(ctx, cx + 2, ry + 2, 16, 16, p.slot); }
    cx += 26;
    text(ctx, "精力", cx, ry + 1, p.ink3);
    text(ctx, r.energy ? ENERGY[r.energy - 1].label : "—", cx, ry + 15 - 2, p.ink, 1);
    // impact: four rising bars
    cx = X + Math.round(CW / 2);
    for (let j = 0; j < 4; j++) {
      const bh2 = 5 + j * 5, on = r.impact != null && j < r.impact;
      rect(ctx, cx + j * 5, ry + 20 - bh2, 4, bh2, on ? SERIES[theme][0] : p.slot);
      if (on) rect(ctx, cx + j * 5, ry + 20 - bh2, 4, 1, shade(SERIES[theme][0], 0.3));
    }
    cx += 26;
    text(ctx, "收获", cx, ry + 1, p.ink3);
    text(ctx, r.impact ? IMPACT[r.impact - 1].label : "—", cx, ry + 13, p.ink);
    if (r.note) {
      const ny = ry + 28;
      const k = "明天先：";
      const kw = text(ctx, k, X + 8, ny, p.ink3);
      wrap(r.note, CW - 16 - kw, 2).forEach((ln, i) => text(ctx, ln, X + 8 + kw, ny + i * 14, p.ink));
    }
  }

  drawShareFooter(ctx, X, H - 14 - FOOTER_H, CW, p, "share-day");
}

/** render the full-size PNG */
export async function renderDayCard(d: DayData, theme: CardTheme, hide: boolean, scale = DAY_SCALE): Promise<{ blob: Blob; url: string }> {
  const glyphs = dayText(d, hide) + "目标完成了还差hm";
  // the height depends on how the 收工 note wraps, so measure with the real font first
  await ensureCardFont(glyphs + FOOTER_TEXT);
  resetMeasure();
  return renderPixelPng(DAY_W, dayCardHeight(d), scale, glyphs, (ctx) => drawDayCard(ctx, d, theme, hide));
}
