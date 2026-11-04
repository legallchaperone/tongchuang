/**
 * The subject chart as a flat pixel cake seen from straight above: each subject is a slice of frosting (clockwise from 12 o'clock),
 * cuts show the sponge, piped cream around the rim, on a plate.
 * Pure geometry: returns horizontal runs of grid cells with a "tone"; the page (SVG) and the share cards (canvas) color them.
 */
export const CAKE_N = 28;

export type CakeTone =
  | "top" // slice frosting
  | "cut" // the cut between two slices: sponge shows through
  | "pipe" | "pipeShade" // piped cream dollops on the rim
  | "plate" | "plateShade"
  | "crust" // the baked edge
  | "line"; // outline

export interface CakeRun { x: number; y: number; w: number; tone: CakeTone; /** slice index, -1 = not part of a slice */ slice: number }

/** fixed colors for the tones that do not depend on the slice */
export const CAKE_COLORS: Record<Exclude<CakeTone, "top">, string> = {
  cut: "#f4d39b", crust: "#c7843f", pipe: "#fffaf0", pipeShade: "#ead3ae",
plate: "#eef2f5", plateShade: "#b8c2cc", line: "#3a2016",
};

const cache = new Map<string, CakeRun[]>();

/** each slice's size (normalised here); an empty list draws a plain cake */
export function cakeRuns(sizes: number[]): CakeRun[] {
  const key = sizes.map((f) => f.toFixed(4)).join(",");
  const hit = cache.get(key);
  if (hit) return hit;
  const total = sizes.reduce((a, f) => a + Math.max(0, f), 0);
  let acc = 0;
  const bounds = sizes.map((f) => { const a0 = acc; acc += total ? Math.max(0, f) / total : 0; return { a0, a1: acc }; });
  const sliceAt = (a: number) => {
    if (!bounds.length || !total) return -1;
    const i = bounds.findIndex((b) => a >= b.a0 && a < b.a1);
    return i < 0 ? bounds.length - 1 : i;
  };
  const cuts = bounds.filter((b) => b.a1 - b.a0 > 0).length > 1 ? bounds.map((b) => b.a0 * 2 * Math.PI) : [];

  const N = CAKE_N, c = N / 2;
  const R_PLATE = 13.4, R_EDGE = 12.0, R_CAKE = 11.1, R_RIM = 10.0;
  const grid: (null | { tone: CakeTone; slice: number })[][] = Array.from({ length: N }, () => Array(N).fill(null));

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
    const a = ((Math.atan2(dx, -dy) / (2 * Math.PI)) + 1) % 1;
    let tone: CakeTone | null = null;
    if (r <= R_CAKE) {
      if (r > R_RIM) tone = Math.floor(a * 24) % 3 === 2 ? "pipeShade" : "pipe";
      else if (cuts.length && (r < 0.8 || cuts.some((t) => {
        const proj = dx * Math.sin(t) - dy * Math.cos(t);
        const perp = Math.abs(dx * Math.cos(t) + dy * Math.sin(t));
        return proj > 0 && perp < 0.5;
      }))) tone = "cut";
      else tone = "top";
    } else if (r <= R_EDGE) tone = "crust";
    else if (r <= R_PLATE) tone = a > 0.25 && a < 0.62 ? "plateShade" : "plate";
    if (tone) grid[y][x] = { tone, slice: tone === "top" ? sliceAt(a) : -1 };
  }
  // a one-cell outline around the plate
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && !!grid[y][x] && grid[y][x]!.tone !== "line";
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!grid[y][x] && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) grid[y][x] = { tone: "line", slice: -1 };
  }

  const runs: CakeRun[] = [];
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const g = grid[y][x];
      if (!g) { x++; continue; }
      let w = 1;
      while (x + w < N && grid[y][x + w]?.tone === g.tone && grid[y][x + w]?.slice === g.slice) w++;
      runs.push({ x, y, w, tone: g.tone, slice: g.slice });
      x += w;
    }
  }
  cache.set(key, runs);
  return runs;
}

/** draw the cake on a canvas, `cell` px per grid cell; slice colors as hex */
export function drawCake(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, items: { ms: number; color: string }[], empty: string) {
  for (const r of cakeRuns(items.map((i) => i.ms))) {
    ctx.fillStyle = r.tone === "top" ? items[r.slice]?.color || empty : CAKE_COLORS[r.tone];
    ctx.fillRect(x + r.x * cell, y + r.y * cell, r.w * cell, cell);
  }
}
