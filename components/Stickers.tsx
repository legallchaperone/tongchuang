"use client";
/**
 * R-020 像素贴纸：原创 16×16 小画，和 lib/pixel.ts 的小人一样用字符串地图画成，自动描边，画到 canvas 再整数倍放大。
 * 留言板用它；以后别处（分享图、点赞……）也能直接用 STICKERS / stickerGrid / <Sticker />。
 */
import React, { useEffect, useRef } from "react";
import { outline, OUTLINE, type Grid } from "@/lib/pixel";

interface StickerDef {
  id: string;
  name: string;
  /** 16 rows × 16 columns; "." is empty, every other letter is looked up in `colors` */
  map: string[];
  colors: Record<string, string>;
  /** letters drawn after the outline, without one (steam, sparkles) */
  loose?: string;
}

const W = "#fff8e6"; // highlight

const DEFS: StickerDef[] = [
  {
    id: "fist", name: "加油",
    map: [
      "................",
      "................",
      "..SSS.SS.SS.SS..",
      "..SSSSSSSSSSSS..",
      "..SWSsSSsSSsSS..",
      "..SWSsSSsSSsSS..",
      "..SSSsSSsSSsSs..",
      "..ssssssssssss..",
      "..STTTTTTSSSSs..",
      "..SSSSSSTSSSSs..",
      "...SSSSSSSSSs...",
      "....sSSSSSSs....",
      "....RRRRRRRR....",
      "....RwRRwRRR....",
      "....rrrrrrrr....",
      "................",
    ],
    colors: { S: "#f2c79a", s: "#d49a68", T: "#e6b384", W, R: "#e34948", r: "#a8302f", w: "#ff9a8a" },
  },
  {
    id: "coffee", name: "咖啡",
    map: [
      "................",
      "......w....w....",
      "......w....w....",
      ".....w....w.....",
      ".....w....w.....",
      "................",
      "..MMMMMMMMMM....",
      "..MCCCCCCCCM....",
      "..MMMMMMMMMMMM..",
      "..MWMMMMMMMM.M..",
      "..MWMMHHMMMM.M..",
      "..MMMMHHMMMMMM..",
      "..mMMMMMMMMm....",
      "...mmmmmmmm.....",
      ".PPPPPPPPPPPPP..",
      "................",
    ],
    colors: { M: "#f6efe0", m: "#cdbfa5", C: "#6b3a1f", H: "#e87ba4", W, w: "#b3a796", P: "#9ad4f6" },
    loose: "w",
  },
  {
    id: "flower", name: "小花",
    map: [
      "................",
      ".....PP..PP.....",
      "....PPPPPPPP....",
      "....PPpYYpPP....",
      "..PPPpYYYYpPPP..",
      "..PPPYYWYYYPPP..",
      "...PPpYYYYpPP...",
      "....PPPpYPPP....",
      ".....PP.GPP.....",
      "........G.......",
      "...LL...G.......",
      "...LLL..G..LL...",
      "....LLL.G.LLL...",
      "......LLGLL.....",
      "........G.......",
      "................",
    ],
    colors: { P: "#f59ab8", p: "#d9688f", Y: "#ffd34d", W, G: "#3e8a3c", L: "#6fbf5a" },
  },
  {
    id: "trophy", name: "奖杯",
    map: [
      "................",
      "..GGGGGGGGGGGG..",
      ".GGYWYYYYYYYYGG.",
      ".G.YWYYYYYYYY.G.",
      ".G.YWYYYYYYYY.G.",
      ".GG.YYYYYYYY.GG.",
      "..G.YYYYYYYY.G..",
      ".....YYYYYYy....",
      "......yYYy......",
      ".......YY.......",
      ".......YY.......",
      "......yYYy......",
      "....BBBBBBBB....",
      "....BBbbbbBB....",
      "...BBBBBBBBBB...",
      "................",
    ],
    colors: { Y: "#f5b83d", y: "#c98500", G: "#e0a020", W, B: "#8a5a34", b: "#ffd34d" },
  },
  {
    id: "cat", name: "猫",
    map: [
      "................",
      "..O........O....",
      "..OO......OO....",
      "..OpO....OpO....",
      "..OOOOOOOOOO....",
      ".OOOOOOOOOOOO...",
      ".OOKOOOOOOKOO...",
      ".OOKOOOOOOKOO...",
      ".OOOOONNOOOOO...",
      ".OWWOOOOOOOWWO..",
      "..OOOOKKKOOOO...",
      "...OOOOOOOOO....",
      "...OoOOOOOoO.TT.",
      "...OoOOOOOoOTT..",
      "...OOO..OOOOT...",
      "................",
    ],
    colors: { O: "#f0a24a", o: "#c97a2a", p: "#f59ab8", K: "#2a1a14", N: "#e87ba4", W: "#fff1d2", T: "#f0a24a" },
  },
  {
    id: "moon", name: "月亮",
    map: [
      "................",
      ".....MMMM.......",
      "...MMMMM........",
      "..MMMMM.....s...",
      "..MMMM.....sWs..",
      ".MMMMm......s...",
      ".MMMMm..........",
      ".MMMMm..........",
      ".MMMMMm.........",
      ".MMMMMMm.....s..",
      "..MMMMMMm.......",
      "..MMMMMMMMmmM...",
      "...MMMMMMMMMM...",
      ".....MMMMMM.....",
      "................",
      "................",
    ],
    colors: { M: "#ffe08a", m: "#e0b850", s: "#f5b83d", W },
  },
  {
    id: "star", name: "星星",
    map: [
      "................",
      ".......YY.......",
      ".......YY.......",
      "......YYYY......",
      "......YWYY......",
      ".YYYYYYYYYYYYYY.",
      "..YYYYYYYYYYYY..",
      "...YYKYYYYKYY...",
      "....YYYYYYYY....",
      "....YYYppYYY....",
      "...YYYYYYYYYY...",
      "...YYYyyyyYYY...",
      "..YYYy....yYYY..",
      "..YYy......yYY..",
      "..Yy........yY..",
      "................",
    ],
    colors: { Y: "#ffd34d", y: "#e0a020", W, K: "#3a2016", p: "#f08a8a" },
  },
  {
    id: "heart", name: "爱心",
    map: [
      "................",
      "................",
      "...RRR....RRR...",
      "..RRRRR..RRRRR..",
      ".RRWWRRRRRRRRRR.",
      ".RWWRRRRRRRRRRR.",
      ".RRRRRRRRRRRRRR.",
      ".RRRRRRRRRRRRRr.",
      "..RRRRRRRRRRRr..",
      "...RRRRRRRRRr...",
      "....RRRRRRRr....",
      ".....RRRRRr.....",
      "......RRRr......",
      ".......Rr.......",
      "................",
      "................",
    ],
    colors: { R: "#e34948", r: "#a8302f", W: "#ffb0a8" },
  },
  {
    id: "book", name: "书本",
    map: [
      "................",
      "................",
      "..PPPPP..PPPPP..",
      ".BPPPPPP.PPPPPB.",
      ".BPllllPPllllPB.",
      ".BPPPPPPPPPPPPB.",
      ".BPllllPPlllPPB.",
      ".BPPPPPPPPPPPPB.",
      ".BPlllPPPllllPB.",
      ".BPPPPPPPPPPPPB.",
      ".BPllllPPlllPPB.",
      ".BPPPPPPPPPPPPB.",
      ".BBBBBBBBBBBBBB.",
      "..bbbbbbRbbbbb..",
      "........R.......",
      "................",
    ],
    colors: { P: "#fff6dc", l: "#b9a888", B: "#2a78d6", b: "#1a4f96", R: "#e34948" },
  },
  {
    id: "tomato", name: "番茄",
    map: [
      "................",
      ".......GG.......",
      "....G.GGG.G.....",
      "....GGGGGGG.....",
      "...RRGGRGGRR....",
      "..RRRRRRRRRRRR..",
      ".RRWWRRRRRRRRRR.",
      ".RWWRRRRRRRRRRR.",
      ".RRRRRRRRRRRRRR.",
      ".RRRRRRRRRRRRRr.",
      ".RRRRRRRRRRRRRr.",
      "..RRRRRRRRRRRr..",
      "...rRRRRRRRRr...",
      ".....rrrrrr.....",
      "................",
      "................",
    ],
    colors: { R: "#e8503a", r: "#a8302f", W: "#ffb0a0", G: "#3e8a3c" },
  },
  {
    id: "flame", name: "火苗",
    map: [
      "................",
      ".......R........",
      "......RR........",
      "......RRR...R...",
      ".....RRRR..RR...",
      "....RRORRR.RR...",
      "...RRROORRRRRR..",
      "..RRROOOORRRRR..",
      "..RROOOOOORRRR..",
      "..RROOYYOOORRR..",
      "..RROYYYYOOORR..",
      "..RROYYWYYOORR..",
      "...RROYYYYORR...",
      "....RROOOORR....",
      "......RRRR......",
      "................",
    ],
    colors: { R: "#e34948", O: "#f08a2a", Y: "#ffd34d", W },
  },
  {
    id: "rainbow", name: "彩虹",
    map: [
      "................",
      "................",
      "....RRRRRRRR....",
      "..RRRRRRRRRRRR..",
      ".RROOOOOOOOOORR.",
      ".ROOYYYYYYYYOOR.",
      "ROOYYGGGGGGYYOOR",
      "ROYYGGBBBBGGYYOR",
      "ROYGGBB..BBGGYOR",
      "ROYGB......BGYOR",
      "ROYGB......BGYOR",
      "CCCCC......CCCCC",
      "CCWCCC....CCCWCC",
      ".CCCC......CCCC.",
      "................",
      "................",
    ],
    colors: { R: "#e34948", O: "#f08a2a", Y: "#ffd34d", G: "#4f9a4a", B: "#2a78d6", C: "#ffffff", W: "#dfe8f0" },
  },
];

