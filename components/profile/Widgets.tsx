"use client";
/* R-020 个人主页：各个小组件的内容（“小 / 宽”两种尺寸） */
import React, { useMemo } from "react";
import type { Profile } from "@/lib/types";
import { countdownLabel, daysUntil, WIDGET_INFO, type Widget } from "@/lib/profilePage";
import { peakLabel, peakWindow, type ProfileStats, type SubjectPart } from "@/lib/profileStats";
import { medalGrid, type Badge } from "@/lib/badges";
import { dayLabel, ENERGY, IMPACT } from "@/lib/review";
import { dayKey, dur, durShort, hhmm, HOUR, hrs, weekdayCn, weekdayOfKey } from "@/lib/time";
import { foldSlices, Heatmap, PixelDonut } from "@/components/Charts";
import { seriesVar } from "@/components/bits";
import { PxIcon } from "@/components/Pixel";
import { EnergyFace } from "@/components/Wrap";

/** the title a widget shows on its wooden tag */
export function widgetTitle(w: Widget) {
  if (w.type === "note") return w.config.title?.trim() || "便签";
  return WIDGET_INFO[w.type].name;
}

/** a small hint next to the title */
function widgetHint(w: Widget, s: ProfileStats) {
  switch (w.type) {
    case "subjects": return `最近 ${w.config.days || 30} 天`;
    case "hours": return `最近 ${w.config.days || 30} 天 · 当地时间`;
    case "heatmap": return `${s.activeDays} 天有记录`;
    case "badges": { const n = s.badges.filter((b) => b.earned).length; return `${n} / ${s.badges.length}`; }
    default: return "";
  }
}

