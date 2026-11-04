/**
 * R-020 主页分享图：把个人主页画成一张竖版像素长图（宽 360 原生像素，×3 导出；高度随小组件多少变化）。
 * 复用 lib/shareKit.ts 的调色板、像素字、木框、天空和带二维码的底部条（from = "share-profile"）。
 * Only things fit for people outside the room: no guestbook; task names and tomorrow's plan can be hidden.
 */
import type { ProfilePage, Widget } from "./profilePage";
import { countdownLabel, daysUntil, WIDGET_INFO } from "./profilePage";
import { peakLabel, peakWindow, type ProfileStats, type SubjectPart } from "./profileStats";
import { medalGrid, MEDAL_H, MEDAL_W } from "./badges";
import { dayLabel, ENERGY, IMPACT } from "./review";
import { dayKey, dur, durShort, HOUR, hhmm, hrs, weekdayCn, weekdayOfKey } from "./time";
import { drawGrid, pick, portrait, shade, SHIRTS, type AvatarLook, type Grid } from "./pixel";
import {
  drawShareFooter, ensureCardFont, fit, FOOTER_H, PAL, rect, renderPixelPng, resetMeasure, sky, tag, text, textW, tile, woodFrame,
  type CardTheme, type Pal,
} from "./shareKit";

export const PROFILE_W = 360;
export const PROFILE_SCALE = 3;
const PAD = 22;
const CW = PROFILE_W - PAD * 2; // 316
const GAP = 6;
const HALF = (CW - GAP) / 2; // 155

export interface ProfileCardData {
  name: string;
  look: AvatarLook;
  shirt: string;
  city: string;
  bio: string;
  page: ProfilePage;
  stats: ProfileStats;
  /** hide task names and the 收工 plan */
  hidePrivate: boolean;
}

/** widgets that make sense on the picture (all of them today; the guestbook is not a widget) */
export const shareableWidgets = (page: ProfilePage) => page.widgets.filter((w) => w.type !== "note" || (w.config.text || "").trim());

/* ─────────── helpers ─────────── */
type C = CanvasRenderingContext2D;
interface Run { ctx: C; p: Pal; d: ProfileCardData; glyphs: string[] }

function T(r: Run, t: string, x: number, y: number, color: string, s = 1) { r.glyphs.push(t); return text(r.ctx, t, x, y, color, s); }
function Fit(r: Run, t: string, maxW: number, s = 1) { r.glyphs.push(t); return fit(t, maxW, s); }

/** break text into lines no wider than maxW (also at newlines), at most `max` lines */
function wrap(r: Run, t: string, maxW: number, max: number) {
  r.glyphs.push(t);
  const out: string[] = [];
  for (const para of t.split("\n")) {
    let line = "";
    for (const ch of para) {
      if (textW(line + ch) > maxW && line) { out.push(line); line = ch.trim() ? ch : ""; }
      else line += ch;
    }
    out.push(line);
  }
  if (out.length > max) { const keep = out.slice(0, max); keep[max - 1] = fit(keep[max - 1] + "…", maxW); return keep; }
  return out;
}

const subjColor = (r: Run, x: SubjectPart | null) => (x && x.color != null ? pick(SHIRTS, x.color) : r.p.ink3);
const LEVELS = [0, 0.5 * HOUR, 1.5 * HOUR, 3 * HOUR, 5 * HOUR];
const level = (ms: number) => (ms <= 0 ? 0 : LEVELS.filter((l) => ms >= l).length);

const FLAME = ["....#.....", "...##.....", "...###....", "..####.#..", "..######..", ".########.", ".###..###.", ".##....##.", "..##..##..", "...####..."];

function titleOf(w: Widget) { return w.type === "note" ? (w.config.title || "").trim() || "便签" : WIDGET_INFO[w.type].name; }

