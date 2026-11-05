"use client";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CAKE_COLORS, CAKE_N, cakeRuns } from "@/lib/cake";

/** chart drawing width = container width, so text stays at its real size */
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
import type { Profile, Subject } from "@/lib/types";
import { dur, durShort, HOUR, hhmm, MIN, partsIn, phaseAt, startOfDay, tzCity, weekdayCn, weekdayOfKey } from "@/lib/time";
import { Avatar, seriesVar } from "./bits";
import { ProfileLink } from "./profile/ProfileLink";

/* ───────── stacked daily bars (by subject) with goal line ───────── */
export function DailyBars({ rows, subjects, goalMs, height = 200, todayKey, onPickDay }: {
  rows: { key: string; total: number; parts: Map<string | null, number> }[]; subjects: Subject[]; goalMs: number; height?: number; todayKey?: string;
  /** R-021: clicking a day's column */
  onPickDay?: (key: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const H = height, padL = 34, padB = 22, padT = 10;
  const max = Math.max(goalMs * 1.15, ...rows.map((r) => r.total), HOUR);
  const step = max > 8 * HOUR ? 2 * HOUR : HOUR;
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  const n = rows.length;
  const slot = (W - padL) / n;
  const bw = Math.max(3, Math.min(28, slot * 0.62));
  const y = (v: number) => H - padB - (v / max) * (H - padB - padT);
  const order = subjects.map((s) => s.id as string | null).concat([null]);
  const showEvery = Math.max(1, Math.ceil(n / Math.floor((W - padL) / 44)));
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="每日专注时长">
        <g className="grid">{ticks.map((t) => <line key={t} x1={padL} x2={W} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map((t) => <text key={t} x={padL - 6} y={y(t) + 3} textAnchor="end">{t / HOUR}h</text>)}
        {rows.map((r, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          let acc = 0;
          const segs = order.filter((id) => (r.parts.get(id) || 0) > 0);
          return (
            <g key={r.key} opacity={hover == null || hover === i ? 1 : 0.45}>
              {segs.map((id, j) => {
                const v = r.parts.get(id)!;
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                const top = j === segs.length - 1;
                const h = Math.max(1, y0 - y1 - (top ? 0 : 2));
                const s = subjects.find((x) => x.id === id);
                const fill = id == null ? "var(--ink-3)" : seriesVar(s?.color);
                return top
                  ? <path key={String(id)} d={roundTop(x, y1, bw, h, Math.min(4, bw / 2, h))} fill={fill} />
                  : <rect key={String(id)} x={x} y={y1 + 2} width={bw} height={h} fill={fill} />;
              })}
              {(i % showEvery === 0 || i === n - 1 || r.key === todayKey) && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" style={{ fontWeight: r.key === todayKey ? 700 : 400, fill: r.key === todayKey ? "var(--ink)" : undefined }}>
                  {r.key === todayKey ? "今天" : n <= 7 ? "周" + weekdayCn[weekdayOfKey(r.key)] : r.key.slice(5).replace("-", "/")}
                </text>
              )}
              <rect x={padL + i * slot} y={0} width={slot} height={H - padB} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1}
                onClick={onPickDay && (() => onPickDay(r.key))} style={onPickDay ? { cursor: "pointer" } : undefined} />
            </g>
          );
        })}
        <line className="goal" x1={padL} x2={W} y1={y(goalMs)} y2={y(goalMs)} />
      </svg>
      <div className="legend" style={{ marginTop: 8 }}><span><svg width="18" height="4" style={{ width: 18 }}><line x1="0" x2="18" y1="2" y2="2" className="goal" style={{ stroke: "var(--ink-2)", strokeDasharray: "3 3" }} /></svg>每日目标 {durShort(goalMs)}</span></div>
      {hover != null && rows[hover] && (
        <div className="tip" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%`, top: `${(y(rows[hover].total) / H) * 100}%` }}>
          <div>{rows[hover].key.replace(/-/g, "/")} · 周{weekdayCn[weekdayOfKey(rows[hover].key)]}</div>
          <b>{dur(rows[hover].total)}</b>
          {order.filter((id) => (rows[hover].parts.get(id) || 0) > 0).map((id) => {
            const s = subjects.find((x) => x.id === id);
            return <div key={String(id)} style={{ opacity: .8 }}>{s?.name || "未分类"} {dur(rows[hover].parts.get(id)!)}</div>;
          })}
        </div>
      )}
    </div>
  );
}
function roundTop(x: number, y: number, w: number, h: number, _r: number) {
  const r = 0; void _r;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/* ───────── year heatmap ───────── */
const LEVELS = [0, 0.5 * HOUR, 1.5 * HOUR, 3 * HOUR, 5 * HOUR];
const level = (ms: number) => (ms <= 0 ? 0 : LEVELS.filter((l) => ms >= l).length);
export function Heatmap({ cols, onPickDay }: { cols: { key: string; ms: number; future: boolean }[][]; /** R-021: clicking a day */ onPickDay?: (key: string) => void }) {
  const [hover, setHover] = useState<{ key: string; ms: number; x: number; y: number } | null>(null);
  // today is on the right edge: when the year does not fit, open scrolled all the way right so "now" is what you see first
  const wrap = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const el = wrap.current; if (el) el.scrollLeft = el.scrollWidth; }, [cols.length]);
  const months: { col: number; label: string }[] = [];
  cols.forEach((c, i) => { const d = c[0].key; if (i === 0 || d.slice(5, 7) !== cols[i - 1][0].key.slice(5, 7)) months.push({ col: i, label: Number(d.slice(5, 7)) + "月" }); });
  return (
    <div className="heatwrap" ref={wrap}>
      <div className="chart" style={{ minWidth: 680 }} onMouseLeave={() => setHover(null)}>
        <div className="heatgrid">
          <div />
          <div className="months" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
            {months.map((m) => <span key={m.col} style={{ gridColumn: `${m.col + 1} / span 4` }}>{m.label}</span>)}
          </div>
          <div className="wd">{["一", "", "三", "", "五", "", "日"].map((d, i) => <span key={i} style={{ lineHeight: 1, alignSelf: "center" }}>{d}</span>)}</div>
          <div className="heat" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
            {cols.flatMap((c, ci) => c.map((d, di) => (
              <div key={d.key} className="c" style={{ background: d.future ? "transparent" : `var(--q${level(d.ms)})`, cursor: onPickDay && !d.future ? "pointer" : undefined }}
                onMouseEnter={() => !d.future && setHover({ key: d.key, ms: d.ms, x: (ci + 0.5) / cols.length, y: di / 7 })}
                onClick={onPickDay && !d.future ? () => onPickDay(d.key) : undefined} />
            )))}
          </div>
        </div>
        {hover && (
          <div className="tip" style={{ left: `calc(28px + ${hover.x} * (100% - 28px))`, top: `calc(18px + ${hover.y} * (100% - 18px))` }}>
            {hover.key.replace(/-/g, "/")} · <b>{hover.ms ? dur(hover.ms) : "未学习"}</b>
          </div>
        )}
      </div>
      <div className="scale" style={{ marginTop: 10, justifyContent: "flex-end" }}>
        少 {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ background: `var(--q${i})` }} />)} 多
        <span style={{ marginLeft: 8 }}>（30分 / 1.5时 / 3时 / 5时）</span>
      </div>
    </div>
  );
}

/* ───────── hour-of-day profile ───────── */
export function HourChart({ data, color, days }: { data: { h: number; ms: number; rating: number | null }[]; color: string; days: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const H = 160, padL = 34, padB = 22, padT = 8;
  const per = data.map((d) => d.ms / days);
  const max = Math.max(10 * MIN, ...per);
  const slot = (W - padL) / 24, bw = slot * 0.66;
  const y = (v: number) => H - padB - (v / max) * (H - padB - padT);
  const top3 = [...per.keys()].sort((a, b) => per[b] - per[a]).slice(0, 3);
  const tickStep = max > 40 * MIN ? 20 * MIN : 10 * MIN;
  const ticks: number[] = []; for (let t = 0; t <= max; t += tickStep) ticks.push(t);
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="一天中各时段的平均专注分钟">
        <g className="grid">{ticks.map((t) => <line key={t} x1={padL} x2={W} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map((t) => <text key={t} x={padL - 6} y={y(t) + 3} textAnchor="end">{Math.round(t / MIN)}m</text>)}
        {per.map((v, h) => {
          const x = padL + h * slot + (slot - bw) / 2;
          const bh = Math.max(v > 0 ? 1 : 0, H - padB - y(v));
          return (
            <g key={h} opacity={hover == null || hover === h ? 1 : 0.45}>
              {bh > 0 && <path d={roundTop(x, y(v), bw, bh, Math.min(3, bh, bw / 2))} fill={top3.includes(h) && v > 0 ? color : `color-mix(in srgb, ${color} 45%, var(--panel-2))`} />}
              {h % (W < 420 ? 6 : 3) === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle">{h}</text>}
              <rect x={padL + h * slot} y={0} width={slot} height={H - padB} fill="transparent" onMouseEnter={() => setHover(h)} />
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%`, top: `${(y(per[hover]) / H) * 100}%` }}>
          {hover}:00–{hover + 1}:00 · 平均每天 <b>{Math.round(per[hover] / MIN)} 分</b>
          {data[hover].rating != null && <div style={{ opacity: .8 }}>平均专注度 {data[hover].rating!.toFixed(1)} / 5</div>}
        </div>
      )}
    </div>
  );
}

