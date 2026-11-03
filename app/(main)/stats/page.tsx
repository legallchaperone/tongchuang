"use client";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { byDay, dailyBySubject, hourProfile, streaks, subjectTotals, summarize, withLive, yearGrid } from "@/lib/stats";
import { addDaysKey, dayKey, dur, durShort, hhmm, hrs, lastDays, MIN, weekdayCn, weekdayOfKey } from "@/lib/time";
import { DailyBars, HBars, Heatmap, HourChart } from "@/components/Charts";
import { Avatar, seriesVar } from "@/components/bits";
import { ITrash } from "@/components/Icons";
import type { UserId } from "@/lib/types";

const RANGES = [7, 30, 90, 365] as const;

function pctDelta(a: number, b: number) {
  if (!b) return null;
  return Math.round((a / b - 1) * 100);
}
function Delta({ v, suffix = "较上期" }: { v: number | null; suffix?: string }) {
  if (v == null) return <div className="d muted">—</div>;
  return <div className={`d ${v >= 0 ? "up" : "down"}`}>{v >= 0 ? "↑" : "↓"} {Math.abs(v)}% <span className="muted">{suffix}</span></div>;
}

export default function StatsPage() {
  const app = useApp();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [who, setWho] = useState<UserId>(app.me!.id);
  const [more, setMore] = useState(false);
  const p = app.profiles[who] || app.myProfile!;
  const tz = p.tz;
  const now = app.now;
  const minute = Math.floor(now / 60000);
  const isMe = who === app.me!.id;

  const all = useMemo(() => withLive(app.sessions, p.id, app.live[p.id], tz, now), [app.sessions, p.id, app.live, tz, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const subjects = app.subjects.filter((s) => s.userId === p.id);
  const goal = p.dailyGoalMin * MIN;
  const keys = useMemo(() => lastDays(range, tz, now), [range, tz, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevKeys = useMemo(() => keys.map((k) => addDaysKey(k, -range)), [keys, range]);
  const keySet = useMemo(() => new Set(keys), [keys]);
  const inRange = useMemo(() => all.filter((s) => keySet.has(dayKey(s.startedAt, tz))), [all, keySet, tz]);
  const cur = summarize(all, tz, keys, goal);
  const prev = summarize(all, tz, prevKeys, goal);
  const daily = useMemo(() => byDay(all, tz), [all, tz]);
  const st = streaks(daily, tz, now);
  const rows = useMemo(() => dailyBySubject(all, tz, range > 90 ? lastDays(90, tz, now) : keys), [all, tz, keys, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const grid = useMemo(() => yearGrid(daily, tz, 53, now), [daily, tz, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const subj = useMemo(() => subjectTotals(inRange, subjects), [inRange, subjects]);
  const hours = useMemo(() => hourProfile(inRange, tz), [inRange, tz]);

  // insights
  const insights = useMemo(() => {
    const out: React.ReactNode[] = [];
    const best = [...hours].sort((a, b) => b.ms - a.ms);
    if (best[0]?.ms > 0) {
      const top = best.slice(0, 3).map((x) => x.h).sort((a, b) => a - b);
      out.push(<p key="h">最常学习的时段是 <b className="num">{top.map((h) => `${h}点`).join("、")}</b>（{p.name === "我" || isMe ? "你的" : p.name + "的"}当地时间）。</p>);
      const rated = hours.filter((x) => x.rating != null && x.ms > 20 * MIN * (range / 7));
      if (rated.length >= 3) {
        const r = [...rated].sort((a, b) => (b.rating! - a.rating!));
        out.push(<p key="r">自评专注度最高在 <b className="num">{r[0].h}:00</b> 前后（{r[0].rating!.toFixed(1)}/5），最低在 <b className="num">{r[r.length - 1].h}:00</b>（{r[r.length - 1].rating!.toFixed(1)}/5）。难的内容可以挪到前者。</p>);
      }
    }
    const wdTot = new Array(7).fill(0);
    inRange.forEach((s) => { wdTot[weekdayOfKey(dayKey(s.startedAt, tz))] += s.durationMs; });
    if (range >= 30 && cur.totalMs > 0) {
      const mx = wdTot.indexOf(Math.max(...wdTot)), mn = wdTot.indexOf(Math.min(...wdTot));
      out.push(<p key="w">周{weekdayCn[mx]}学得最多，周{weekdayCn[mn]}最少。</p>);
    }
    if (subj[0] && cur.totalMs > 0) out.push(<p key="s"><b>{subj[0].subject?.name || "未分类"}</b> 占了 {Math.round((subj[0].ms / cur.totalMs) * 100)}% 的时间。</p>);
    if (cur.days > 0) out.push(<p key="g">{range} 天里有 <b className="num">{cur.goalDays}</b> 天达成每日目标（{durShort(goal)}），最长一次连续专注 <b className="num">{dur(cur.longestMs)}</b>。</p>);
    return out;
  }, [hours, inRange, cur.totalMs, cur.goalDays, cur.longestMs, cur.days, subj, range, tz, goal, p.name, isMe]);

  // compare with classmates over the same window (each in own tz)
  const compare = useMemo(() => app.peopleIds.map((id) => {
    const pp = app.profiles[id]; if (!pp) return null;
    const ks = new Set(lastDays(range, pp.tz, now));
    const ms = withLive(app.sessions, id, app.live[id], pp.tz, now).filter((s) => ks.has(dayKey(s.startedAt, pp.tz))).reduce((a, s) => a + s.durationMs, 0);
    return { key: id, label: <><span className="dot" style={{ background: seriesVar(pp.color) }} />{pp.name}</>, ms, color: seriesVar(pp.color) };
  }).filter(Boolean).sort((a, b) => b!.ms - a!.ms) as { key: string; label: React.ReactNode; ms: number; color: string }[], [app.peopleIds, app.profiles, app.sessions, app.live, range, minute]); // eslint-disable-line react-hooks/exhaustive-deps

  const historyAll = inRange.filter((s) => s.id !== "live");
  const history = historyAll.slice(0, more ? 200 : 15);

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>数据</h1><p className="sub">按{isMe ? "你" : p.name}的当地日期统计 · {tz}</p></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {app.peopleIds.length > 1 && (
            <div className="seg" role="group" aria-label="查看谁的数据">
              {app.peopleIds.map((id) => <button key={id} aria-pressed={who === id} onClick={() => setWho(id)}>{id === app.me!.id ? "我" : app.profiles[id]?.name}</button>)}
            </div>
          )}
          <div className="seg" role="group" aria-label="时间范围">
            {RANGES.map((r) => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r === 365 ? "一年" : `${r} 天`}</button>)}
          </div>
        </div>
      </div>

      <div className="tiles">
        <div className="tile"><div className="k">总专注</div><div className="v">{hrs(cur.totalMs)}<small style={{ fontSize: 14 }}>h</small></div><Delta v={pctDelta(cur.totalMs, prev.totalMs)} /></div>
        <div className="tile"><div className="k">日均</div><div className="v">{durShort(cur.avgDayMs)}</div><Delta v={pctDelta(cur.avgDayMs, prev.avgDayMs)} /></div>
        <div className="tile"><div className="k">学习天数</div><div className="v">{cur.activeDays}<small style={{ fontSize: 14 }}>/{cur.days}</small></div><div className="d muted">达标 {cur.goalDays} 天</div></div>
        <div className="tile"><div className="k">专注次数</div><div className="v">{cur.sessions}</div><Delta v={pctDelta(cur.sessions, prev.sessions)} /></div>
        <div className="tile"><div className="k">平均专注度</div><div className="v">{cur.avgRating ? cur.avgRating.toFixed(1) : "—"}<small style={{ fontSize: 14 }}>/5</small></div><div className="d muted">{prev.avgRating ? `上期 ${prev.avgRating.toFixed(1)}` : "结束时自评"}</div></div>
        <div className="tile"><div className="k">连续学习</div><div className="v">{st.current}<small style={{ fontSize: 14 }}> 天</small></div><div className="d muted">最长 {st.best} 天</div></div>
      </div>

      <section className="card">
        <div className="cardhead"><h2>每日专注{range > 90 ? "（近 90 天）" : ""}</h2>
          <div className="legend">{subjects.filter((s) => rows.some((r) => r.parts.has(s.id))).map((s) => <span key={s.id}><i style={{ background: seriesVar(s.color) }} />{s.name}</span>)}{rows.some((r) => r.parts.has(null)) && <span><i style={{ background: "var(--ink-3)" }} />未分类</span>}</div>
        </div>
        <div className="cardbody"><DailyBars rows={rows} subjects={subjects} goalMs={goal} height={220} todayKey={dayKey(now, tz)} /></div>
      </section>

      <section className="card">
        <div className="cardhead"><h2>一年</h2><span className="hint">{Array.from(daily.keys()).filter((k) => k >= grid[0][0].key).length} 天有记录</span></div>
        <div className="cardbody"><Heatmap cols={grid} /></div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="cardhead"><h2>一天中的节奏</h2><span className="hint">每小时平均专注分钟 · 深色为最常学的 3 个小时</span></div>
          <div className="cardbody"><HourChart data={hours} color={seriesVar(p.color)} days={range} /></div>
        </section>
        <section className="card">
          <div className="cardhead"><h2>小结</h2></div>
          <div className="cardbody insight">{insights.length ? insights : <p>这段时间还没有记录。</p>}</div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="cardhead"><h2>科目分布</h2></div>
          <div className="cardbody">
            {subj.length ? <HBars items={subj.map((x) => ({ key: String(x.id), label: <><span className="dot" style={{ background: x.subject ? seriesVar(x.subject.color) : "var(--ink-3)" }} />{x.subject?.name || "未分类"}</>, ms: x.ms, color: x.subject ? seriesVar(x.subject.color) : "var(--ink-3)" }))} /> : <p className="muted">暂无数据</p>}
          </div>
        </section>
        <section className="card">
          <div className="cardhead"><h2>同窗对比</h2><span className="hint">近 {range === 365 ? "一年" : range + " 天"}</span></div>
          <div className="cardbody">{compare.length > 1 ? <HBars items={compare} /> : <p className="muted">加入自习室后可以和同窗对比。</p>}</div>
        </section>
      </div>

      <section className="card">
        <div className="cardhead" style={{ paddingBottom: 8 }}><h2>记录明细</h2><span className="hint">{isMe ? "记错了可以删除" : `共 ${historyAll.length} 条`}</span></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-3)", fontSize: 12 }}>
              <th style={{ padding: "8px 20px", fontWeight: 500 }}>日期</th><th style={{ fontWeight: 500 }}>时间</th><th style={{ fontWeight: 500 }}>内容</th><th style={{ fontWeight: 500, textAlign: "right" }}>时长</th><th style={{ fontWeight: 500, textAlign: "right", paddingRight: 20 }}>专注度</th>{isMe && <th />}
            </tr></thead>
            <tbody>
              {history.map((s) => {
                const sub = subjects.find((x) => x.id === s.subjectId);
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--slot)" }}>
                    <td style={{ padding: "9px 20px" }} className="num">{dayKey(s.startedAt, tz).slice(5).replace("-", "/")}</td>
                    <td className="num muted">{hhmm(s.startedAt, tz)}–{hhmm(s.endedAt, tz)}</td>
                    <td style={{ maxWidth: 320 }}>{sub && <span className="subj" style={{ marginRight: 6 }}><span className="dot" style={{ background: seriesVar(sub.color) }} />{sub.name}</span>}{s.task || "自习"}{s.note && <div className="muted" style={{ fontSize: 12 }}>{s.note}</div>}</td>
                    <td className="num" style={{ textAlign: "right" }}>{dur(s.durationMs)}</td>
                    <td className="num" style={{ textAlign: "right", paddingRight: 20 }}>{s.rating ?? "—"}</td>
                    {isMe && <td style={{ width: 44 }}><DeleteBtn id={s.id} /></td>}
                  </tr>
                );
              })}
              {!history.length && <tr><td colSpan={6} className="empty">这段时间没有记录</td></tr>}
            </tbody>
          </table>
        </div>
        {historyAll.length > history.length && <div style={{ padding: "8px 20px 16px" }}><button className="btn sm ghost" onClick={() => setMore(true)}>显示更多（共 {historyAll.length} 条）</button></div>}
      </section>
      {!isMe && <p className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar p={p} size={20} showSky={false} />正在查看 {p.name} 的数据。</p>}
    </div>
  );
}

function DeleteBtn({ id }: { id: string }) {
  const app = useApp();
  const [armed, setArmed] = useState(false);
  if (armed) return <button className="btn sm danger" onClick={() => app.deleteSession(id).catch((e) => app.pushToast({ title: "删除失败", body: e.message }))} onBlur={() => setArmed(false)} autoFocus>删除</button>;
  return <button className="iconbtn" aria-label="删除这条记录" onClick={() => setArmed(true)}><ITrash /></button>;
}
