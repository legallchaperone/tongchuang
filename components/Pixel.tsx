"use client";
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LiveStatus, Profile } from "@/lib/types";
import { defaultLook, drawScene, pick, portrait, SCENE_H, SCENE_W, SHIRTS, type AvatarLook } from "@/lib/pixel";
import { partsIn, phaseAt } from "@/lib/time";

/* one shared animation clock (~6 fps) */
let frame = 0;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) timer = setInterval(() => { frame++; subs.forEach((f) => f()); }, 170);
  return () => { subs.delete(cb); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
}
export const useFrame = () => useSyncExternalStore(subscribe, () => frame, () => 0);

export const lookOf = (p?: Profile | null): AvatarLook => (p?.look && typeof p.look === "object" ? { ...defaultLook(p.id), ...p.look } : defaultLook(p?.id || "x"));
export const shirtOf = (p?: Profile | null) => pick(SHIRTS, p?.color);

function seedOf(id: string) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

/** a person's little room, drawn at native pixel size and scaled by whole numbers */
export function DeskScene({ p, live, present, rain = false, maxScale = 6, at }: { p: Profile; live?: LiveStatus; present: boolean; rain?: boolean; maxScale?: number; /** draw at this instant instead of now */ at?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(3);
  const f = useFrame();
  const reduce = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.max(1, Math.min(maxScale, Math.floor(e.contentRect.width / SCENE_W)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxScale]);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const t = partsIn(at ?? Date.now(), p.tz);
    drawScene(ctx, {
      look: lookOf(p), shirt: shirtOf(p), state: live?.state || "idle", hour: t.h + t.mi / 60, minute: t.mi, phase: phaseAt(t.h),
      frame: reduce ? 0 : f, seed: seedOf(p.id), rain, present,
    });
  }, [f, p, live?.state, present, rain, reduce, at]);

  return (
    <div ref={wrap} className="scene-wrap">
      <canvas ref={ref} width={SCENE_W} height={SCENE_H} className="scene" style={{ width: SCENE_W * scale, height: SCENE_H * scale }}
        role="img" aria-label={`${p.name}的书桌：${live?.state === "focus" ? "正在专注" : live?.state === "break" ? "在休息" : live?.state === "paused" ? "暂停中" : "不在座位"}`} />
    </div>
  );
}

/** head-and-shoulders pixel portrait on a little window of the person's local sky */
export function PixelAvatar({ p, size = 36, live, showSky = true }: { p?: Profile | null; size?: number; live?: LiveStatus; showSky?: boolean }) {
  const g = useMemo(() => portrait(lookOf(p), shirtOf(p)), [p]);
  const phase = p ? phaseAt(partsIn(Date.now(), p.tz).h) : "day";
  const st = live?.state === "focus" ? "focus" : live?.state === "break" ? "break" : "";
  const rects: React.ReactNode[] = [];
  g.forEach((row, y) => row.forEach((c, x) => { if (c) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />); }));
  return (
    <span className={`pav ${st} ${showSky ? "sky-" + phase : "plain"}`} style={{ width: size, height: size }} title={p?.name}>
      <svg viewBox="0 1 16 15" shapeRendering="crispEdges" aria-hidden="true">{rects}</svg>
    </span>
  );
}

/* ─────────── pixel icons (10 x 10) ─────────── */
const ICONS: Record<string, string[]> = {
  today: ["....#.....", ".#..#..#..", "..#....#..", "....##....", "#..####..#", "...####...", "....##....", "..#....#..", ".#..#..#..", "....#....."],
  room: ["....##....", "...####...", "..######..", ".########.", "##########", ".#......#.", ".#.##...#.", ".#.##.#.#.", ".#.##...#.", ".########."],
  stats: [".......##.", ".......##.", "....##.##.", "....##.##.", ".##.##.##.", ".##.##.##.", ".##.##.##.", ".##.##.##.", "..........", "##########"],
  settings: ["...#..#...", "..######..", ".##....##.", "..#.##.#..", "##.#..#.##", "##.#..#.##", "..#.##.#..", ".##....##.", "..######..", "...#..#..."],
  play: ["..#.......", "..##......", "..###.....", "..####....", "..#####...", "..#####...", "..####....", "..###.....", "..##......", "..#......."],
  pause: ["..........", ".##...##..", ".##...##..", ".##...##..", ".##...##..", ".##...##..", ".##...##..", ".##...##..", ".##...##..", ".........."],
  stop: ["..........", "..........", "..######..", "..######..", "..######..", "..######..", "..######..", "..######..", "..........", ".........."],
  hand: ["...#.#....", "..#.#.#...", "..#.#.#.#.", "..#.#.#.#.", "..#######.", "#.#######.", "##.######.", ".#######..", "..######..", "...####..."],
  users: ["..##......", ".####.##..", ".####.###.", "..##..###.", ".......#..", ".####.###.", "########..", "#######...", "..........", ".........."],
  plus: ["..........", "....##....", "....##....", "....##....", ".########.", ".########.", "....##....", "....##....", "....##....", ".........."],
  close: ["..........", ".##....##.", "..##..##..", "...####...", "....##....", "...####...", "..##..##..", ".##....##.", "..........", ".........."],
  copy: ["..######..", "..#....#..", "######.#..", "#....#.#..", "#....#.#..", "#....#.#..", "#....###..", "#....#....", "######....", ".........."],
  back: ["..........", "....#.....", "...##.....", "..########", ".#########", "..########", "...##.....", "....#.....", "..........", ".........."],
  expand: ["####..####", "##......##", "#.#....#.#", "...#..#...", "..........", "..........", "...#..#...", "#.#....#.#", "##......##", "####..####"],
  trash: ["...####...", "##########", ".#......#.", ".#.#.#..#.", ".#.#.#..#.", ".#.#.#..#.", ".#.#.#..#.", ".#.#.#..#.", ".#......#.", "..######.."],
  heart: [".##...##..", "####.####.", "#########.", "#########.", ".#######..", "..#####...", "...###....", "....#.....", "..........", ".........."],
  flame: ["....#.....", "...##.....", "...###....", "..####.#..", "..######..", ".########.", ".###..###.", ".##....##.", "..##..##..", "...####..."],
  sound: [".....#....", "....##..#.", "#####.#..#", "####..#..#", "####..#..#", "#####.#..#", "....##..#.", ".....#....", "..........", ".........."],
};
export function PxIcon({ name, size = 18, title }: { name: keyof typeof ICONS | string; size?: number; title?: string }) {
  const m = ICONS[name] || ICONS.plus;
  const rects: React.ReactNode[] = [];
  m.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />); }));
  return (
    <svg className="pxi" width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" fill="currentColor" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}{rects}
    </svg>
  );
}
