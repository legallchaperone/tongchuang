"use client";
import React from "react";
import type { LiveStatus, Profile } from "@/lib/types";
import { PixelAvatar } from "./Pixel";

export const seriesVar = (i: number | null | undefined) => `var(--s${((i ?? 0) % 8 + 8) % 8})`;

export function Avatar(props: { p?: Profile | null; size?: number; live?: LiveStatus; showSky?: boolean }) {
  return <PixelAvatar {...props} />;
}

/** segmented pixel gauge: 20 blocks around a square ring */
export function Ring({ value, size = 132, children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const N = 28;
  const lit = Math.round(Math.max(0, Math.min(1, value)) * N);
  const over = value > 1 ? Math.round(Math.min(1, value - 1) * N) : 0;
  // walk the border of an 8x8 grid clockwise starting top-middle
  const cells: [number, number][] = [];
  for (let x = 4; x < 8; x++) cells.push([x, 0]);
  for (let y = 1; y < 8; y++) cells.push([7, y]);
  for (let x = 6; x >= 0; x--) cells.push([x, 7]);
  for (let y = 6; y >= 0; y--) cells.push([0, y]);
  for (let x = 1; x < 4; x++) cells.push([x, 0]);
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg viewBox="-0.2 -0.2 8.4 8.4" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">
        {cells.slice(0, N).map(([x, y], i) => (
          <rect key={i} x={x + 0.12} y={y + 0.12} width={0.76} height={0.76}
            fill={i < over ? "var(--grass)" : i < lit ? "var(--lamp)" : "var(--slot)"} stroke="var(--edge)" strokeWidth={0.1} />
        ))}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{children}</div>
    </div>
  );
}

export function StatePill({ l }: { l?: LiveStatus }) {
  const s = l?.state || "idle";
  const txt = s === "focus" ? "专注中" : s === "break" ? "休息中" : s === "paused" ? "暂停" : "离开";
  return <span className={`state-pill ${s}`}>{txt}</span>;
}

export function Spinner() {
  return <div className="center-full"><div className="spinner" aria-label="加载中" /></div>;
}