/* ─────────── widget blocks: draw at (x, y) with width w, return the height ─────────── */
function block(r: Run, w: Widget, x: number, y: number, bw: number, draw: boolean): number {
  const { ctx, p, d } = r;
  const s = d.stats;
  const wide = bw > HALF + 1;
  // measure the body first (draw = false) so the tile can be drawn underneath
  const body = (dr: boolean): number => {
    const c = dr ? ctx : scratch();
    const rr: Run = { ...r, ctx: c };
    return widgetBody(rr, w, x + 8, y + 26, bw - 16, wide);
  };
  const h = body(false) + 26 + 10;
  if (draw) {
    tile(ctx, x, y, bw, h, p);
    tag(ctx, Fit(r, titleOf(w), bw - 24), x + 6, y + 5, p);
    body(true);
  }
  return h;
}

let scratchCanvas: HTMLCanvasElement | null = null;
function scratch() {
  if (!scratchCanvas) { scratchCanvas = document.createElement("canvas"); scratchCanvas.width = PROFILE_W; scratchCanvas.height = 64; }
  return scratchCanvas.getContext("2d")!;
}

function meter(r: Run, x: number, y: number, w: number, v: number) {
  const n = 12, gap = 2, bw = Math.floor((w - gap * (n - 1)) / n), lit = Math.round(Math.max(0, Math.min(1, v)) * n);
  for (let i = 0; i < n; i++) {
    const bx = x + i * (bw + gap);
    rect(r.ctx, bx, y, bw, 6, r.p.edge);
    rect(r.ctx, bx + 1, y + 1, bw - 2, 4, i < lit ? (v >= 1 ? "#5fa848" : "#f5b83d") : r.p.slot);
  }
}

