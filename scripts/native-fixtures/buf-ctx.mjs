// A tiny stand-in for CanvasRenderingContext2D that draws into an RGBA8 buffer with the same integer
// blending Chromium's software canvas (Skia) uses. It is the reference model the Swift port
// (TCPixel.PixelBuffer) implements; the fixture script checks it against real Chromium pixels.
//
// Blending, measured against headless Chromium (see scripts/native-fixtures.mjs, "model check"):
//   A  = round(alpha * 255)                      (JS Math.round on the double)
//   sp = round(src * A / 255)                    (premultiplied source channel)
//   source-over on an opaque pixel: out = sp + ((dst * (256 - A)) >> 8)
//   lighter (additive):             out = min(255, sp + dst)
// Only solid #rrggbb and rgba(r,g,b,a) fill styles are supported: that is all lib/pixel.ts uses.

export function parseColor(s) {
  if (s[0] === "#") {
    const n = parseInt(s.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(s);
  if (!m) throw new Error("unsupported color " + s);
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
}

export class BufCtx {
  constructor(w, h) {
    this.width = w; this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    /** 1 where the pixel's current value came from a translucent fill */
    this.mask = new Uint8Array(w * h);
    this.fillStyle = "#000000";
    this.globalCompositeOperation = "source-over";
    this.clip0 = { x0: 0, y0: 0, x1: w, y1: h };
    this.stack = [];
    this.path = [];
  }
  save() { this.stack.push({ fillStyle: this.fillStyle, gco: this.globalCompositeOperation, clip: { ...this.clip0 } }); }
  restore() { const s = this.stack.pop(); if (!s) return; this.fillStyle = s.fillStyle; this.globalCompositeOperation = s.gco; this.clip0 = s.clip; }
  beginPath() { this.path = []; }
  rect(x, y, w, h) { this.path.push(norm(x, y, w, h)); }
  clip() {
    if (this.path.length !== 1) throw new Error("only single-rect clips are supported");
    const r = this.path[0], c = this.clip0;
    this.clip0 = { x0: Math.max(c.x0, r.x0), y0: Math.max(c.y0, r.y0), x1: Math.min(c.x1, r.x1), y1: Math.min(c.y1, r.y1) };
  }
  clearRect(x, y, w, h) {
    this.each(norm(x, y, w, h), (i) => { this.data[i] = this.data[i + 1] = this.data[i + 2] = this.data[i + 3] = 0; this.mask[i >> 2] = 0; }, false);
  }
  fillRect(x, y, w, h) {
    const c = parseColor(this.fillStyle);
    const lighter = this.globalCompositeOperation === "lighter";
    if (!lighter && this.globalCompositeOperation !== "source-over") throw new Error("unsupported op");
    const d = this.data;
    if (c.a >= 1 && !lighter) {
      this.each(norm(x, y, w, h), (i) => { d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b; d[i + 3] = 255; this.mask[i >> 2] = 0; });
      return;
    }
    const A = Math.round(c.a * 255);
    const sp = [c.r, c.g, c.b].map((v) => Math.round((v * A) / 255));
    this.each(norm(x, y, w, h), (i) => {
      if (d[i + 3] !== 255) throw new Error("translucent fill over a non-opaque pixel is outside the model");
      for (let k = 0; k < 3; k++) d[i + k] = lighter ? Math.min(255, sp[k] + d[i + k]) : sp[k] + ((d[i + k] * (256 - A)) >> 8);
      this.mask[i >> 2] = 1;
    });
  }
  each(r, f, clip = true) {
    const c = clip ? this.clip0 : { x0: 0, y0: 0, x1: this.width, y1: this.height };
    const x0 = Math.max(r.x0, c.x0, 0), y0 = Math.max(r.y0, c.y0, 0);
    const x1 = Math.min(r.x1, c.x1, this.width), y1 = Math.min(r.y1, c.y1, this.height);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f((y * this.width + x) * 4);
  }
}

function norm(x, y, w, h) {
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  if (![x, y, w, h].every(Number.isInteger)) throw new Error(`non-integer rect ${x},${y},${w},${h}`);
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}
