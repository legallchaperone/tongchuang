/**
 * Pixel-art toolkit: characters are composed from small string maps, outlined automatically,
 * and drawn into a low-resolution canvas (or SVG) that the browser scales up with crisp pixels.
 */
import type { LiveState } from "./types";
import type { Phase } from "./time";

export interface AvatarLook {
  skin: number; // index into SKINS
  hair: number; // style index into HAIR_STYLES
  hairColor: number; // index into HAIR_COLORS
}

export const SKINS = ["#f7d7b5", "#ecbf94", "#cf9466", "#a26a45", "#6e4430"];
export const HAIR_COLORS = ["#3b2418", "#1f1c28", "#8c4a24", "#e0ae4f", "#b9b4ae", "#c4584a", "#5a4a9a", "#2f6f8f"];
export const HAIR_NAMES = ["短发", "长发", "丸子头", "波波头", "刺猬头"];
/** shirt colors follow the categorical palette (light-mode hex) */
export const SHIRTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const OUTLINE = "#3a2016";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** safe index into a palette: works for negative, fractional or missing values */
export function pick<T>(arr: readonly T[], i: unknown): T {
  const n = Math.floor(Number(i));
  return arr[Number.isFinite(n) ? ((n % arr.length) + arr.length) % arr.length : 0];
}

export function defaultLook(id: string): AvatarLook {
  const h = hash(id);
  return { skin: h % 4, hair: (h >>> 3) % HAIR_STYLES.length, hairColor: (h >>> 7) % 4 };
}

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/* ─────────── sprite maps (16 wide) ─────────── */
// S skin, s skin shadow, E eye, p blush, B shirt, b shirt shadow, W collar, . empty
const HEAD = [
  "................",
  "................",
  "................",
  ".....SSSSSS.....",
  "....SSSSSSSS....",
  "....SSSSSSSS....",
  "....SESSSSES....",
  "....SSSSSSSS....",
  "....pSSSSSSp....",
  ".....SSSSSS.....",
  "......ssss......",
];
const TORSO_SIT = [
  "....BBWWWWBB....",
  "...BBBBWWBBBB...",
  "..BBBBBBBBBBBB..",
  "..bBBBBBBBBBBb..",
  "..bBBBBBBBBBBb..",
];
const BODY_STAND = [
  "....BBWWWWBB....",
  "...BBBBWWBBBB...",
  "..BBBBBBBBBBBB..",
  "..BbBBBBBBBBbB..",
  "..BbBBBBBBBBbB..",
  "..SbBBBBBBBBbS..",
  "...bbbbbbbbbb...",
  "....PPPPPPPP....",
  "....PPPPPPPP....",
  "....PPP..PPP....",
  "....PPP..PPP....",
  "....PPP..PPP....",
  "....FFF..FFF....",
];
// hair overlays: H hair, h hair shadow, '.' untouched, '_' force empty
export const HAIR_STYLES: string[][] = [
  // short
  [
    "................",
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "...HHHHHHHHHH...",
    "...HHHH.HHHHH...",
    "...h........h...",
  ],
  // long
  [
    "................",
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "...HHHHHHHHHH...",
    "...HHH..HHHHH...",
    "...HH......HH...",
    "...HH......HH...",
    "...HH......HH...",
    "...hH......Hh...",
    "...hH......Hh...",
    "...hh......hh...",
    "..hh........hh..",
  ],
  // bun
  [
    ".......HH.......",
    "......HHHH......",
    ".....HhhhhH.....",
    "....HHHHHHHH....",
    "...HHHHHHHHHH...",
    "...HH.HHHH.HH...",
    "...h........h...",
  ],
  // bob
  [
    "................",
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "...HHHHHHHHHH...",
    "...HHHHHHHHHH...",
    "...HH......HH...",
    "...HH......HH...",
    "...HH......HH...",
    "...hh......hh...",
  ],
  // spiky
  [
    "................",
    "....H..H..H.....",
    "....HHHHHHHHH...",
    "...HHHHHHHHHH...",
    "...HHHHHHHHHH...",
    "...HH.HH.HHHH...",
    "...h........h...",
  ],
];

export type Grid = (string | null)[][];

