"use client";
import { useEffect, useMemo, useState } from "react";
import { HISTORY_DAYS, useApp } from "@/lib/store";
import { byDay, dailyBySubject, dayShares, hourProfile, streaks, subjectTotals, summarize, touching, withLive, yearGrid } from "@/lib/stats";
import { addDaysKey, dayKey, dur, durShort, hhmm, hrs, lastDays, MIN, weekdayCn, weekdayOfKey } from "@/lib/time";
import { DailyBars, foldSlices, HBars, Heatmap, HourChart, PixelDonut } from "@/components/Charts";
import { Avatar, seriesVar } from "@/components/bits";
import { ShareYearButton } from "@/components/ShareCard";
import { DayPeek } from "@/components/DayShare";
import { ProfileLink } from "@/components/profile/ProfileLink";
import { ReviewTrend } from "@/components/Wrap";
import type { Session, UserId } from "@/lib/types";

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
  /** 记录明细 filter: "all", "none" (no subject) or a subject id */
  const [subjF, setSubjF] = useState("all");
  useEffect(() => { setSubjF("all"); }, [who]);
  const [picked, setPicked] = useState<string | null>(null); // R-021: a day clicked in the bars or the heat map
  const p = app.profiles[who] || app.myProfile!;
  const tz = p.tz;
  const now = app.now;
  const minute = Math.floor(now / 60000);
  const isMe = who === app.me!.id;

  // the first screen only loads recent records: fetch the year (heat map, streaks, previous period) for the person shown,
  // and the selected range for everyone in the comparison
  const { ensureHistory, peopleIds } = app;
  const othersKey = peopleIds.filter((id) => id !== who).join(",");
  useEffect(() => { ensureHistory([who], HISTORY_DAYS); }, [ensureHistory, who]);
  useEffect(() => { if (othersKey) ensureHistory(othersKey.split(","), range); }, [ensureHistory, othersKey, range]);
  // no "vs previous period" while that period is still loading
  const delta = (a: number, b: number) => (app.historyLoading ? null : pctDelta(a, b));

  const all = useMemo(() => withLive(app.sessions, p.id, app.live[p.id], tz, now), [app.sessions, p.id, app.live, tz, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const subjects = app.subjects.filter((s) => s.userId === p.id);
  const goal = p.dailyGoalMin * MIN;
  const keys = useMemo(() => lastDays(range, tz, now), [range, tz, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevKeys = useMemo(() => keys.map((k) => addDaysKey(k, -range)), [keys, range]);
  const keySet = useMemo(() => new Set(keys), [keys]);
  const inRange = useMemo(() => touching(all, tz, keySet), [all, keySet, tz]);
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
    inRange.forEach((s) => dayShares(s, tz).forEach(([k, v]) => { if (keySet.has(k)) wdTot[weekdayOfKey(k)] += v; }));
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
    const ms = Array.from(byDay(withLive(app.sessions, id, app.live[id], pp.tz, now), pp.tz)).filter(([k]) => ks.has(k)).reduce((a, [, v]) => a + v, 0);
    return { key: id, label: <><span className="dot" style={{ background: seriesVar(pp.color) }} />{pp.name}</>, ms, color: seriesVar(pp.color) };
  }).filter(Boolean).sort((a, b) => b!.ms - a!.ms) as { key: string; label: React.ReactNode; ms: number; color: string }[], [app.peopleIds, app.profiles, app.sessions, app.live, range, minute]); // eslint-disable-line react-hooks/exhaustive-deps

  const recorded = inRange.filter((s) => s.id !== "live");
  // subjects that appear in this window, most used first, for the filter chips
  const subjChips = (() => {
    const ms = new Map<string, number>();
    recorded.forEach((s) => { const k = s.subjectId || "none"; ms.set(k, (ms.get(k) || 0) + s.durationMs); });
    return Array.from(ms).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  })();
  const historyAll = subjF === "all" ? recorded : recorded.filter((s) => (s.subjectId || "none") === subjF);
  const history = historyAll.slice(0, more ? 200 : 15);

  return (
    <div className="page" aria-busy={app.historyLoading || undefined}>
      <div className="pagehead">
        <div><h1>数据</h1><p className="sub">按{isMe ? "你" : p.name}的当地日期统计 · {tz}{app.historyLoading && <span className="r013-loading" role="status"> · 正在加载更早的记录…</span>}</p></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <ProfileLink id={who} className="btn sm stats-plink">{isMe ? "我的主页" : `${p.name}的主页`}</ProfileLink>
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
        <div className="tile"><div className="k">总专注</div><div className="v">{hrs(cur.totalMs)}<small style={{ fontSize: 14 }}>h</small></div><Delta v={delta(cur.totalMs, prev.totalMs)} /></div>
        <div className="tile"><div className="k">日均</div><div className="v">{durShort(cur.avgDayMs)}</div><Delta v={delta(cur.avgDayMs, prev.avgDayMs)} /></div>
        <div className="tile"><div className="k">学习天数</div><div className="v">{cur.activeDays}<small style={{ fontSize: 14 }}>/{cur.days}</small></div><div className="d muted">达标 {cur.goalDays} 天</div></div>
        <div className="tile"><div className="k">专注次数</div><div className="v">{cur.sessions}</div><Delta v={delta(cur.sessions, prev.sessions)} /></div>
        <div className="tile"><div className="k">平均专注度</div><div className="v">{cur.avgRating ? cur.avgRating.toFixed(1) : "—"}<small style={{ fontSize: 14 }}>/5</small></div><div className="d muted">{prev.avgRating && !app.historyLoading ? `上期 ${prev.avgRating.toFixed(1)}` : "结束时自评"}</div></div>
        <div className="tile"><div className="k">连续学习</div><div className="v">{st.current}<small style={{ fontSize: 14 }}> 天</small></div><div className="d muted">最长 {st.best} 天</div></div>
      </div>

      <section className="card">
        <div className="cardhead"><h2>每日专注{range > 90 ? "（近 90 天）" : ""}</h2>
          <div className="legend">{subjects.filter((s) => rows.some((r) => r.parts.has(s.id))).map((s) => <span key={s.id}><i style={{ background: seriesVar(s.color) }} />{s.name}</span>)}{rows.some((r) => r.parts.has(null)) && <span><i style={{ background: "var(--ink-3)" }} />未分类</span>}</div>
        </div>
        <div className="cardbody"><DailyBars rows={rows} subjects={subjects} goalMs={goal} height={220} todayKey={dayKey(now, tz)} onPickDay={setPicked} /></div>
      </section>

      <section className="card">
        <div className="cardhead"><h2>一年</h2><span className="hint">{Array.from(daily.keys()).filter((k) => k >= grid[0][0].key).length} 天有记录</span>{isMe && !app.historyLoading && <ShareYearButton />}</div>
        <div className="cardbody"><Heatmap cols={grid} onPickDay={setPicked} /></div>
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

      <section className="card">
        <div className="cardhead"><h2>精力和收获{range > 90 ? "（近 90 天）" : ""}</h2><span className="hint">收工时打的分 · 每格一档</span></div>
        <div className="cardbody"><ReviewTrend userId={p.id} keys={range > 90 ? lastDays(90, tz, now) : keys} daily={daily} isMe={isMe} name={p.name} /></div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="cardhead"><h2>科目分布</h2></div>
          <div className="cardbody">
            {subj.length ? <PixelDonut items={foldSlices(subj.map((x) => ({ key: String(x.id), name: x.subject?.name || "未分类", label: x.subject?.name || "未分类", ms: x.ms, color: x.subject ? seriesVar(x.subject.color) : "var(--ink-3)" })))} /> : <p className="muted">暂无数据</p>}
          </div>
        </section>
        <section className="card">
          <div className="cardhead"><h2>同窗对比</h2><span className="hint">近 {range === 365 ? "一年" : range + " 天"}</span></div>
          <div className="cardbody">{compare.length > 1 ? <HBars items={compare} /> : <p className="muted">加入自习室后可以和同窗对比。</p>}</div>
        </section>
      </div>

      <section className="card">
        <div className="cardhead" style={{ paddingBottom: 8 }}><h2>记录明细</h2><span className="hint">{isMe ? "点“修改”可以换科目，或把时长改短" : `共 ${historyAll.length} 条`}</span></div>
        {subjChips.length > 1 && (
          <div className="rec-filter" role="group" aria-label="按科目筛选">
            {["all", ...subjChips].map((k) => {
              const sub = subjects.find((x) => x.id === k);
              return (
                <button key={k} className={`chip${subjF === k ? " on" : ""}`} aria-pressed={subjF === k} onClick={() => { setSubjF(k); setMore(false); }}>
                  {sub && <span className="dot" style={{ background: seriesVar(sub.color) }} />}
                  {k === "all" ? "全部" : k === "none" ? "未分类" : sub?.name || "已删除的科目"}
                </button>
              );
            })}
          </div>
        )}
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
                    {isMe && <td style={{ textAlign: "right", paddingRight: 12 }}><EditRecord s={s} /></td>}
                  </tr>
                );
              })}
              {!history.length && <tr><td colSpan={6} className="empty">{subjF === "all" ? "这段时间没有记录" : "这个科目这段时间没有记录"}</td></tr>}
            </tbody>
          </table>
        </div>
        {historyAll.length > history.length && <div style={{ padding: "8px 20px 16px" }}><button className="btn sm ghost" onClick={() => setMore(true)}>显示更多（共 {historyAll.length} 条）</button></div>}
      </section>
      {!isMe && <p className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar p={p} size={20} showSky={false} />正在查看 {p.name} 的数据。</p>}
      {picked && <DayPeek userId={p.id} day={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

/** change a saved record's subject, or shorten it (e.g. the timer kept running after you left); it can never be made longer */
function EditRecord({ s }: { s: Session }) {
  const app = useApp();
  const max = Math.floor(s.durationMs / 60_000);
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(max);
  const [subj, setSubj] = useState(s.subjectId || "");
  const [busy, setBusy] = useState(false);
  const mine = app.subjects.filter((x) => x.userId === app.me?.id && (!x.archived || x.id === s.subjectId));
  if (!open) return <button className="btn sm ghost" onClick={() => { setMin(max); setSubj(s.subjectId || ""); setOpen(true); }} aria-label="修改这条记录">修改</button>;
  const valid = min >= 1 && min <= max;
  const changed = min !== max || subj !== (s.subjectId || "");
  async function save() {
    setBusy(true);
    try {
      const patch: Parameters<typeof app.updateSession>[1] = {};
      if (min !== max) patch.durationMs = min * 60_000;
      if (subj !== (s.subjectId || "")) patch.subjectId = subj || null;
      await app.updateSession(s.id, patch);
      setOpen(false);
      app.pushToast({ title: "已保存" });
    } catch (e) { app.pushToast({ title: "没改成", body: (e as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}
      onKeyDown={(e) => { if (e.key === "Enter" && valid && changed) save(); if (e.key === "Escape") setOpen(false); }}>
      <select className="input" value={subj} onChange={(e) => setSubj(e.target.value)} aria-label="科目" style={{ height: 28, maxWidth: 130 }} autoFocus>
        <option value="">未分类</option>
        {mine.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <input className="input num" type="number" min={1} max={max} value={min} aria-label={`时长（分钟，最多 ${max}）`}
        style={{ width: 64, height: 28 }} onChange={(e) => setMin(Math.floor(+e.target.value || 0))} />
      <span className="muted">分</span>
      <button className="btn sm primary" disabled={!valid || busy || !changed} onClick={save}>保存</button>
      <button className="btn sm ghost" onClick={() => setOpen(false)}>取消</button>
    </span>
  );
}