function widgetBody(r: Run, w: Widget, x: number, y: number, cw: number, wide: boolean): number {
  const { ctx, p, d } = r;
  const s = d.stats;
  switch (w.type) {
    case "today": {
      const pct = s.goalMs ? s.todayMs / s.goalMs : 0;
      const lw = wide ? 140 : cw;
      T(r, Fit(r, dur(s.todayMs), lw, 2), x, y, p.ink, 2);
      meter(r, x, y + 28, Math.min(lw, 140), pct);
      T(r, `目标 ${durShort(s.goalMs)} · ${Math.round(pct * 100)}%`, x, y + 38, p.ink3);
      const ww = T(r, "本周 ", x, y + 54, p.ink3);
      T(r, `${hrs(s.weekMs)}h`, x + ww, y + 54, p.ink);
      if (wide) {
        const bx = x + 156, bwid = cw - 156, slot = Math.floor(bwid / 7), barH = 50;
        const max = Math.max(s.goalMs, ...s.week.map((q) => q.ms), HOUR);
        s.week.forEach((q, i) => {
          const cx = bx + i * slot, hgt = Math.round((q.ms / max) * barH);
          rect(ctx, cx + 3, y + 6, slot - 6, barH, p.slot);
          if (hgt) rect(ctx, cx + 3, y + 6 + barH - hgt, slot - 6, hgt, q.ms >= s.goalMs ? "#5fa848" : "#f5b83d");
          const gy = y + 6 + barH - Math.round((s.goalMs / max) * barH);
          for (let gx = cx + 3; gx < cx + slot - 3; gx += 2) rect(ctx, gx, gy, 1, 1, p.ink2);
          const lab = weekdayCn[weekdayOfKey(q.key)];
          T(r, lab, cx + Math.round((slot - textW(lab)) / 2), y + 60, q.key === s.todayKey ? p.ink : p.ink3);
        });
      }
      return wide ? 72 : 68;
    }
    case "streak": {
      ctx.save(); ctx.translate(x, y + 2); ctx.scale(2, 2);
      FLAME.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch === "#") rect(ctx, rx, ry, 1, 1, ry < 3 ? "#f5b83d" : "#eb6834"); }));
      ctx.restore();
      const vw = T(r, String(s.streak.current), x + 28, y, p.ink, 2);
      T(r, "天", x + 30 + vw, y + 12, p.ink2);
      T(r, Fit(r, s.streak.current ? `最长 ${s.streak.best} 天` : `最长连续 ${s.streak.best} 天`, cw - 28), x + 28, y + 26, p.ink3);
      const cells = s.yearCols.flat().filter((c) => !c.future).slice(-(wide ? 28 : 14));
      const step = Math.min(10, Math.floor(cw / cells.length));
      cells.forEach((c, i) => {
        rect(ctx, x + i * step, y + 46, step - 2, step - 2, p.edge);
        rect(ctx, x + i * step + 1, y + 47, step - 4, step - 4, c.ms >= 15 * 60_000 ? "#eb6834" : p.slot);
      });
      return 46 + step;
    }
    case "heatmap": {
      const step = 6;
      const n = Math.min(s.yearCols.length, Math.floor(cw / step));
      const cols = s.yearCols.slice(-n);
      cols.forEach((c, ci) => c.forEach((q, di) => {
        if (q.future) return;
        const lv = level(q.ms);
        rect(ctx, x + ci * step, y + di * step, step - 1, step - 1, p.q[lv]);
      }));
      const gy = y + 7 * step + 4;
      T(r, `${s.activeDays} 天`, x, gy, p.ink3);
      let lx = x + cw - 6 * 7 - textW("多") - 2;
      for (let i = 0; i < 6; i++) rect(ctx, lx + i * 7, gy + 4, 6, 6, p.q[i]);
      lx += 6 * 7 + 2;
      T(r, "多", lx, gy, p.ink3);
      return 7 * step + 18;
    }
    case "subjects": {
      const parts = s.subjects[w.config.days === 7 ? 7 : 30];
      const total = parts.reduce((a, q) => a + q.ms, 0);
      if (!total) { T(r, "这段时间还没有记录", x, y, p.ink3); return 14; }
      const top = parts.slice(0, wide ? 5 : 4);
      const restMs = total - top.reduce((a, q) => a + q.ms, 0);
      const items = restMs > 0 ? [...top, { key: "__o", name: "其他", color: null, ms: restMs }] : top;
      const cell = wide ? 3 : 2, N = 28, size = N * cell;
      donut(r, x, y, cell, items.map((q) => ({ ms: q.ms, color: q.key === "__o" ? p.ink3 : subjColor(r, q) })));
      const lx = x + size + 8, lw = cw - size - 8;
      items.forEach((q, i) => {
        const ly = y + i * 14;
        rect(ctx, lx, ly + 3, 7, 7, p.edge); rect(ctx, lx + 1, ly + 4, 5, 5, q.key === "__o" ? p.ink3 : subjColor(r, q));
        const pct = `${Math.round((q.ms / total) * 100)}%`;
        const pw = textW(pct);
        T(r, Fit(r, q.name, lw - 14 - pw - 4), lx + 11, ly, p.ink2);
        T(r, pct, lx + lw - pw, ly, p.ink);
      });
      return Math.max(size, items.length * 14);
    }
    case "hours": {
      const hours = s.hours[w.config.days === 90 ? 90 : 30];
      const pk = peakWindow(hours);
      if (!pk) { T(r, "这段时间还没有记录", x, y, p.ink3); return 14; }
      T(r, peakLabel(pk), x, y, p.ink);
      const max = Math.max(...hours, 1), slot = Math.floor(cw / 24), bh = 34, by = y + 18;
      const ox = x + Math.floor((cw - slot * 24) / 2);
      hours.forEach((v, h) => {
        const hh = Math.max(v > 0 ? 2 : 1, Math.round((v / max) * bh));
        const peak = h === pk[0] % 24 || h === (pk[0] + 1) % 24;
        rect(ctx, ox + h * slot, by + bh - hh, Math.max(1, slot - 1), hh, peak ? "#f5b83d" : hh <= 1 ? p.slot : shade(p.ink3, p.night ? -0.2 : 0.2));
      });
      [0, 6, 12, 18].forEach((h) => T(r, String(h), ox + h * slot, by + bh + 3, p.ink3));
      return 18 + bh + 16;
    }
    case "recent": {
      const list = s.recent.slice(0, Math.min(w.config.count || 5, wide ? 6 : 4));
      if (!list.length) { T(r, "还没有专注记录", x, y, p.ink3); return 14; }
      const hideTask = d.hidePrivate || !!w.config.hideTask;
      const rowH = wide ? 18 : 30;
      list.forEach((q, i) => {
        const ry = y + i * rowH;
        const dd = dur(q.ms);
        const ddw = textW(dd);
        rect(ctx, x, ry + 3, 7, 7, p.edge); rect(ctx, x + 1, ry + 4, 5, 5, subjColor(r, q.subject));
        const when = `${dayLabel(dayKey(q.startedAt, s.tz), s.todayKey)} ${hhmm(q.startedAt, s.tz)}`;
        const label = (q.subject?.name || "未分类") + (!hideTask && q.task ? ` · ${q.task}` : "");
        if (wide) {
          const ww = textW(when);
          T(r, Fit(r, label, cw - 11 - ddw - ww - 16), x + 11, ry, p.ink);
          T(r, when, x + cw - ddw - 10 - ww, ry, p.ink3);
          T(r, dd, x + cw - ddw, ry, p.ink2);
        } else {
          T(r, Fit(r, label, cw - 11 - ddw - 6), x + 11, ry, p.ink);
          T(r, dd, x + cw - ddw, ry, p.ink2);
          T(r, Fit(r, when, cw - 11), x + 11, ry + 13, p.ink3);
        }
      });
      return list.length * rowH - (wide ? 4 : 2);
    }
    case "review": {
      const rv = s.review;
      if (!rv) { T(r, "还没有收工记录", x, y, p.ink3); return 14; }
      const a = T(r, dayLabel(rv.day, s.todayKey), x, y, p.ink);
      T(r, Fit(r, ` · 专注 ${dur(rv.totalMs)}`, cw - a), x + a, y, p.ink3);
      T(r, Fit(r, `精力 ${rv.energy != null ? ENERGY[rv.energy - 1].label : "—"} · 收获 ${rv.impact != null ? IMPACT[rv.impact - 1].label : "—"}`, cw), x, y + 15, p.ink2);
      if (d.hidePrivate || !rv.note) return 28;
      const lines = wrap(r, "明天先：" + rv.note, cw, wide ? 2 : 3);
      lines.forEach((ln, i) => T(r, ln, x, y + 32 + i * 14, p.ink));
      return 32 + lines.length * 14;
    }
    case "goals": {
      const goals = (w.config.goals || []).filter((g) => g.title || g.date);
      if (!goals.length) { T(r, "还没有写目标", x, y, p.ink3); return 14; }
      goals.forEach((g, i) => {
        const gy = y + i * 32;
        if (i) for (let dx = 0; dx < cw; dx += 4) rect(ctx, x + dx, gy - 4, 2, 1, p.slot);
        const n = g.date ? daysUntil(g.date, s.todayKey) : null;
        let rw = 0;
        if (n != null && n > 1) {
          const tw = textW("天");
          T(r, "天", x + cw - tw, gy + 12, p.ink2);
          const num = String(n);
          rw = textW(num) * 2 + tw + 4;
          T(r, num, x + cw - rw, gy, n <= 7 ? "#eb6834" : p.ink, 2);
        } else if (g.date) {
          const lb = countdownLabel(g.date, s.todayKey);
          rw = textW(lb);
          T(r, lb, x + cw - rw, gy + 6, p.ink2);
        }
        T(r, Fit(r, g.title || "目标", cw - rw - 8), x, gy, p.ink);
        if (g.date) T(r, `${Number(g.date.slice(5, 7))}月${Number(g.date.slice(8))}日`, x, gy + 14, p.ink3);
      });
      return goals.length * 32 - 4;
    }
    case "badges": {
      const earned = s.badges.filter((b) => b.earned);
      // the picture is for people outside the app: only what was earned
      const list = earned;
      if (!list.length) { T(r, "还没有徽章", x, y, p.ink3); return 14; }
      const cell = wide ? 60 : 36, mh = MEDAL_H * 2, perRow = Math.max(1, Math.floor(cw / cell));
      const rows = Math.ceil(list.length / perRow), rowH = mh + (wide ? 18 : 6);
      const ox = x + Math.floor((cw - Math.min(list.length, perRow) * cell) / 2);
      list.forEach((b, i) => {
        const bx = ox + (i % perRow) * cell, by = y + Math.floor(i / perRow) * rowH;
        const g: Grid = medalGrid(b, { fill: p.slot, line: p.ink3 });
        ctx.save(); ctx.translate(bx + Math.floor((cell - MEDAL_W * 2) / 2), by); ctx.scale(2, 2); drawGrid(ctx, g, 0, 0); ctx.restore();
        if (wide) { const nm = Fit(r, b.name, cell - 2); T(r, nm, bx + Math.floor((cell - textW(nm)) / 2), by + mh + 2, b.earned ? p.ink2 : p.ink3); }
      });
      return rows * rowH - (wide ? 2 : 6);
    }
    case "note": {
      const lines = wrap(r, w.config.text || "", cw, wide ? 6 : 9);
      lines.forEach((ln, i) => T(r, ln, x, y + i * 14, p.ink));
      return Math.max(14, lines.length * 14);
    }
  }
}