function blank(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array<string | null>(w).fill(null));
}
function stamp(g: Grid, map: string[], ox: number, oy: number, colors: Record<string, string | null>) {
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === ".") continue;
      const gy = oy + y, gx = ox + x;
      if (gy < 0 || gy >= g.length || gx < 0 || gx >= g[0].length) continue;
      g[gy][gx] = c === "_" ? null : colors[c] ?? null;
    }
  });
}
export function outline(g: Grid, color = OUTLINE): Grid {
  const h = g.length, w = g[0].length;
  const out = g.map((r) => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x]) continue;
    const n = (yy: number, xx: number) => yy >= 0 && yy < h && xx >= 0 && xx < w && !!g[yy][xx];
    if (n(y - 1, x) || n(y + 1, x) || n(y, x - 1) || n(y, x + 1)) out[y][x] = color;
  }
  return out;
}

export interface CharOpts { look: AvatarLook; shirt: string; pose: "sit" | "stand"; blink?: boolean; bob?: number }

/** full character grid (16 x 16 seated, 16 x 26 standing), with a 1px outline margin */
export function character({ look, shirt, pose, blink }: CharOpts): Grid {
  const skin = pick(SKINS, look.skin);
  const hair = pick(HAIR_COLORS, look.hairColor);
  const colors: Record<string, string | null> = {
    S: skin, s: shade(skin, -0.18), E: blink ? shade(skin, -0.35) : "#2a1a14", p: mix(skin, "#f08a8a", 0.35),
    B: shirt, b: shade(shirt, -0.22), W: "#fbf4e2", H: hair, h: shade(hair, -0.25), P: "#3d4a6b", F: "#2a1a14",
  };
  const body = pose === "sit" ? TORSO_SIT : BODY_STAND;
  const g = blank(16, HEAD.length + body.length + 1);
  stamp(g, HEAD, 0, 0, colors);
  stamp(g, body, 0, HEAD.length, colors);
  stamp(g, pick(HAIR_STYLES, look.hair), 0, 0, colors);
  return outline(g);
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

export function drawGrid(ctx: CanvasRenderingContext2D, g: Grid, x: number, y: number) {
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) {
    const col = g[r][c];
    if (col) { ctx.fillStyle = col; ctx.fillRect(x + c, y + r, 1, 1); }
  }
}

/* ─────────── the desk scene ─────────── */
export interface SceneOpts {
  look: AvatarLook;
  shirt: string;
  state: LiveState;
  /** local hour of the person (fractional) */
  hour: number;
  minute: number;
  phase: Phase;
  frame: number;
  seed: number;
  rain?: boolean;
  present: boolean; // has the app open
  /** flow mode (R-001): focused ms so far; lights a star per 25 minutes and brightens the lamp */
  flowMs?: number;
  /** R-005: status says "sleeping": lights off, head down on the desk */
  sleeping?: boolean;
  /** R-007: they 收工'd for the day — lights out until they focus again */
  closed?: boolean;
}

/** where the flow stars appear in the window, in the order they light up (relative to the window, avoiding the sash) */
const FLOW_STARS: [number, number][] = [[4, 4], [20, 7], [10, 9], [26, 3], [5, 20], [25, 18], [11, 22], [19, 21]];
const FLOW_STAR_MS = 25 * 60_000;

export const SCENE_W = 96;
export const SCENE_H = 80;