/* ───────── horizontal bars (subjects / people) ───────── */
export function HBars({ items }: { items: { key: string; label: React.ReactNode; ms: number; color: string; sub?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.ms));
  return (
    <div>
      {items.map((i) => (
        <div className="hbar" key={i.key} title={i.sub}>
          <div className="lbl">{i.label}</div>
          <div className="track"><div className="fill" style={{ width: `${(i.ms / max) * 100}%`, background: i.color }} /></div>
          <div className="v">{durShort(i.ms)}</div>
        </div>
      ))}
    </div>
  );
}

/* ───────── time-zone band: everyone's day on the viewer's clock ───────── */
export function TimezoneBand({ people, viewerTz, heat, now }: { people: Profile[]; viewerTz: string; heat: Record<string, number[]>; now: number }) {
  const day0 = startOfDay(now, viewerTz);
  const hourLocal = (p: Profile, h: number) => partsIn(day0 + h * HOUR + 30 * MIN, p.tz).h;
  const nowFrac = (now - day0) / (24 * HOUR);
  // hours (viewer clock) when everyone is between 08:00 and 24:00 local
  const awake = Array.from({ length: 24 }, (_, h) => people.every((p) => { const lh = hourLocal(p, h); return lh >= 8 && lh <= 23; }));
  const spans: [number, number][] = [];
  awake.forEach((a, h) => { if (a) { if (spans.length && spans[spans.length - 1][1] === h) spans[spans.length - 1][1] = h + 1; else spans.push([h, h + 1]); } });
  const maxHeat = Math.max(1, ...Object.values(heat).flat());
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="tzband">
        <div />
        <div className="axis">{Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 3 === 0 ? h : ""}</span>)}</div>
        {people.map((p) => (
          <React.Fragment key={p.id}>
            <div className="who"><ProfileLink id={p.id} label={`${p.name}的主页`}><Avatar p={p} size={26} showSky={false} /></ProfileLink><div><ProfileLink id={p.id} className="plink-name"><b>{p.name}</b></ProfileLink><small>{tzCity(p.tz)} {hhmm(now, p.tz)}</small></div></div>
            <div style={{ position: "relative" }}>
              <div className="band">
                {Array.from({ length: 24 }, (_, h) => {
                  const lh = hourLocal(p, h);
                  const v = (heat[p.id]?.[h] || 0) / maxHeat;
                  return (
                    <div key={h} className={`h ${phaseAt(lh)}`} title={`你的 ${h}:00 = ${p.name}的 ${lh}:00${v ? ` · 常在这时学习` : ""}`}>
                      {(lh % 6 === 0) && <span className="lt">{lh}</span>}
                      {v > 0.04 && <span className="act" style={{ height: `${Math.max(3, v * 22)}px`, background: seriesVar(p.color) }} />}
                    </div>
                  );
                })}
              </div>
              {spans.map(([a, b]) => <div key={a} className="overlap" style={{ left: `${(a / 24) * 100}%`, width: `${((b - a) / 24) * 100}%` }} />)}
              <div className="nowline" style={{ left: `calc(${nowFrac * 100}% - 1px)` }} />
            </div>
          </React.Fragment>
        ))}
      </div>
      <div className="legend" style={{ paddingLeft: 0 }}>
        <span><i className="sky-night" />当地深夜</span><span><i className="sky-dawn" />清晨/傍晚</span><span><i className="sky-day" />白天</span>
        <span><i style={{ background: "color-mix(in srgb, var(--good) 30%, transparent)", border: "1px dashed var(--good)" }} />大家都醒着（当地 8–24 点）</span>
        <span><i style={{ background: "var(--ink-2)" }} />柱高 = 近 30 天常学的时段</span>
      </div>
      <OverlapText spans={spans} />
    </div>
  );
}
function OverlapText({ spans }: { spans: [number, number][] }) {
  const total = spans.reduce((a, [x, y]) => a + y - x, 0);
  return useMemo(() => (
    <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
      {total === 0 ? "你们没有同时清醒的时段，适合接力学习：一个人收工时把进度留给下一个人。"
        : <>按你的时间，大家都醒着的时段是 <b className="num">{spans.map(([a, b]) => `${a}:00–${b === 24 ? "24" : b}:00`).join("、")}</b>，共 {total} 小时，适合约一起开番茄钟。</>}
    </p>
  ), [spans, total]);
}