/** the same pixel ring as the PixelDonut on the page, `cell` px per grid cell */
function donut(r: Run, x: number, y: number, cell: number, items: { ms: number; color: string }[]) {
  const N = 28, total = items.reduce((a, q) => a + q.ms, 0) || 1;
  let acc = 0;
  const bounds = items.map((q) => { const a0 = acc; acc += q.ms / total; return { a0, a1: acc, color: q.color }; });
  const c = (N - 1) / 2, rOut = N / 2 - 0.4, rIn = N / 2 - 7.2;
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const dx = gx - c, dy = gy - c, rr = Math.hypot(dx, dy);
    if (rr > rOut || rr < rIn) continue;
    const a = ((Math.atan2(dx, -dy) / (2 * Math.PI)) + 1) % 1;
    const b = bounds.find((s) => a >= s.a0 && a < s.a1) || bounds[bounds.length - 1];
    if (!b) continue;
    if (bounds.length > 1 && Math.min(a - b.a0, b.a1 - a) * 2 * Math.PI * rr < 0.55) continue;
    rect(r.ctx, x + gx * cell, y + gy * cell, cell, cell, b.color);
  }
}

/* ─────────── the whole picture ─────────── */
function layout(ctx: C, d: ProfileCardData, theme: CardTheme, glyphs: string[], H: number | null): number {
  const p = PAL[theme];
  const r: Run = { ctx, p, d, glyphs };
  const W = PROFILE_W;
  // header: portrait in a little window
  const wx = PAD, wy = PAD;
  if (H != null) {
    rect(ctx, wx + 1, wy, 52, 54, p.edge); rect(ctx, wx, wy + 1, 54, 52, p.edge);
    rect(ctx, wx + 1, wy + 1, 52, 52, p.wood); rect(ctx, wx + 1, wy + 1, 52, 1, p.woodHi);
    rect(ctx, wx + 2, wy + 2, 50, 50, p.edge);
    sky(ctx, wx + 3, wy + 3, 48, 48, p);
    const g: Grid = portrait(d.look, d.shirt).slice(1);
    ctx.save(); ctx.translate(wx + 3, wy + 3 + 48 - g.length * 3); ctx.scale(3, 3); drawGrid(ctx, g, 0, 0); ctx.restore();
  }
  const tx = 88, tw = W - tx - PAD;
  T(r, Fit(r, d.name, tw, 2), tx, 24, p.ink, 2);
  T(r, Fit(r, d.city, tw), tx, 52, p.ink2);
  let y = 66;
  if (d.bio) {
    const lines = wrap(r, `“${d.bio}”`, tw, 3);
    lines.forEach((ln, i) => T(r, ln, tx, y + i * 14, p.ink3));
    y += lines.length * 14;
  }
  y = Math.max(y, wy + 54) + 10;
  for (let x = PAD; x < W - PAD; x += 4) rect(ctx, x, y, 2, 1, p.slot);
  y += 10;

  // widgets: small ones two by two, wide ones (and a small one left alone) across the full width
  const ws = shareableWidgets(d.page);
  for (let i = 0; i < ws.length; i++) {
    const a = ws[i], b = ws[i + 1];
    if (a.size === "s" && b && b.size === "s") {
      const ha = block(r, a, PAD, y, HALF, false), hb = block(r, b, PAD + HALF + GAP, y, HALF, false);
      const h = Math.max(ha, hb);
      if (H != null) {
        // equal heights in a row: draw each tile stretched to the taller one
        tileStretch(r, a, PAD, y, HALF, h);
        tileStretch(r, b, PAD + HALF + GAP, y, HALF, h);
      }
      y += h + GAP;
      i++;
    } else {
      y += block(r, a, PAD, y, CW, H != null) + GAP;
    }
  }
  if (!ws.length) { T(r, "主页上还没有小组件", PAD, y, p.ink3); y += 20; }
  y += 6;
  if (H != null) drawShareFooter(ctx, PAD, H - 14 - FOOTER_H, CW, p, "share-profile");
  return y + FOOTER_H + 14;
}