const C = {
  wall: "#e2bd8a", wallStripe: "#d5ad79", trim: "#8a5228", base: "#6e3d1d",
  floorA: "#b8773d", floorB: "#ad6d36", seam: "#87502a",
  wood: "#8a5228", woodHi: "#b07040", woodDk: "#5e3218",
  deskTop: "#c98446", deskHi: "#e3a568", deskFront: "#9c5a2c", deskDk: "#6e3d1d",
  paper: "#fbf4e2", paperLine: "#d9c9a3",
};

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function sky(ctx: CanvasRenderingContext2D, o: SceneOpts, x: number, y: number, w: number, h: number) {
  const bands: Record<Phase, string[]> = {
    day: ["#7cc6f2", "#9ad4f6", "#bfe5fa"],
    dawn: ["#9a86c8", "#f0a3a0", "#f9d29a"],
    dusk: ["#4f3f86", "#c4627a", "#f2a35e"],
    night: ["#0f1533", "#172049", "#202c61"],
  };
  const b = bands[o.phase];
  const bh = Math.ceil(h / 3);
  b.forEach((c, i) => rect(ctx, x, y + i * bh, w, Math.min(bh, h - i * bh), c));
  const r = rng(o.seed);
  if (o.phase === "night") {
    for (let i = 0; i < 14; i++) {
      const sx = x + Math.floor(r() * w), sy = y + Math.floor(r() * h * 0.8);
      const tw = (o.frame + i) % 9 === 0;
      rect(ctx, sx, sy, 1, 1, tw ? "#ffffff" : "#c9d3ff");
    }
    // crescent moon
    rect(ctx, x + w - 9, y + 3, 4, 1, "#f6f0c8"); rect(ctx, x + w - 10, y + 4, 5, 3, "#f6f0c8"); rect(ctx, x + w - 9, y + 7, 4, 1, "#f6f0c8");
    rect(ctx, x + w - 8, y + 4, 3, 3, b[0]);
  } else {
    // sun height follows the hour
    const t = Math.max(0, Math.min(1, (o.hour - 5) / 15));
    const sunY = y + Math.round(h - 4 - Math.sin(t * Math.PI) * (h - 9));
    const sunX = x + 3 + Math.round(t * (w - 10));
    const sun = o.phase === "day" ? "#ffe680" : "#ffc36b";
    rect(ctx, sunX + 1, sunY, 3, 5, sun); rect(ctx, sunX, sunY + 1, 5, 3, sun);
    // drifting cloud
    const cx = x + ((Math.floor(o.frame / 6) + Math.floor(r() * 30)) % (w + 12)) - 10;
    const cc = o.phase === "day" ? "#ffffff" : "#f6d6c8";
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    rect(ctx, cx, y + 6, 9, 2, cc); rect(ctx, cx + 2, y + 5, 5, 1, cc); rect(ctx, cx + 1, y + 8, 7, 1, shade(cc, -0.06));
    ctx.restore();
  }
  // distant hills
  const hill = o.phase === "night" ? "#18304a" : o.phase === "day" ? "#5aa25a" : "#6a5a6a";
  for (let i = 0; i < w; i++) {
    const hh = 2 + Math.round(Math.sin((i + o.seed % 13) / 3.2) * 1.5 + Math.sin(i / 7) * 1.5);
    rect(ctx, x + i, y + h - hh, 1, hh, hill);
  }
  if (o.rain) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let i = 0; i < 12; i++) {
      const rx = x + ((i * 7 + o.frame * 2) % (w + 4)) - 2;
      const ry = y + ((i * 11 + o.frame * 5) % (h + 4)) - 2;
      rect(ctx, rx, ry, 1, 2, "rgba(200,225,255,.8)");
    }
    ctx.restore();
  }
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, c: string) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    rect(ctx, x0, y0, 1, 1, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, o: SceneOpts) {
  const r = rng(o.seed * 7 + 3);
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  // wall
  rect(ctx, 0, 0, SCENE_W, 48, C.wall);
  for (let x = 2; x < SCENE_W; x += 6) rect(ctx, x, 0, 1, 46, C.wallStripe);
  rect(ctx, 0, 0, SCENE_W, 2, C.trim);
  rect(ctx, 0, 44, SCENE_W, 2, C.trim); rect(ctx, 0, 46, SCENE_W, 2, C.base);
  // floor
  for (let y = 48; y < SCENE_H; y += 5) {
    rect(ctx, 0, y, SCENE_W, 5, ((y - 48) / 5) % 2 ? C.floorA : C.floorB);
    rect(ctx, 0, y + 4, SCENE_W, 1, C.seam);
    const off = ((y - 48) / 5) % 2 ? 9 : 25;
    for (let x = off; x < SCENE_W; x += 32) rect(ctx, x, y, 1, 4, C.seam);
  }
  // rug
  const rugC = shade(o.shirt, -0.35);
  rect(ctx, 22, 70, 58, 8, rugC); rect(ctx, 24, 71, 54, 6, shade(rugC, 0.18));
  for (let x = 26; x < 76; x += 4) rect(ctx, x, 73, 2, 2, rugC);

  // window frame + curtains
  const wx = 8, wy = 6, ww = 30, wh = 26;
  rect(ctx, wx - 2, wy - 2, ww + 4, wh + 4, C.woodDk);
  rect(ctx, wx - 1, wy - 1, ww + 2, wh + 2, C.wood);
  sky(ctx, o, wx, wy, ww, wh);
  rect(ctx, wx + ww / 2 - 1, wy, 2, wh, C.wood); rect(ctx, wx, wy + wh / 2 - 1, ww, 2, C.wood);
  rect(ctx, wx - 3, wy + wh + 1, ww + 6, 2, C.woodHi); // sill
  const cur = shade(o.shirt, 0.25);
  rect(ctx, wx - 5, wy - 3, 5, wh + 7, cur); rect(ctx, wx - 4, wy - 3, 1, wh + 7, shade(cur, -0.15));
  rect(ctx, wx + ww, wy - 3, 5, wh + 7, cur); rect(ctx, wx + ww + 2, wy - 3, 1, wh + 7, shade(cur, -0.15));
  rect(ctx, wx - 7, wy - 4, ww + 14, 2, C.woodDk); // rod

  // wall clock showing the person's local time
  const kx = 72, ky = 12;
  rect(ctx, kx - 6, ky - 7, 13, 15, C.woodDk); rect(ctx, kx - 7, ky - 6, 15, 13, C.woodDk);
  rect(ctx, kx - 5, ky - 6, 11, 13, "#f6e7c4"); rect(ctx, kx - 6, ky - 5, 13, 11, "#f6e7c4");
  for (let i = 0; i < 12; i += 3) { const a = (i / 12) * Math.PI * 2; rect(ctx, kx + Math.round(Math.sin(a) * 5), ky - Math.round(Math.cos(a) * 5), 1, 1, C.wood); }
  const ha = ((o.hour % 12) + o.minute / 60) / 12 * Math.PI * 2, ma = (o.minute / 60) * Math.PI * 2;
  line(ctx, kx, ky, kx + Math.sin(ma) * 4.6, ky - Math.cos(ma) * 4.6, "#3a2016");
  line(ctx, kx, ky, kx + Math.sin(ha) * 3, ky - Math.cos(ha) * 3, "#b5442e");

  // shelf with books and a plant
  rect(ctx, 52, 30, 40, 2, C.woodHi); rect(ctx, 52, 32, 40, 1, C.woodDk);
  let bx = 54;
  const bookCols = ["#b5442e", "#3f7d5c", "#2f5f8a", "#d9a443", "#6a4a8f", "#c06a3a"];
  for (let i = 0; i < 6; i++) {
    const bw = 2 + Math.floor(r() * 2), bh = 6 + Math.floor(r() * 4);
    rect(ctx, bx, 30 - bh, bw, bh, bookCols[(i + o.seed) % bookCols.length]);
    rect(ctx, bx, 30 - bh + 2, bw, 1, "rgba(255,255,255,.35)");
    bx += bw + 1;
  }
  // plant
  rect(ctx, 84, 25, 5, 5, "#b5603a"); rect(ctx, 84, 25, 5, 1, "#d27a4e");
  rect(ctx, 85, 20, 1, 5, "#3f7d5c"); rect(ctx, 83, 21, 3, 2, "#5aa25a"); rect(ctx, 86, 19, 3, 2, "#5aa25a"); rect(ctx, 87, 22, 2, 2, "#4a9050");

  const seated = o.state === "focus" || o.state === "paused";
  const slump = !!o.sleeping && !seated && o.state !== "break";
  const lampOn = seated;
  // flow: the lamp warms up over the first two hours
  const boost = seated && o.flowMs ? Math.min(1, o.flowMs / (120 * 60_000)) : 0;
  // chair back
  const chairC = C.wood;
  if (!seated && !slump) {
    rect(ctx, 38, 36, 20, 2, C.woodDk); rect(ctx, 38, 38, 2, 12, C.woodDk); rect(ctx, 56, 38, 2, 12, C.woodDk);
    rect(ctx, 40, 38, 16, 9, chairC); rect(ctx, 41, 39, 14, 1, C.woodHi);
  } else {
    rect(ctx, 37, 40, 22, 10, C.woodDk); rect(ctx, 38, 41, 20, 9, chairC);
  }
  // seated character
  const blink = o.frame % 23 === 0;
  if (seated) {
    const g = character({ look: o.look, shirt: o.shirt, pose: "sit", blink });
    const bob = o.state === "focus" && o.frame % 8 < 4 ? 0 : 1;
    drawGrid(ctx, g, 40, 32 + (o.state === "paused" ? 1 : bob));
  }
  if (slump) {
    // head sunk onto the desk, eyes shut, slow breathing
    const g = character({ look: o.look, shirt: o.shirt, pose: "sit", blink: true });
    drawGrid(ctx, g, 40, 39 + (o.frame % 16 < 8 ? 0 : 1));
  }

  // desk
  rect(ctx, 12, 49, 76, 1, C.deskDk);
  rect(ctx, 12, 50, 76, 6, C.deskTop); rect(ctx, 12, 50, 76, 1, C.deskHi);
  rect(ctx, 14, 56, 72, 12, C.deskFront); rect(ctx, 14, 56, 72, 1, C.deskDk);
  rect(ctx, 58, 59, 24, 6, shade(C.deskFront, 0.1)); rect(ctx, 58, 59, 24, 1, C.deskDk); rect(ctx, 69, 61, 2, 2, "#e7c56e");
  rect(ctx, 16, 68, 3, 9, C.deskDk); rect(ctx, 81, 68, 3, 9, C.deskDk);
  rect(ctx, 12, 77, 76, 1, "rgba(60,30,10,.25)");

  // books on the left of the desk
  rect(ctx, 18, 45, 12, 2, "#2f5f8a"); rect(ctx, 19, 43, 10, 2, "#b5442e"); rect(ctx, 18, 41, 11, 2, "#3f7d5c");
  rect(ctx, 18, 45, 12, 1, "#4a7aa8");
  // notebook / paper
  rect(ctx, 40, 50, 16, 4, C.paper); for (let x = 42; x < 55; x += 3) rect(ctx, x, 51, 2, 1, C.paperLine);
  if (o.state === "focus") {
    // written lines grow over time
    const n = (Math.floor(o.frame / 6) % 6);
    for (let i = 0; i < n; i++) rect(ctx, 42 + i * 2, 52, 1, 1, "#4a5160");
  }
  // mug
  if (o.state !== "break") {
    rect(ctx, 32, 46, 4, 4, "#f2ece0"); rect(ctx, 36, 47, 1, 2, "#f2ece0"); rect(ctx, 32, 46, 4, 1, "#7a4523");
    if (seated && o.frame % 6 < 3) { rect(ctx, 33, 43, 1, 2, "rgba(255,255,255,.7)"); }
    if (seated && o.frame % 6 >= 3) { rect(ctx, 34, 42, 1, 2, "rgba(255,255,255,.7)"); }
  }
  // hands writing
  if (seated) {
    const skin = pick(SKINS, o.look.skin);
    const hx = o.state === "focus" ? 49 + (o.frame % 4 < 2 ? 0 : 2) : 49;
    rect(ctx, 42, 50, 3, 2, OUTLINE); rect(ctx, 43, 50, 2, 1, skin);
    rect(ctx, hx, 50, 3, 2, OUTLINE); rect(ctx, hx, 50, 2, 1, skin);
    rect(ctx, hx + 2, 47, 1, 3, "#e7b73e"); rect(ctx, hx + 2, 46, 1, 1, "#e98f8f");
  }
  if (slump) {
    // folded arms on the desk, the face resting on them
    const sh = o.shirt;
    rect(ctx, 37, 47, 22, 5, OUTLINE);
    rect(ctx, 38, 48, 20, 3, sh); rect(ctx, 38, 50, 20, 1, shade(sh, -0.22));
    rect(ctx, 38, 48, 3, 2, pick(SKINS, o.look.skin)); rect(ctx, 55, 48, 3, 2, pick(SKINS, o.look.skin));
  }
  // lamp
  const lx = 70;
  rect(ctx, lx, 47, 8, 3, "#2f4a3a"); rect(ctx, lx + 3, 37, 2, 10, "#2f4a3a");
  rect(ctx, lx - 2, 33, 12, 5, "#3f7d5c"); rect(ctx, lx - 1, 32, 10, 1, "#3f7d5c"); rect(ctx, lx - 2, 33, 12, 1, "#5aa27a");
  rect(ctx, lx + 1, 38, 6, 1, lampOn ? (boost > 0.5 ? "#fffbe0" : "#fff2a8") : "#6d7a70");

  // standing character on a break, holding a mug
  if (o.state === "break") {
    const g = character({ look: o.look, shirt: o.shirt, pose: "stand", blink });
    drawGrid(ctx, g, 2, 49 + (o.frame % 10 < 5 ? 0 : 1));
    rect(ctx, 14, 61, 3, 3, "#f2ece0"); rect(ctx, 14, 61, 3, 1, "#7a4523");
    if (o.frame % 6 < 3) rect(ctx, 15, 58, 1, 2, "rgba(255,255,255,.75)"); else rect(ctx, 16, 57, 1, 2, "rgba(255,255,255,.75)");
  }

  // lighting: their local time of day
  const dim = Math.max(o.phase === "night" ? 0.45 : o.phase === "dusk" || o.phase === "dawn" ? 0.14 : 0, slump ? 0.4 : 0);
  if (dim) { ctx.fillStyle = `rgba(14,16,44,${dim})`; ctx.fillRect(0, 0, SCENE_W, SCENE_H); }
  if (lampOn) {
    // stepped pool of lamp light: three rings, brightest under the shade
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const k = (o.phase === "night" ? 1 : 0.45) * (1 + boost * 0.9);
    const reach = 1 / (1 + boost * 0.3);
    const cx = lx + 4, cy = 44;
    for (let y = 22; y < 74; y++) for (let x = 18; x < SCENE_W; x++) {
      const d = Math.hypot((x - cx) * 0.8, (y - cy) * 1.25) * reach;
      const lvl = d < 10 ? 3 : d < 17 ? 2 : d < 25 ? 1 : 0;
      if (!lvl) continue;
      // checkerboard dither on the outer ring
      if (lvl === 1 && (x + y) % 2) continue;
      ctx.fillStyle = `rgba(255,196,100,${(lvl * 0.07 * k).toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }
  if (seated && o.flowMs) {
    // flow: one pixel star outside the window for every 25 focused minutes; the newest one twinkles
    const n = Math.min(FLOW_STARS.length, Math.floor(o.flowMs / FLOW_STAR_MS));
    for (let i = 0; i < n; i++) {
      const sx = wx + FLOW_STARS[i][0], sy = wy + FLOW_STARS[i][1];
      const tw = i === n - 1 && o.frame % 10 < 5;
      rect(ctx, sx - 1, sy, 3, 1, "#ffd45a"); rect(ctx, sx, sy - 1, 1, 3, "#ffd45a");
      if (tw) { rect(ctx, sx - 2, sy, 1, 1, "#ffe9a0"); rect(ctx, sx + 2, sy, 1, 1, "#ffe9a0"); rect(ctx, sx, sy - 2, 1, 1, "#ffe9a0"); rect(ctx, sx, sy + 2, 1, 1, "#ffe9a0"); }
      rect(ctx, sx, sy, 1, 1, "#fffbe6");
    }
  }
  if (o.closed && !seated && o.state !== "break") drawClosed(ctx, o);
  if (slump || (!o.present && !seated && o.state !== "break" && o.phase === "night")) {
    // "Zzz" over the empty chair: they're probably asleep
    const z = "#c9d3ff";
    const zy = 26 - (o.frame % 12 < 6 ? 0 : 1);
    rect(ctx, 46, zy, 3, 1, z); rect(ctx, 47, zy + 1, 1, 1, z); rect(ctx, 46, zy + 2, 3, 1, z);
    rect(ctx, 50, zy - 4, 4, 1, z); rect(ctx, 52, zy - 3, 1, 1, z); rect(ctx, 51, zy - 2, 1, 1, z); rect(ctx, 50, zy - 1, 4, 1, z);
  }
}

/** R-007 收工: notebook shut, a little moon sign on the chair, and the room goes dark */
function drawClosed(ctx: CanvasRenderingContext2D, o: SceneOpts) {
  // closed notebook with the pencil laid on top
  const cover = shade(o.shirt, -0.2);
  rect(ctx, 40, 50, 16, 4, cover); rect(ctx, 40, 50, 16, 1, shade(cover, 0.25)); rect(ctx, 40, 53, 16, 1, shade(cover, -0.3));
  rect(ctx, 41, 51, 1, 2, C.paper);
  rect(ctx, 44, 52, 9, 1, "#e7b73e"); rect(ctx, 53, 52, 1, 1, "#e98f8f");
  // sign hung on the chair back: a crescent moon
  rect(ctx, 47, 36, 1, 3, C.woodDk); rect(ctx, 48, 35, 1, 1, C.woodDk); rect(ctx, 49, 36, 1, 3, C.woodDk);
  rect(ctx, 43, 39, 11, 7, C.woodDk); rect(ctx, 44, 40, 9, 5, C.paper);
  rect(ctx, 47, 41, 3, 1, "#d9a443"); rect(ctx, 46, 42, 2, 2, "#d9a443"); rect(ctx, 47, 44, 3, 1, "#d9a443");
  // lights out
  const k = o.phase === "night" ? 0.38 : o.phase === "day" ? 0.5 : 0.44;
  ctx.fillStyle = `rgba(8,10,30,${k})`;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
}

/** a head-and-shoulders portrait grid for avatars */
export function portrait(look: AvatarLook, shirt: string): Grid {
  const g = character({ look, shirt, pose: "sit" });
  return g.slice(0, 15);
}
