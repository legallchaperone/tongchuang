"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { byDay, dailyBySubject, streaks, weekRange, withLive } from "@/lib/stats";
import { dayKey, dur, hrs, MIN, partsIn, weekdayCn } from "@/lib/time";
import { Ring, seriesVar } from "@/components/bits";
import { StartPanel } from "@/components/StartPanel";
import { Feed } from "@/components/People";
import { StudyHall } from "@/components/Hall";
import { DailyBars, foldSlices, PixelDonut } from "@/components/Charts";
import { IPlay } from "@/components/Icons";
import { StatusButton } from "@/components/Status";
import { WrapButton, YesterdayNote } from "@/components/Wrap";
import { ShareDayButton } from "@/components/DayShare";
import { TodoCard } from "@/components/Todos";
import type { Todo } from "@/lib/types";

function greeting(h: number) {
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export default function TodayPage() {
  const app = useApp();
  const focus = useFocus();
  const prof = app.myProfile!;
  const tz = prof.tz;
  const meId = app.me!.id;
  const now = app.now;
  const mineAll = useMemo(() => withLive(app.sessions, meId, app.live[meId], tz, now, app.subjects), [app.sessions, meId, app.live, app.subjects, tz, now]);
  const daily = useMemo(() => byDay(mineAll, tz), [mineAll, tz]);
  const todayMs = daily.get(dayKey(now, tz)) || 0;
  const goal = prof.dailyGoalMin * MIN;
  const st = useMemo(() => streaks(daily, tz, now), [daily, tz, now]);
  const week = weekRange(tz, now);
  const weekMs = week.reduce((a, k) => a + (daily.get(k) || 0), 0);
  const lastWeekMs = weekRange(tz, now, 1).reduce((a, k) => a + (daily.get(k) || 0), 0);
  const wd = (partsIn(now, tz).wd + 6) % 7;
  const lastWeekSamePoint = weekRange(tz, now, 1).slice(0, wd + 1).reduce((a, k) => a + (daily.get(k) || 0), 0);
  const weekRows = useMemo(() => dailyBySubject(mineAll, tz, week), [mineAll, tz, week.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const mySubjects = app.subjects.filter((s) => s.userId === meId);
  const weekSlices = useMemo(() => {
    const m = new Map<string | null, number>();
    weekRows.forEach((r) => r.parts.forEach((v, k) => m.set(k, (m.get(k) || 0) + v)));
    return foldSlices(Array.from(m).map(([id, ms]) => {
      const sub = mySubjects.find((x) => x.id === id);
      return { key: String(id), name: sub?.name || "未分类", label: sub?.name || "未分类", ms, color: sub ? seriesVar(sub.color) : "var(--ink-3)" };
    }));
  }, [weekRows, mySubjects]);
  const p = partsIn(now, tz);
  const focusing = focus.state && focus.state.phase !== "breakDone";
  const others = app.peopleIds.filter((id) => id !== meId);
  const focusingNow = others.filter((id) => app.live[id]?.state === "focus");
  const remaining = Math.max(0, goal - todayMs);
  const [pick, setPick] = useState<{ todo: Todo; n: number } | null>(null);
  // a pick is used once: when the focus ends the start panel comes back empty
  useEffect(() => { if (focusing) setPick(null); }, [focusing]);

  return (
    <div className="page">
      <YesterdayNote />
      <div className="pagehead">
        <div>
          <h1>{greeting(p.h)}，{prof.name}</h1>
          <p className="sub">{p.mo}月{p.d}日 星期{weekdayCn[p.wd]} · {focusingNow.length ? `${focusingNow.map((id) => app.profiles[id]?.name).join("、")} 正在专注` : others.length ? "同窗们现在都不在书桌前" : "邀请朋友加入，一起学"}</p>
        </div>
        <StatusButton />
        <WrapButton />
      </div>

      <section>
        {app.peopleIds.length > 1 ? <StudyHall ids={app.peopleIds} /> : (
          <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
            <StudyHall ids={app.peopleIds} />
            <div className="card pad empty" style={{ alignSelf: "stretch", display: "grid", placeContent: "center" }}>
              <b>书房里还空着几张桌子</b>
              创建一个自习室，把邀请码发给朋友，他们的小人就会坐到这里。
              <div style={{ marginTop: 12 }}><Link className="btn primary" href="/rooms">去创建自习室</Link></div>
            </div>
          </div>
        )}
      </section>

      <div className="grid-2 today">
        <div className="stack">
          <section className="card hero" style={{ order: 1 }}>
            <ShareDayButton className="btn sm ghost share-btn day-share-hero" label="分享" />
            <Ring value={todayMs / goal} size={136}>
              <div>
                <div className="num big2">{Math.round((todayMs / goal) * 100)}%</div>
                <div className="muted">今日目标</div>
              </div>
            </Ring>
            <div style={{ minWidth: 0, width: "100%" }}>
              <div className="muted" style={{ marginBottom: 6 }}>今天已专注</div>
              <div className="big num">{dur(todayMs)}</div>
              <div className="goalline">{remaining > 0 ? `距离 ${dur(goal)} 的目标还差 ${dur(remaining)}` : "今天的目标已经完成 ✓"}</div>
              <div className="kpis">
                <div><b>{st.current} 天</b><span>连续学习</span></div>
                <div><b>{hrs(weekMs)}h</b><span>本周 {lastWeekSamePoint > 0 ? <span className={weekMs >= lastWeekSamePoint ? "up" : "down"}>{weekMs >= lastWeekSamePoint ? "↑" : "↓"}{Math.abs(Math.round((weekMs / lastWeekSamePoint - 1) * 100))}%</span> : null}</span></div>
                <div><b>{hrs(lastWeekMs)}h</b><span>上周合计</span></div>
              </div>
            </div>
          </section>

          <section className="card" style={{ order: 3 }}>
            {focusing ? (
              <div className="cardbody" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", paddingTop: 20 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="muted">{focus.state!.phase === "break" ? "休息中" : focus.state!.runningSince ? "正在专注" : "已暂停"}</div>
                  <div className="big2" style={{ overflowWrap: "anywhere" }}>{focus.state!.task || "专注"}</div>
                </div>
                <Link href="/focus" className="btn lamp lg"><IPlay /> 回到专注</Link>
              </div>
            ) : (
              <>
                <div className="cardhead"><h2>开始专注</h2></div>
                <div className="cardbody"><StartPanel pick={pick} /></div>
              </>
            )}
          </section>

          <TodoCard busy={!!focusing} onPick={(todo) => setPick((p) => ({ todo, n: (p?.n || 0) + 1 }))} />

          <section className="card" style={{ order: 4 }}>
            <div className="cardhead"><h2>本周</h2><Link className="hint" href="/stats">完整数据 →</Link></div>
            <div className="cardbody">
              <DailyBars rows={weekRows} subjects={mySubjects} goalMs={goal} height={180} todayKey={dayKey(now, tz)} />
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card" style={{ order: 5 }}>
            <div className="cardhead" style={{ paddingBottom: 10 }}><h2>动态</h2><span className="hint">给认真的人点个赞</span></div>
            <Feed userIds={app.peopleIds} limit={12} />
          </section>
          <section className="card" style={{ order: 6 }}>
            <div className="cardhead"><h2>本周科目</h2><Link className="hint" href="/stats">按科目看 →</Link></div>
            <div className="cardbody">
              {weekSlices.length
                ? <PixelDonut items={weekSlices} size={168} />
                : <p className="muted">本周还没有专注记录。开始专注时选一个科目，这里会按科目画出时间分布。</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
