"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { livePrefix, STAR_MS } from "@/lib/focusModes";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { useAuthGate } from "@/components/Shell";
import { Spinner, seriesVar } from "@/components/bits";
import { DeskScene, PxIcon } from "@/components/Pixel";
import { StartPanel } from "@/components/StartPanel";
import { IBack, IExpand, IPause, IPlay, IStop } from "@/components/Icons";
import { SoundMixer } from "@/components/SoundMixer";
import { liveFocusMs, todayMs as todayFocusMs } from "@/lib/stats";
import { clock, dayKey, dur, hhmm, partsIn, phaseAt, tzCity } from "@/lib/time";
import type { FocusMode } from "@/lib/types";

/** R-003: −1 / clock (tap to type a new length) / +1 */
function TimerClock({ text, minutes, onAdjust, onSet }: { text: string; minutes: number; onAdjust: (d: number) => void; onSet: (m: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  const commit = () => {
    const n = Math.round(Number(val));
    if (val.trim() && Number.isFinite(n) && n >= 1) onSet(Math.min(300, n));
    setEditing(false);
  };
  return (
    <div className="tclock">
      <button className="adj" onClick={() => onAdjust(-1)} disabled={minutes <= 1} aria-label="少 1 分钟" title="少 1 分钟">−1</button>
      {editing ? (
        <span className="clock-edit">
          <input ref={ref} className="num" inputMode="numeric" aria-label="新的时长（分钟）" value={val} maxLength={3}
            onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ""))} onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} />
          <small>分钟</small>
        </span>
      ) : (
        <button className="clock num" aria-live="off" title="点击修改时长" aria-label={`剩余 ${text}，点击修改时长`} onClick={() => { setVal(String(minutes)); setEditing(true); }}>{text}</button>
      )}
      <button className="adj" onClick={() => onAdjust(1)} disabled={minutes >= 300} aria-label="多 1 分钟" title="多 1 分钟">+1</button>
    </div>
  );
}

/** flow mode: a lit star for every 25 minutes, and the next one filling up */
function FlowStars({ ms }: { ms: number }) {
  const n = Math.floor(ms / STAR_MS);
  const part = (ms % STAR_MS) / STAR_MS;
  const shown = Math.min(n, 8);
  return (
    <div className="flowstars" aria-label={`已点亮 ${n} 颗星星`}>
      <div className="row">
        {Array.from({ length: shown }, (_, i) => <span key={i} className="st on"><PxIcon name="star" size={18} /></span>)}
        {n > shown && <span className="more num">×{n}</span>}
        <span className="st next"><PxIcon name="star" size={18} /><span className="fill" style={{ height: `${Math.round(part * 100)}%` }}><PxIcon name="star" size={18} /></span></span>
      </div>
      <small>{n === 0 ? "满 25 分钟亮第一颗星" : `下一颗星还有 ${Math.max(1, Math.ceil((STAR_MS - (ms % STAR_MS)) / 60000))} 分钟`}</small>
    </div>
  );
}

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
  const [rain, setRain] = useState(false);

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
  const todayMs = todayFocusMs(app.sessions, app.me!.id, undefined, prof.tz, now);

  const planned = s?.plannedMs || 0;
  const el = focus.elapsed;
  const inFocus = s?.phase === "focus";
  const flow = inFocus && s?.mode === "stopwatch";
  const over = !!(inFocus && planned && el >= planned);
  const shown = s ? (planned ? Math.max(0, planned - el) : el) : 0;
  const progress = s ? (planned ? Math.min(1, el / planned) : (el % 3600000) / 3600000) : 0;
  // R-003: ±1 and tap-to-edit only while a pomodoro / countdown focus block runs
  const editable = !!(inFocus && planned && !over && s?.mode !== "stopwatch");
  const clockText = !s ? "" : s.phase === "breakDone" ? "00:00" : over ? "+" + clock(el - planned) : clock(shown);
  const phaseLabel = !s ? "" : s.phase === "breakDone" ? "休息结束"
    : s.phase === "break" ? `休息 · ${Math.round(planned / 60000)} 分钟`
    : (!s.runningSince ? "已暂停 · " : "") + (s.mode === "pomodoro" ? `番茄 · 第 ${s.pomosDone + 1} 个` : s.mode === "countdown" ? "倒计时" : "心流 · 已专注")
    + (s.mode === "stopwatch" ? "" : over ? " · 加时" : ` · ${Math.round(planned / 60000)} 分钟`);
  const subj = s?.subjectId ? app.subjects.find((x) => x.id === s.subjectId) : null;

  function fullscreen() { document.documentElement.requestFullscreen?.().catch(() => {}); }

  const me = app.me!.id;
  return (
    <div className={`focus-root ${phase}`}>
      {phase === "night" && <Stars />}
      <div className="focus-top">
        <Link href="/"><IBack /> 返回</Link>
        <SoundMixer onChange={(m) => setRain(!m.muted && (m.levels.rain || 0) > 0)} />
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
              <DeskScene p={prof} live={app.live[me]} present rain={rain} maxScale={5} />
              <div className="card timerplate">
                <div>
                  <div className="phase">{phaseLabel}</div>
                  {editable ? (
                    <TimerClock text={clockText} minutes={Math.round(planned / 60000)} onAdjust={(d) => focus.adjust(d)} onSet={(m) => focus.setMinutes(m)} />
                  ) : (
                    <div className={`clock num${over ? " over" : ""}`} aria-live="off">{clockText}</div>
                  )}
                </div>
                {flow
                  ? <FlowStars ms={el} />
                  : <div className="progressbar" style={{ flex: "1 1 160px", minWidth: 120 }}><div style={{ width: `${(s.phase === "breakDone" ? 1 : progress) * 100}%`, transition: "width 1s steps(1)" }} /></div>}
              </div>
            </div>
            {over && <div className="overtime-note" role="status">时间到了，准备好再休息</div>}
            <div className="focus-task">
              {s.phase === "breakDone" ? "休息好了吗？" : s.phase === "break" ? "站起来走走，喝口水" : s.task || "专注"}
              <small>
                {s.phase === "break" || s.phase === "breakDone" ? (s.mode === "pomodoro" ? `已完成 ${s.pomosDone} 个番茄 · 今天共 ${dur(todayMs)}` : `今天共 ${dur(todayMs)}`) : subj ? <><span className="dot" style={{ background: seriesVar(subj.color), marginRight: 6 }} />{subj.name}</> : "未分类"}
              </small>
            </div>
            <div className="fbtns">
              {s.phase === "breakDone" ? (
                <>
                  <button className="fbtn main" onClick={() => focus.nextPomodoro()}><IPlay /> {s.mode === "pomodoro" ? "下一个番茄" : "再来一轮"}</button>
                  <button className="fbtn" onClick={() => focus.discard()}>换个任务</button>
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
                  <button className={`fbtn${over ? " main" : ""}`} onClick={() => focus.finish()}><IStop /> {over ? "结束，去休息" : "结束并记录"}</button>
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
                <div className="cap"><span>{p.name}</span><span className="t">{l.state === "break" ? "休息" : <><small>{livePrefix(l, now)}</small> {left != null && left > 0 ? clock(left) : clock(liveFocusMs(l, now))}</>}</span></div>
                <small>{tzCity(p.tz)} {hhmm(now, p.tz)} · {l.state === "break" ? "休息中" : `${l.task || l.subjectName || "专注中"}${l.mode === "stopwatch" ? " · 心流中" : ""}`}</small>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
