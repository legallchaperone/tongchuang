"use client";
/** R-007 收工: look back at today, rate it, leave a note for tomorrow, then turn off the lamp */
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { useAuthGate } from "@/components/Shell";
import { Spinner, seriesVar } from "@/components/bits";
import { DeskScene } from "@/components/Pixel";
import { foldSlices, PixelDonut } from "@/components/Charts";
import { IBack } from "@/components/Icons";
import { EnergyFace, MoonIcon } from "@/components/Wrap";
import { ShareDayButton } from "@/components/DayShare";
import { msOnDay } from "@/lib/stats";
import { dayLabel, ENERGY, IMPACT, workDay, workDaySessions } from "@/lib/review";
import { dayKey, dur, MIN, partsIn, weekdayCn } from "@/lib/time";
import type { LiveStatus } from "@/lib/types";

type Stage = "edit" | "dimming" | "done";

export default function WrapPage() {
  const app = useApp();
  const focus = useFocus();
  const ready = useAuthGate();
  const [energy, setEnergy] = useState<number | null>(null);
  const [impact, setImpact] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<Stage>("edit");
  const [lampOff, setLampOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [init, setInit] = useState(false);

  const meId = app.me?.id || "";
  const prof = app.myProfile;
  const tz = prof?.tz || "UTC";
  const now = app.now;
  const wd = workDay(now, tz);
  const existing = app.reviews.find((r) => r.userId === meId && r.day === wd) || null;

  // prefill when coming back to edit
  useEffect(() => {
    if (init || !existing) return;
    setEnergy(existing.energy); setImpact(existing.impact); setNote(existing.note);
    setInit(true);
  }, [existing, init]);

  const sessions = useMemo(() => (prof ? workDaySessions(app.sessions, meId, app.live[meId], tz, now) : []), [app.sessions, meId, app.live, tz, prof, Math.floor(now / 60000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = dayKey(now, tz);
  const shareOf = useMemo(() => (s: (typeof sessions)[number]) => msOnDay([s], tz, wd) + (wd !== today ? msOnDay([s], tz, today) : 0), [tz, wd, today]);
  const total = sessions.reduce((a, s) => a + shareOf(s), 0);
  const real = sessions.filter((s) => s.id !== "live");
  const longest = real.reduce<(typeof real)[number] | null>((a, s) => (!a || s.durationMs > a.durationMs ? s : a), null);
  const mySubjects = app.subjects.filter((s) => s.userId === meId);
  const slices = useMemo(() => {
    const m = new Map<string | null, number>();
    sessions.forEach((s) => m.set(s.subjectId, (m.get(s.subjectId) || 0) + shareOf(s)));
    return foldSlices(Array.from(m).map(([id, ms]) => {
      const sub = mySubjects.find((x) => x.id === id);
      return { key: String(id), name: sub?.name || "未分类", label: sub?.name || "未分类", ms, color: sub ? seriesVar(sub.color) : "var(--ink-3)" };
    }));
  }, [sessions, mySubjects, shareOf]);

  if (!ready || !prof) return <div className="wrap-root"><Spinner /></div>;

  const goal = prof.dailyGoalMin * MIN;
  const pct = Math.round((total / goal) * 100);
  const p = partsIn(now, tz);
  const [, mo, d] = wd.split("-").map(Number);
  const wdIdx = new Date(wd + "T12:00:00Z").getUTCDay();
  const focusing = !!focus.state && focus.state.phase === "focus";
  const lastTask = real[0]?.task || "";
  const pomos = real.filter((s) => s.mode === "pomodoro").length;

  // the desk on stage: seated under the lamp while reviewing, lights out once done
  const sceneLive: LiveStatus = {
    userId: meId, state: lampOff ? "idle" : "paused", task: "", subjectName: "", subjectColor: null, mode: "stopwatch",
    startedAt: null, plannedEnd: null, accumulatedMs: 0, runningSince: null, updatedAt: now,
  };

  async function submit() {
    setSaving(true);
    try {
      await app.saveReview({ day: wd, energy, impact, note: note.trim(), totalMs: Math.round(total), tz });
      setStage("dimming");
      // the lamp flickers, then goes out
      const steps = [true, false, true, false, true];
      steps.forEach((off, i) => setTimeout(() => setLampOff(off), 160 + i * 150));
      setTimeout(() => setStage("done"), 1100);
    } catch (e) {
      app.pushToast({ title: "没能收工", body: (e as Error).message });
    } finally { setSaving(false); }
  }

  return (
    <div className={`wrap-root ${stage !== "edit" ? "out" : ""}`}>
      <div className="wrap-top">
        <Link href="/" className="wrap-back"><IBack /> 回到书房</Link>
        <span className="wrap-clock num">{String(p.h).padStart(2, "0")}:{String(p.mi).padStart(2, "0")}</span>
      </div>

      <div className="wrap-col">
        <header className="wrap-head">
          <span className="wrap-k"><MoonIcon size={14} /> 收工 · {mo}月{d}日 星期{weekdayCn[wdIdx]}{wd !== today ? "（昨晚）" : ""}</span>
          <h1>{stage === "done" ? "辛苦了，明天见" : total > 0 ? "今天到这里吧" : "今天还没有专注记录"}</h1>
        </header>

        <div className="wrap-stage">
          <DeskScene p={prof} live={sceneLive} present closed={lampOff} maxScale={5} />
        </div>

        {stage === "done" ? (
          <section className="card wrap-done">
            <p>灯关了。同窗会看到你收工了，书桌会一直暗着，直到明天或者你再开始专注。</p>
            {note.trim() && <p className="wrap-tomorrow"><span className="muted">明天先：</span>{note.trim()}</p>}
            <div className="wrap-actions">
              <ShareDayButton day={wd} label={wd === today ? "分享今天" : "分享这一天"} className="btn" />
              <Link className="btn" href="/stats">看看数据</Link>
              <Link className="btn primary lg" href="/">回到书房</Link>
            </div>
          </section>
        ) : (
          <>
            <section className="card wrap-sum">
              <div className="wrap-total">
                <div>
                  <div className="muted">{wd === today ? "今天" : "这一天"}专注</div>
                  <div className="wrap-big num">{dur(total)}</div>
                </div>
                <div className="wrap-goal">
                  <div className="wrap-goalline"><span className="muted">目标 {dur(goal)}</span><span className="num" style={{ color: pct >= 100 ? "var(--good)" : "var(--ink-2)" }}>{pct}%{pct >= 100 ? " · 达成" : ""}</span></div>
                  <div className="progressbar"><div style={{ width: `${Math.min(100, pct)}%` }} /></div>
                </div>
              </div>
              <div className="kpis wrap-kpis">
                <div><b>{real.length}</b><span>次专注{pomos ? ` · ${pomos} 个番茄` : ""}</span></div>
                <div><b>{longest ? dur(longest.durationMs) : "—"}</b><span title={longest?.task}>最长一次{longest?.task ? ` · ${longest.task}` : ""}</span></div>
              </div>
              {slices.length > 0 && <div className="wrap-donut"><PixelDonut items={slices} size={148} /></div>}
            </section>

            <section className="card wrap-form">
              {focusing && (
                <p className="wrap-warn">还在专注中。<Link href="/focus">先结束这一段</Link>，再来收工。</p>
              )}
              <div className="field">
                <span className="label" id="w-energy">现在的精力</span>
                <div className="wrap-energy" role="group" aria-labelledby="w-energy">
                  {ENERGY.map((e) => (
                    <button key={e.v} aria-pressed={energy === e.v} onClick={() => setEnergy(energy === e.v ? null : e.v)}>
                      <EnergyFace v={e.v} />{e.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="label" id="w-impact">今天的收获</span>
                <div className="rating" role="group" aria-labelledby="w-impact">
                  {IMPACT.map((x, i) => (
                    <button key={x.v} aria-pressed={impact === x.v} onClick={() => setImpact(impact === x.v ? null : x.v)}>
                      <span className="bars">{[0, 1, 2, 3].map((j) => <i key={j} className={j <= i ? "on" : ""} style={{ height: 4 + j * 4 }} />)}</span>
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="w-note">明天先做什么（同窗能看到）</label>
                <input id="w-note" className="input wrap-note" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={lastTask ? `比如：继续${lastTask}` : "比如：把第 4 章习题做完"}
                  onKeyDown={(e) => { if (e.key === "Enter" && !focusing && !saving) submit(); }} />
                <span className="muted" style={{ marginTop: 4 }}>明天打开同窗时，会在最上面看到这句话。</span>
              </div>
              <div className="wrap-actions">
                {existing && <span className="muted">{dayLabel(existing.day, wd)}已经收过工，可以改一改</span>}
                <button className="btn lamp lg wrap-go" disabled={focusing || saving || stage !== "edit"} onClick={submit}>
                  <MoonIcon />{saving ? "收工中…" : existing ? "更新，熄灯" : "收工，熄灯"}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
