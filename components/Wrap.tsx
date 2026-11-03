"use client";
/** R-007 收工: the home button, “昨天的你说” banner, pixel faces and the energy / impact trend chart */
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { closedReview, dayLabel, ENERGY, IMPACT, isWindDown, workDay, workDayMs } from "@/lib/review";
import type { DailyReview, UserId } from "@/lib/types";
import { addDaysKey, dur, weekdayCn, weekdayOfKey } from "@/lib/time";
import { IClose } from "./Icons";

/* ───────── pixel bits ───────── */
const MOON = ["...####...", "..###.....", ".###......", ".###......", ".###......", ".###......", ".####.....", "..#####..#", "...######.", "....###..."];
export function MoonIcon({ size = 18 }: { size?: number }) {
  const rects: React.ReactNode[] = [];
  MOON.forEach((row, y) => [...row].forEach((c, x) => { if (c === "#") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />); }));
  return <svg className="pxi" width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">{rects}</svg>;
}

// o outline, f face, e eye, m mouth
const FACE_BASE = ["..oooooo..", ".offffffo.", "offffffffo", "offffffffo", "offffffffo", "offffffffo", "offffffffo", "offffffffo", ".offffffo.", "..oooooo.."];
const FACE_MARKS: Record<number, [number, number][]> = {
  1: [[2, 4], [3, 4], [6, 4], [7, 4], [3, 7], [4, 6], [5, 7], [6, 6]], // sleepy eyes, wobbly mouth
  2: [[3, 3], [3, 4], [6, 3], [6, 4], [3, 6], [4, 6], [5, 6], [6, 6]], // dot eyes, flat mouth
  3: [[3, 3], [3, 4], [6, 3], [6, 4], [2, 6], [3, 7], [4, 7], [5, 7], [6, 7], [7, 6]], // smile
};
/** energy face, original 10×10 pixel art */
export function EnergyFace({ v, size = 32 }: { v: number; size?: number }) {
  const rects: React.ReactNode[] = [];
  FACE_BASE.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "o") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="var(--edge)" />);
    if (c === "f") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={v === 3 ? "#ffd86b" : v === 2 ? "#f3c98a" : "#d9c3a0"} />);
  }));
  FACE_MARKS[v]?.forEach(([x, y]) => rects.push(<rect key={`m${x}-${y}`} x={x} y={y} width={1} height={1} fill="#3a2016" />));
  if (v === 3) { rects.push(<rect key="c1" x={1} y={5} width={1} height={1} fill="#f08a8a" />, <rect key="c2" x={8} y={5} width={1} height={1} fill="#f08a8a" />); }
  return <svg width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true" style={{ imageRendering: "pixelated" }}>{rects}</svg>;
}

/* ───────── home: the 收工 button ───────── */
export function WrapButton() {
  const app = useApp();
  const meId = app.me!.id;
  const tz = app.myProfile!.tz;
  const now = app.now;
  const l = app.live[meId];
  const ms = workDayMs(app.sessions, meId, l, tz, now);
  const closed = closedReview(app.reviews, app.sessions, l, meId, tz, now);
  const lit = !closed && ms > 0 && isWindDown(now, tz);
  return (
    <Link href="/wrap" className={`btn wrapbtn ${lit ? "lamp lit" : ""} ${closed ? "closed" : ""}`}
      title={closed ? "今天已经收工，点开可以修改" : lit ? "今天学得差不多了，收个工吧" : "结束今天：回顾一下，写一句明天先做什么"}>
      <MoonIcon />{closed ? "已收工" : "收工"}
    </Link>
  );
}

/* ───────── home: “昨天的你说” ───────── */
const SEEN_KEY = "tc-r007-seen";
export function YesterdayNote() {
  const app = useApp();
  const meId = app.me!.id;
  const tz = app.myProfile!.tz;
  const cur = workDay(app.now, tz);
  const [seen, setSeen] = useState<string | null>("?");
  useEffect(() => { try { setSeen(localStorage.getItem(SEEN_KEY)); } catch { setSeen(null); } }, []);
  const r = useMemo(() => app.reviews
    .filter((x) => x.userId === meId && x.note && x.day < cur && x.day >= addDaysKey(cur, -3))
    .sort((a, b) => b.day.localeCompare(a.day))[0], [app.reviews, meId, cur]);
  const closedToday = app.reviews.some((x) => x.userId === meId && x.day === cur);
  if (!r || closedToday || seen === "?" || seen === r.day) return null;
  function close() {
    setSeen(r!.day);
    try { localStorage.setItem(SEEN_KEY, r!.day); } catch { /* private mode */ }
  }
  return (
    <div className="ynote" role="note">
      <span className="ynote-moon"><MoonIcon size={20} /></span>
      <div style={{ minWidth: 0 }}>
        <span className="ynote-k">{dayLabel(r.day, cur)}的你说</span>
        <b>{r.note}</b>
      </div>
      <button className="iconbtn" onClick={close} aria-label="知道了，关掉"><IClose /></button>
    </div>
  );
}

