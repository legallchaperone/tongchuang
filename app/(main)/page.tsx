"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { byDay, dailyBySubject, streaks, weekRange, withLive } from "@/lib/stats";
import { dayKey, dur, hrs, MIN, partsIn, weekdayCn } from "@/lib/time";
import { Ring } from "@/components/bits";
import { StartPanel } from "@/components/StartPanel";
import { Feed, PeopleList } from "@/components/People";
import { DailyBars } from "@/components/Charts";
import { IPlay } from "@/components/Icons";

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
  const mineAll = useMemo(() => withLive(app.sessions, meId, app.live[meId], tz, now), [app.sessions, meId, app.live, tz, now]);
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
  const p = partsIn(now, tz);
  const focusing = focus.state && focus.state.phase !== "breakDone";
  const others = app.peopleIds.filter((id) => id !== meId);
  const focusingNow = others.filter((id) => app.live[id]?.state === "focus");
  const remaining = Math.max(0, goal - todayMs);

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>{greeting(p.h)}，{prof.name}</h1>
          <p className="sub">{p.mo}月{p.d}日 星期{weekdayCn[p.wd]} · {focusingNow.length ? `${focusingNow.map((id) => app.profiles[id]?.name).join("、")} 正在专注` : others.length ? "同窗们现在都不在书桌前" : "邀请朋友加入，一起学"}</p>
        </div>
      </div>

      <div className="grid-2 today">
        <div className="stack">
          <section className="card hero" style={{ order: 1 }}>
            <Ring value={todayMs / goal} size={148} stroke={12}>
              <div>
                <div className="num" style={{ fontSize: 26, fontWeight: 500 }}>{Math.round((todayMs / goal) * 100)}%</div>
                <div className="muted" style={{ fontSize: 12 }}>今日目标</div>
              </div>
            </Ring>
            <div style={{ minWidth: 0, width: "100%" }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>今天已专注</div>
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
                  <div className="muted" style={{ fontSize: 12 }}>{focus.state!.phase === "break" ? "休息中" : focus.state!.runningSince ? "正在专注" : "已暂停"}</div>
                  <div style={{ fontSize: 17, fontWeight: 600, overflowWrap: "anywhere" }}>{focus.state!.task || "专注"}</div>
                </div>
                <Link href="/focus" className="btn lamp lg"><IPlay /> 回到专注</Link>
              </div>
            ) : (
              <>
                <div className="cardhead"><h2>开始专注</h2><span className="hint">回车直接开始 · 结束后写一句复盘</span></div>
                <div className="cardbody"><StartPanel /></div>
              </>
            )}
          </section>

          <section className="card" style={{ order: 4 }}>
            <div className="cardhead"><h2>本周</h2><Link className="hint" href="/stats">完整数据 →</Link></div>
            <div className="cardbody">
              <DailyBars rows={weekRows} subjects={mySubjects} goalMs={goal} height={180} todayKey={dayKey(now, tz)} />
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card" style={{ order: 2 }}>
            <div className="cardhead"><h2>同窗此刻</h2><span className="hint">{others.length ? `${others.filter((id) => app.online.has(id)).length} 人在线` : ""}</span></div>
            <div style={{ paddingTop: 8 }}><PeopleList ids={app.peopleIds} /></div>
          </section>
          <section className="card" style={{ order: 5 }}>
            <div className="cardhead" style={{ paddingBottom: 12 }}><h2>动态</h2><span className="hint">给认真的人点个赞</span></div>
            <Feed userIds={app.peopleIds} limit={12} />
          </section>
        </div>
      </div>
    </div>
  );
}