export type StickerId = string;
/** every sticker, in picker order */
export const STICKERS: readonly { id: StickerId; name: string }[] = DEFS.map(({ id, name }) => ({ id, name }));
export const stickerName = (id: string | null | undefined) => DEFS.find((d) => d.id === id)?.name || "贴纸";
export const isSticker = (id: string | null | undefined) => !!id && DEFS.some((d) => d.id === id);

/** native size of a sticker grid (with its outline) */
export const STICKER_PX = 18;
const cache = new Map<string, Grid>();
/** the sticker as a pixel grid (18 × 18 with the outline), for drawing into any canvas with drawGrid */
export function stickerGrid(id: string): Grid | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const d = DEFS.find((x) => x.id === id);
  if (!d) return null;
  // one empty pixel of margin all around so the outline always fits
  const g: Grid = Array.from({ length: STICKER_PX }, () => Array<string | null>(STICKER_PX).fill(null));
  const loose = d.loose || "";
  d.map.forEach((row, y) => [...row].forEach((c, x) => { if (c !== "." && !loose.includes(c)) g[y + 1][x + 1] = d.colors[c] ?? null; }));
  const out = outline(g, OUTLINE);
  d.map.forEach((row, y) => [...row].forEach((c, x) => { if (c !== "." && loose.includes(c)) out[y + 1][x + 1] = d.colors[c] ?? null; }));
  cache.set(id, out);
  return out;
}

/** a sticker drawn crisp at `size` CSS pixels (best at multiples of 18: 36, 54, 72) */
export function Sticker({ id, size = 36, className = "", title }: { id: string; size?: number; className?: string; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = stickerGrid(id);
    if (!c || !g) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, STICKER_PX, STICKER_PX);
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
      const col = g[y][x];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    }
  }, [id]);
  const label = title ?? stickerName(id);
  return (
    <canvas ref={ref} className={`sticker ${className}`.trim()} width={STICKER_PX} height={STICKER_PX}
      style={{ width: size, height: size }} role="img" aria-label={label} title={label} />
  );
}