/* ───────── stats: energy & impact over time ───────── */
function useWidth(fallback = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Two small multiples on one shared day axis (never a dual axis): impact 1–4 and energy 1–3,
 * each drawn as a column of pixel blocks — ordinal levels, not a continuous value.
 */
export function ReviewTrend({ userId, keys, daily, isMe, name }: { userId: UserId; keys: string[]; daily: Map<string, number>; isMe: boolean; name: string }) {
  const app = useApp();
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const byDay = useMemo(() => {
    const m = new Map<string, DailyReview>();
    app.reviews.forEach((r) => { if (r.userId === userId) m.set(r.day, r); });
    return m;
  }, [app.reviews, userId]);
  const rows = keys.map((k) => ({ key: k, r: byDay.get(k) || null }));
  const done = rows.filter((x) => x.r);
  const imp = done.filter((x) => x.r!.impact != null);
  const en = done.filter((x) => x.r!.energy != null);
  const avgImpact = imp.length ? imp.reduce((a, x) => a + x.r!.impact!, 0) / imp.length : null;
  const fullDays = en.filter((x) => x.r!.energy === 3).length;
  const hi = imp.filter((x) => x.r!.impact! >= 3), lo = imp.filter((x) => x.r!.impact! <= 2);
  const avgMs = (l: typeof imp) => l.reduce((a, x) => a + (daily.get(x.key) || 0), 0) / Math.max(1, l.length);

  if (!done.length) {
    return <p className="muted">{isMe ? "这段时间还没有收工记录。晚上在首页点「收工」，给今天的精力和收获打个分，这里会画出变化。" : `${name}这段时间还没有收工记录。`}</p>;
  }

  const n = rows.length;
  const padL = 40, padR = 4, cell = 8, gap = 2;
  const slot = (W - padL - padR) / n;
  const bw = Math.max(2, Math.min(18, slot - Math.max(1, Math.min(4, slot * 0.3))));
  const strips = [
    { id: "impact", title: "收获", max: 4, color: "var(--s0)", get: (r: DailyReview) => r.impact, labels: IMPACT.map((x) => x.label) },
    { id: "energy", title: "精力", max: 3, color: "var(--s3)", get: (r: DailyReview) => r.energy, labels: ENERGY.map((x) => x.label) },
  ];
  const showEvery = Math.max(1, Math.ceil(n / Math.floor((W - padL) / 44)));
  const stripH = (max: number) => max * (cell + gap) + 26;
  const H = strips.reduce((a, s) => a + stripH(s.max), 0) + 20;
  let y0 = 0;
  const hv = hover != null ? rows[hover] : null;

  return (
    <div className="rtrend">
      <div className="rtrend-kpis">
        <div><b className="num">{done.length}<small>/{n}</small></b><span>收工天数</span></div>
        <div><b className="num">{avgImpact != null ? avgImpact.toFixed(1) : "—"}<small>/4</small></b><span>平均收获</span></div>
        <div><b className="num">{fullDays}<small> 天</small></b><span>精力满格</span></div>
      </div>
      <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`每天的收获（1–4）和精力（1–3），共 ${done.length} 天有记录`}>
          {strips.map((s) => {
            const top = y0 + 24;
            const base = top + s.max * (cell + gap);
            y0 += stripH(s.max);
            return (
              <g key={s.id}>
                <text x={0} y={top - 10} style={{ fill: "var(--ink-2)" }}>{s.title}</text>
                <text x={padL - 6} y={top + cell} textAnchor="end">{s.labels[s.max - 1]}</text>
                <text x={padL - 6} y={base - gap} textAnchor="end">{s.labels[0]}</text>
                {rows.map((row, i) => {
                  const x = padL + i * slot + (slot - bw) / 2;
                  const v = row.r ? s.get(row.r) : null;
                  return (
                    <g key={row.key} opacity={hover == null || hover === i ? 1 : 0.45}>
                      {Array.from({ length: s.max }, (_, j) => (
                        <rect key={j} x={x} y={base - (j + 1) * (cell + gap)} width={bw} height={cell}
                          fill={v != null && j < v ? s.color : "var(--slot)"} opacity={v != null && j < v ? 1 : row.r ? 0.9 : 0.5} />
                      ))}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {rows.map((row, i) => ((i % showEvery === 0 && n - 1 - i >= showEvery * 0.8) || i === n - 1) && (
            <text key={row.key} x={padL + i * slot + slot / 2} y={H - 4} textAnchor="middle">{n <= 7 ? "周" + weekdayCn[weekdayOfKey(row.key)] : row.key.slice(5).replace("-", "/")}</text>
          ))}
          {rows.map((row, i) => (
            <rect key={"h" + row.key} x={padL + i * slot} y={0} width={slot} height={H - 18} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hv && (
          <div className="tip" style={{ left: `${((padL + (hover! + 0.5) * slot) / W) * 100}%`, top: "18px" }}>
            <div>{hv.key.replace(/-/g, "/")} · 周{weekdayCn[weekdayOfKey(hv.key)]} · 专注 {dur(daily.get(hv.key) || 0)}</div>
            {hv.r ? <>
              <b>收获 {hv.r.impact != null ? `${IMPACT[hv.r.impact - 1].label}（${hv.r.impact}/4）` : "—"} · 精力 {hv.r.energy != null ? ENERGY[hv.r.energy - 1].label : "—"}</b>
              {hv.r.note && <div style={{ opacity: .8, maxWidth: 260, whiteSpace: "normal" }}>明天先：{hv.r.note}</div>}
            </> : <div style={{ opacity: .8 }}>没有收工记录</div>}
          </div>
        )}
      </div>
      {hi.length >= 2 && lo.length >= 2 && (
        <p className="rtrend-note">收获多（3–4）的日子平均专注 <b className="num">{dur(avgMs(hi))}</b>，收获少（1–2）的日子平均 <b className="num">{dur(avgMs(lo))}</b>。</p>
      )}
    </div>
  );
}
