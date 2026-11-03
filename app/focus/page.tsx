"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { useAuthGate } from "@/components/Shell";
import { Spinner, seriesVar } from "@/components/bits";
import { DeskScene } from "@/components/Pixel";
import { StartPanel } from "@/components/StartPanel";
import { IBack, IExpand, IPause, IPlay, IStop } from "@/components/Icons";
import { Ambient, ambientLabel, setAmbient } from "@/lib/sound";
import { liveFocusMs } from "@/lib/stats";
import { clock, dayKey, dur, hhmm, partsIn, phaseAt, tzCity } from "@/lib/time";
import type { FocusMode } from "@/lib/types";

export default function FocusPage() {
  return <Suspense fallback={null}><Focus /></Suspense>;
}

function Stars() {
  const dots = useMemo(() => {
    let s = 7;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    return Array.from({ length: 90 }, () => ({ x: r() * 100, y: r() * 70, o: 0.2 + r() * 0.7, s: r() < 0.1 ? 1.6 : 0.9 }));
  }, []);
  return (
    <svg className="stars" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.s * 0.12} fill="#fff" opacity={d.o} />)}
    </svg>
  );
}

function Focus() {
  const app = useApp();
  const focus = useFocus();
  const ready = useAuthGate();
  const router = useRouter();
  const q = useSearchParams();
  const [ambient, setAmb] = useState<Ambient>("off");

  useEffect(() => () => setAmbient("off"), []);
  // keep the screen awake while a timer runs
  useEffect(() => {
    if (!focus.state?.runningSince || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [focus.state?.runningSince]);

  if (!ready || !app.myProfile) return <div className="focus-root night"><Spinner /></div>;
  const prof = app.myProfile;
  const now = app.now;
  const h = partsIn(now, prof.tz).h;
  const phase = phaseAt(h);
  const s = focus.state;
  const invite = q.get("with") ? { mode: (q.get("mode") as FocusMode) || "pomodoro", minutes: Number(q.get("min")) || prof.pomodoroMin, task: q.get("task") || "", withUser: q.get("with") } : undefined;
  const inviter = invite?.withUser ? app.profiles[invite.withUser] : null;

  const others = app.peopleIds.filter((id) => id !== app.me?.id && (app.live[id]?.state === "focus" || app.live[id]?.state === "break"));
  const todayMs = app.sessions.filter((x) => x.userId === app.me?.id && dayKey(x.startedAt, prof.tz) === dayKey(now, prof.tz)).reduce((a, x) => a + x.durationMs, 0);

  const planned = s?.plannedMs || 0;
  const el = focus.elapsed;
  const shown = s ? (planned ? Math.max(0, planned - el) : el) : 0;
  const progress = s ? (planned ? Math.min(1, el / planned) : (el % 3600000) / 3600000) : 0;
  const subj = s?.subjectId ? app.subjects.find((x) => x.id === s.subjectId) : null;

  function pickAmbient(a: Ambient) { setAmb(a); setAmbient(a, 0.45); }
  function fullscreen() { document.documentElement.requestFullscreen?.().catch(() => {}); }

  const me = app.me!.id;
  return (
    <div className={`focus-root ${phase}`}>
      {phase === "night" && <Stars />}
      <div className="focus-top">
        <Link href="/"><IBack /> 返回</Link>
        <div className="ambient" role="group" aria-label="环境声">
          {(["off", "rain", "brown", "waves"] as Ambient[]).map((a) => <button key={a} aria-pressed={ambient === a} onClick={() => pickAmbient(a)}>{ambientLabel[a]}</button>)}
        </div>
        <button className="f" onClick={fullscreen} aria-label="全屏"><IExpand /></button>
      </div>

      <div className="focus-center">
        {!s ? (
          <>
            <div className="focus-task">{inviter ? `和 ${inviter.name} 一起专注` : `${tzCity(prof.tz)} ${hhmm(now, prof.tz)}`}<small>今天已专注 {dur(todayMs)}</small></div>
            <div className="card" style={{ width: "min(580px, 100%)" }}><StartPanel dark initial={invite} /></div>
          </>
        ) : (
          <>
            <div className="focus-stage">
              <DeskScene p={prof} live={app.live[me]} present rain={ambient === "rain"} maxScale={5} />
              <div className="card timerplate">
                <div>
                  <div className="phase">
                    {s.phase === "breakDone" ? "休息结束" : s.phase === "break" ? "休息" : s.runningSince ? (s.mode === "pomodoro" ? `番茄 · 第 ${s.pomosDone + 1} 个` : "正计时") : "已暂停"}
                    {planned && s.phase !== "breakDone" ? ` · ${Math.round(planned / 60000)} 分钟` : ""}
                  </div>
                  <div className="clock num" aria-live="off">{s.phase === "breakDone" ? "00:00" : clock(shown)}</div>
                </div>
                <div className="progressbar" style={{ flex: "1 1 160px", minWidth: 120 }}><div style={{ width: `${(s.phase === "breakDone" ? 1 : progress) * 100}%`, transition: "width 1s steps(1)" }} /></div>
              </div>
            </div>
            <div className="focus-task">
              {s.phase === "breakDone" ? "休息好了吗？" : s.phase === "break" ? "站起来走走，喝口水" : s.task || "专注"}
              <small>
                {s.phase === "break" || s.phase === "breakDone" ? `已完成 ${s.pomosDone} 个番茄 · 今天共 ${dur(todayMs)}` : subj ? <><span className="dot" style={{ background: seriesVar(subj.color), marginRight: 6 }} />{subj.name}</> : "未分类"}
              </small>
            </div>
            <div className="fbtns">
              {s.phase === "breakDone" ? (
                <>
                  <button className="fbtn main" onClick={() => focus.nextPomodoro()}><IPlay /> 下一个番茄</button>
                  <button className="fbtn" onClick={() => { focus.discard(); router.push("/"); }}>今天先到这</button>
                </>
              ) : s.phase === "break" ? (
                <>
                  <button className="fbtn main" onClick={() => focus.nextPomodoro()}><IPlay /> 跳过休息</button>
                  <button className="fbtn" onClick={() => { focus.discard(); router.push("/"); }}><IStop /> 结束</button>
                </>
              ) : (
                <>
                  {s.runningSince
                    ? <button className="fbtn" onClick={() => focus.pause()}><IPause /> 暂停</button>
                    : <button className="fbtn main" onClick={() => focus.resume()}><IPlay /> 继续</button>}
                  <button className="fbtn" onClick={() => focus.finish()}><IStop /> 结束并记录</button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {others.length > 0 && <div className="cofocus-lbl">此刻也在书桌前</div>}
      {others.length > 0 && (
        <div className="cofocus" aria-label="同时在专注的同窗">
          {others.map((id) => {
            const p = app.profiles[id]; const l = app.live[id];
            if (!p) return null;
            const left = l.plannedEnd ? l.plannedEnd - now : null;
            return (
              <div className="cof" key={id}>
                <DeskScene p={p} live={l} present={app.online.has(id)} maxScale={2} />
                <div className="cap"><span>{p.name}</span><span className="t">{l.state === "break" ? "休息" : left != null && left > 0 ? clock(left) : clock(liveFocusMs(l, now))}</span></div>
                <small>{tzCity(p.tz)} {hhmm(now, p.tz)} · {l.state === "break" ? "休息中" : l.task || l.subjectName || "专注中"}</small>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
