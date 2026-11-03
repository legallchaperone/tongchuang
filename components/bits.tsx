"use client";
import React from "react";
import type { LiveStatus, Profile } from "@/lib/types";
import { partsIn, phaseAt } from "@/lib/time";

export const seriesVar = (i: number | null | undefined) => `var(--s${((i ?? 0) % 8 + 8) % 8})`;

export function Avatar({ p, size = 36, live, showSky = true }: { p?: Profile | null; size?: number; live?: LiveStatus; showSky?: boolean }) {
  const name = p?.name || "?";
  const initial = Array.from(name.trim())[0]?.toUpperCase() || "?";
  const phase = p ? phaseAt(partsIn(Date.now(), p.tz).h) : "day";
  const st = live?.state === "focus" ? "focus" : live?.state === "break" ? "break" : "";
  return (
    <span className={`av ${st}`} style={{ width: size, height: size, background: seriesVar(p?.color), fontSize: size * 0.42 }} title={name}>
      {initial}
      <span className="ring" />
      {showSky && p && <span className={`sky sky-${phase}`} style={{ width: Math.max(10, size * 0.36), height: Math.max(10, size * 0.36) }} />}
    </span>
  );
}

export function Ring({ value, size = 132, stroke = 10, color = "var(--lamp)", track = "var(--surface-2)", children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }} />
        {value > 1 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--good)" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value - 1))} />
        )}
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