export function WidgetCard({ w, s, p, isOwner, children, className = "", dragging, ...rest }: {
  w: Widget; s: ProfileStats; p: Profile; isOwner: boolean; children?: React.ReactNode; className?: string; dragging?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  const hint = widgetHint(w, s);
  return (
    <section className={`card pw pw-${w.size} pwt-${w.type} ${dragging ? "dragging" : ""} ${className}`} data-wid={w.id} {...rest}>
      {children}
      <div className="cardhead"><h2>{widgetTitle(w)}</h2>{hint && <span className="hint">{hint}</span>}</div>
      <div className="cardbody"><WidgetBody w={w} s={s} p={p} isOwner={isOwner} /></div>
    </section>
  );
}

export function WidgetBody({ w, s, p, isOwner }: { w: Widget; s: ProfileStats; p: Profile; isOwner: boolean }) {
  const wide = w.size === "w";
  switch (w.type) {
    case "today": return <TodayW s={s} wide={wide} />;
    case "streak": return <StreakW s={s} wide={wide} />;
    case "heatmap": return <HeatW s={s} wide={wide} />;
    case "subjects": return <SubjectsW parts={s.subjects[w.config.days === 7 ? 7 : 30]} wide={wide} />;
    case "hours": return <HoursW hours={s.hours[w.config.days === 90 ? 90 : 30]} wide={wide} />;
    case "recent": return <RecentW s={s} count={w.config.count || 5} hideTask={!!w.config.hideTask} wide={wide} />;
    case "review": return <ReviewW s={s} wide={wide} name={p.name} isOwner={isOwner} />;
    case "goals": return <GoalsW w={w} s={s} isOwner={isOwner} />;
    case "badges": return <BadgesW badges={s.badges} wide={wide} showLocked={w.config.showLocked !== false} />;
    case "note": return <NoteW text={w.config.text || ""} isOwner={isOwner} />;
  }
}

/* ───────── pieces ───────── */
function Meter({ value, label }: { value: number; label?: string }) {
  const n = 12, lit = Math.round(Math.max(0, Math.min(1, value)) * n);
  return (
    <div className="pw-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      {Array.from({ length: n }, (_, i) => <i key={i} className={i < lit ? (value >= 1 ? "full" : "on") : ""} />)}
    </div>
  );
}

function TodayW({ s, wide }: { s: ProfileStats; wide: boolean }) {
  const pct = s.goalMs ? s.todayMs / s.goalMs : 0;
  const max = Math.max(s.goalMs, ...s.week.map((d) => d.ms), HOUR);
  return (
    <div className={`pw-today ${wide ? "wide" : ""}`}>
      <div>
        <div className="muted">今天</div>
        <div className="pw-big num">{dur(s.todayMs)}</div>
        <Meter value={pct} label="今日目标进度" />
        <div className="muted pw-sub">目标 {durShort(s.goalMs)} · {Math.round(pct * 100)}%</div>
        <div className="pw-week"><span className="muted">本周</span> <b className="num">{hrs(s.weekMs)}h</b></div>
      </div>
      {wide && (
        <div className="pw-weekbars" aria-label="本周每天的专注时长">
          {s.week.map((d) => (
            <div key={d.key} className={`c ${d.key === s.todayKey ? "today" : ""} ${d.key > s.todayKey ? "future" : ""}`} title={`周${weekdayCn[weekdayOfKey(d.key)]} ${dur(d.ms)}`}>
              <div className="bar"><i style={{ height: `${(d.ms / max) * 100}%` }} className={d.ms >= s.goalMs ? "met" : ""} /><span className="goal" style={{ bottom: `${(s.goalMs / max) * 100}%` }} /></div>
              <span>{weekdayCn[weekdayOfKey(d.key)]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StreakW({ s, wide }: { s: ProfileStats; wide: boolean }) {
  const days = useMemo(() => {
    const out: { key: string; on: boolean }[] = [];
    const cols = s.yearCols.flat().filter((c) => !c.future);
    cols.slice(-(wide ? 28 : 14)).forEach((c) => out.push({ key: c.key, on: c.ms >= 15 * 60_000 }));
    return out;
  }, [s.yearCols, wide]);
  return (
    <div className={`pw-streak ${wide ? "wide" : ""}`}>
      <div className="pw-flame"><PxIcon name="flame" size={28} /></div>
      <div>
        <div className="pw-big num">{s.streak.current}<small> 天</small></div>
        <div className="muted">{s.streak.current ? "现在连续学习" : "今天学 15 分钟就开始连续"} · 最长 {s.streak.best} 天</div>
      </div>
      <div className="pw-dots" aria-label={`最近 ${days.length} 天`}>
        {days.map((d) => <i key={d.key} className={d.on ? "on" : ""} title={`${d.key.slice(5).replace("-", "/")}${d.on ? " 学了" : ""}`} />)}
      </div>
    </div>
  );
}

const LEVELS = [0, 0.5 * HOUR, 1.5 * HOUR, 3 * HOUR, 5 * HOUR];
const level = (ms: number) => (ms <= 0 ? 0 : LEVELS.filter((l) => ms >= l).length);
function HeatW({ s, wide }: { s: ProfileStats; wide: boolean }) {
  if (wide) return <Heatmap cols={s.yearCols} />;
  const cols = s.yearCols.slice(-18);
  return (
    <div className="pw-miniheat">
      <div className="heat" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
        {cols.flatMap((c) => c.map((d) => <div key={d.key} className="c" title={d.future ? undefined : `${d.key.replace(/-/g, "/")} ${d.ms ? dur(d.ms) : "未学习"}`} style={{ background: d.future ? "transparent" : `var(--q${level(d.ms)})` }} />))}
      </div>
      <div className="scale" style={{ marginTop: 8, justifyContent: "flex-end" }}>近 18 周 · 少 {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ background: `var(--q${i})` }} />)} 多</div>
    </div>
  );
}

const partColor = (x: SubjectPart) => (x.color == null ? "var(--ink-3)" : seriesVar(x.color));
function SubjectsW({ parts, wide }: { parts: SubjectPart[]; wide: boolean }) {
  const items = useMemo(() => foldSlices(parts.map((x) => ({ key: x.key, name: x.name, label: x.name, ms: x.ms, color: partColor(x) }))), [parts]);
  if (!items.length) return <p className="muted">这段时间还没有记录。</p>;
  return <div className={`pw-donut ${wide ? "wide" : ""}`}><PixelDonut items={wide ? items : items.slice(0, 4)} size={wide ? 168 : 128} /></div>;
}

function HoursW({ hours, wide }: { hours: number[]; wide: boolean }) {
  const peak = peakWindow(hours);
  const max = Math.max(...hours, 1);
  const inPeak = (h: number) => !!peak && (h === peak[0] % 24 || h === (peak[0] + 1) % 24);
  if (!peak) return <p className="muted">这段时间还没有记录。</p>;
  return (
    <div className={`pw-hours ${wide ? "wide" : ""}`}>
      <p>最常在 <b className="num">{peakLabel(peak)}</b> 学习</p>
      <div className="pw-hbars" aria-label="一天 24 小时里每小时的平均专注">
        {hours.map((v, h) => <i key={h} className={inPeak(h) ? "peak" : ""} style={{ height: `${Math.max(v > 0 ? 6 : 2, (v / max) * 100)}%` }} title={`${h}:00 平均 ${Math.round(v / 60_000)} 分`} />)}
      </div>
      <div className="pw-haxis"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
    </div>
  );
}

function RecentW({ s, count, hideTask, wide }: { s: ProfileStats; count: number; hideTask: boolean; wide: boolean }) {
  const list = s.recent.slice(0, count);
  if (!list.length) return <p className="muted">还没有专注记录。</p>;
  return (
    <ul className={`pw-recent ${wide ? "wide" : ""}`}>
      {list.map((r) => {
        const day = dayKey(r.startedAt, s.tz);
        return (
          <li key={r.startedAt}>
            <span className="what">
              {r.subject ? <span className="subj"><span className="dot" style={{ background: seriesVar(r.subject.color) }} />{r.subject.name}</span> : <span className="subj"><span className="dot" style={{ background: "var(--ink-3)" }} />未分类</span>}
              {!hideTask && r.task && <span className="task">{r.task}</span>}
            </span>
            <span className="d num">{dur(r.ms)}{r.count > 1 && r.mode === "pomodoro" ? <small className="muted"> · {r.count} 个番茄</small> : null}</span>
            <span className="when muted num">{dayLabel(day, s.todayKey)} {hhmm(r.startedAt, s.tz)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewW({ s, wide, name, isOwner }: { s: ProfileStats; wide: boolean; name: string; isOwner: boolean }) {
  const r = s.review;
  if (!r) return <p className="muted">{isOwner ? "还没有收工记录。晚上在首页点「收工」，这里会显示最近一次。" : `${name}还没有收工记录。`}</p>;
  return (
    <div className={`pw-review ${wide ? "wide" : ""}`}>
      <div className="pw-review-top">
        {r.energy != null && <EnergyFace v={r.energy} size={32} />}
        <div>
          <div><b>{dayLabel(r.day, s.todayKey)}</b> <span className="muted">专注 {dur(r.totalMs)}</span></div>
          <div className="muted">精力 {r.energy != null ? ENERGY[r.energy - 1].label : "—"} · 收获 {r.impact != null ? IMPACT[r.impact - 1].label : "—"}</div>
        </div>
      </div>
      {r.note && <div className="pw-plan"><span className="muted">明天先：</span>{r.note}</div>}
    </div>
  );
}

function GoalsW({ w, s, isOwner }: { w: Widget; s: ProfileStats; isOwner: boolean }) {
  const goals = (w.config.goals || []).filter((g) => g.title || g.date);
  if (!goals.length) return <p className="muted">{isOwner ? "在「编辑」里写下 1–3 个长期目标和日期。" : "还没有写目标。"}</p>;
  return (
    <ul className="pw-goals">
      {goals.map((g, i) => {
        const left = g.date ? countdownLabel(g.date, s.todayKey) : "";
        const n = g.date ? daysUntil(g.date, s.todayKey) : null;
        return (
          <li key={i}>
            <div className="t">{g.title || "目标"}</div>
            {g.date && <div className="muted num">{Number(g.date.slice(5, 7))}月{Number(g.date.slice(8))}日</div>}
            {n != null && <div className={`left ${n < 0 ? "past" : n <= 7 ? "soon" : ""}`}>{n > 1 ? <><b className="num">{n}</b> 天</> : left}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function Medal({ b, size = 39 }: { b: Pick<Badge, "kind" | "tier" | "earned">; size?: number }) {
  const g = useMemo(() => medalGrid(b, { fill: "var(--slot)", line: "var(--ink-3)" }), [b]);
  const rects: React.ReactNode[] = [];
  g.forEach((row, y) => row.forEach((c, x) => { if (c) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />); }));
  return <svg className="medal" width={size} height={(size * 16) / 13} viewBox="0 0 13 16" shapeRendering="crispEdges" aria-hidden="true">{rects}</svg>;
}

function BadgesW({ badges, wide, showLocked }: { badges: Badge[]; wide: boolean; showLocked: boolean }) {
  const earned = badges.filter((b) => b.earned);
  const list = showLocked ? [...earned, ...badges.filter((b) => !b.earned)] : earned;
  const shown = wide ? list : list.slice(0, 6);
  if (!shown.length) return <p className="muted">还没有徽章。完成第一次专注就能拿到「起步」。</p>;
  return (
    <ul className={`pw-badges ${wide ? "wide" : ""}`}>
      {shown.map((b) => (
        <li key={b.id} className={b.earned ? "" : "locked"} title={`${b.name}：${b.desc}${b.progress ? `（${b.progress}）` : ""}`}>
          <Medal b={b} size={wide ? 39 : 33} />
          <span className="nm">{b.name}</span>
          {wide && !b.earned && b.progress && <span className="pg muted">{b.progress}</span>}
        </li>
      ))}
    </ul>
  );
}

function NoteW({ text, isOwner }: { text: string; isOwner: boolean }) {
  if (!text.trim()) return <p className="muted">{isOwner ? "在「编辑」里写点什么。" : "（空白便签）"}</p>;
  return <div className="pw-note">{text}</div>;
}