/* ───────── subject cake: part-to-whole, values printed in the legend ───────── */
export interface Slice { key: string; label: React.ReactNode; name: string; ms: number; color: string }

/** keep the 5 largest parts and fold the rest into "其他" so the ring never has more than 6 segments */
export function foldSlices(items: Slice[], max = 6): Slice[] {
  const sorted = [...items].filter((i) => i.ms > 0).sort((a, b) => b.ms - a.ms);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((a, s) => a + s.ms, 0);
  return [...head, { key: "__other", label: "其他", name: "其他", ms: rest, color: "var(--ink-3)" }];
}

export function PixelDonut({ items, size = 200 }: { items: Slice[]; size?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = items.reduce((a, s) => a + s.ms, 0) || 1;
  const runs = useMemo(() => cakeRuns(items.map((s) => s.ms)), [items]);
  const hi = hover ? items.findIndex((s) => s.key === hover) : -1;
  return (
    <div className="donut">
      <div className="donut-ring cake" style={{ width: size, height: size }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${CAKE_N} ${CAKE_N}`} width={size} height={size} shapeRendering="crispEdges" role="img"
          aria-label={items.map((s) => `${s.name} ${Math.round((s.ms / total) * 100)}%`).join("，")}>
          {runs.map((r) => {
            const sliced = r.tone === "top";
            return (
              <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1}
                fill={sliced ? items[r.slice]?.color || "var(--ink-3)" : CAKE_COLORS[r.tone as Exclude<typeof r.tone, "top">]}
                opacity={hi >= 0 && sliced && r.slice !== hi ? 0.35 : 1}
                onMouseEnter={sliced ? () => setHover(items[r.slice]?.key ?? null) : undefined} />
            );
          })}
        </svg>
      </div>
      <ul className="donut-legend">
        {items.map((s) => (
          <li key={s.key} className={hover === s.key ? "on" : ""} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: s.color }} />
            <span className="nm">{s.label}</span>
            <span className="num pct">{Math.round((s.ms / total) * 100)}%</span>
            <span className="num v">{durShort(s.ms)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