function tileStretch(r: Run, w: Widget, x: number, y: number, bw: number, h: number) {
  tile(r.ctx, x, y, bw, h, r.p);
  tag(r.ctx, Fit(r, titleOf(w), bw - 24), x + 6, y + 5, r.p);
  widgetBody(r, w, x + 8, y + 26, bw - 16, false);
}

function background(ctx: C, H: number, theme: CardTheme) {
  const p = PAL[theme], W = PROFILE_W;
  for (let y = 0; y < H; y += 8) {
    rect(ctx, 0, y, W, 8, (y / 8) % 2 ? p.floorB : p.floorA);
    rect(ctx, 0, y + 7, W, 1, p.seam);
    const off = (y / 8) % 2 ? 37 : 91;
    for (let x = off; x < W; x += 120) rect(ctx, x, y, 1, 7, p.seam);
  }
  woodFrame(ctx, 6, 6, W - 12, H - 12, p);
  rect(ctx, 10, 10, W - 20, H - 20, p.panel);
}

/** measure, then render the PNG */
export async function renderProfileCard(d: ProfileCardData, theme: CardTheme, scale = PROFILE_SCALE): Promise<{ blob: Blob; url: string; h: number }> {
  const scratchC = document.createElement("canvas");
  scratchC.width = PROFILE_W; scratchC.height = 16;
  // pass 1: collect every string on the picture so their font slices load; pass 2: measure with the real font
  const glyphs: string[] = ["0123456789…%·–一二三四五六日天小时分"];
  layout(scratchC.getContext("2d")!, d, theme, glyphs, null);
  await ensureCardFont(glyphs.join(""));
  resetMeasure();
  const H = layout(scratchC.getContext("2d")!, d, theme, [], null);
  const out = await renderPixelPng(PROFILE_W, H, scale, glyphs.join(""), (ctx) => { background(ctx, H, theme); layout(ctx, d, theme, [], H); });
  return { ...out, h: H };
}
