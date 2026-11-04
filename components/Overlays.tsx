"use client";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useFocus, type NextStep } from "@/lib/focus";
import { prefsOf, suggestBreakMin } from "@/lib/focusModes";
import { usePathname, useRouter } from "next/navigation";
import { msOnDay } from "@/lib/stats";
import { dur, dayKey, MIN } from "@/lib/time";
import { IClose } from "./Icons";
import { seriesVar } from "./bits";

export function Toasts() {
  const { toasts, dismissToast, profiles } = useApp();
  void profiles;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast card" key={t.id}>
          <span className="dot" style={{ background: t.color != null ? seriesVar(t.color) : "var(--lamp)", marginTop: 7 }} />
          <div>
            <b>{t.title}</b>
            {t.body && <p>{t.body}</p>}
            {t.action && <Link className="btn sm primary" href={t.action.href} onClick={() => dismissToast(t.id)}>{t.action.label}</Link>}
          </div>
          <button className="iconbtn" onClick={() => dismissToast(t.id)} aria-label="关闭"><IClose /></button>
        </div>
      ))}
    </div>
  );
}

const LEVELS = ["很散", "一般", "还行", "专注", "心流"];

export function ReflectionSheet() {
  const app = useApp();
  const focus = useFocus();
  const p = focus.pending;
  const router = useRouter();
  const path = usePathname();
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [task, setTask] = useState("");
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState<NextStep | null>(null);
  const [mins, setMins] = useState(0);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (p) { setRating(null); setNote(""); setTask(p.task); setSubjectId(p.subjectId); setMins(Math.max(1, Math.floor(p.durationMs / 60000))); setShown(false); const t = setTimeout(() => setShown(true), 80); return () => clearTimeout(t); }
  }, [p]);

  const mine = useMemo(() => app.subjects.filter((s) => s.userId === app.me?.id && !s.archived), [app.subjects, app.me]);
  if (!p || !app.myProfile) return null;
  const tz = app.myProfile.tz;
  const today = dayKey(Date.now(), tz);
  const before = msOnDay(app.sessions.filter((s) => s.userId === app.me?.id), tz, today);
  const goal = app.myProfile.dailyGoalMin * MIN;
  const maxMins = Math.max(1, Math.floor(p.durationMs / 60000));
  const chosen = Math.min(maxMins, Math.max(1, mins || 1)) * MIN;
  const after = before + chosen;
  const pct = Math.round((after / goal) * 100);

  // R-004: the suggested break follows the time you actually record
  const pomo = p.mode === "pomodoro";
  const breakMin = pomo ? p.breakMin || app.myProfile.breakMin : suggestBreakMin(chosen, prefsOf(app.myProfile));
  const inBreak = focus.state?.phase === "break";

  async function save(then: NextStep) {
    setSaving(then);
    if (path !== "/focus") router.push("/focus");
    try { await focus.saveReflection({ rating, note: note.trim(), task: task.trim(), subjectId, durationMs: mins >= maxMins ? p!.durationMs : chosen, then }); }
    catch (e) { app.pushToast({ title: "保存失败", body: (e as Error).message }); }
    finally { setSaving(null); }
  }

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="refl-title">
      <div className="sheet card">
        <div>
          <p className="muted" id="refl-title">{p.completedPomodoro ? "完成一个番茄 🍅" : p.mode === "stopwatch" ? "心流结束" : p.mode === "countdown" ? "倒计时结束" : "本次专注结束"}</p>
          <div className="done-num" style={{ marginTop: 8 }}>{dur(chosen)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <label className="muted" htmlFor="refl-min">{p.durationMs > 2 * 3600000 ? "计了很久，中途离开过吗？实际专注" : "实际专注"}</label>
            <input id="refl-min" className="input num" type="number" min={1} max={maxMins} value={mins} style={{ width: 80, height: 28 }}
              onChange={(e) => setMins(Math.min(maxMins, Math.max(0, Math.floor(+e.target.value || 0))))} />
            <span className="muted">分钟（最多 {maxMins}，只能改短）</span>
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span className="muted">今日 {dur(after)} / 目标 {dur(goal)}</span>
            <span className="num" style={{ color: pct >= 100 ? "var(--good)" : "var(--ink-2)" }}>{pct}%{pct >= 100 && before < goal ? " · 达成！" : ""}</span>
          </div>
          <div className="progressbar"><div style={{ width: `${Math.min(100, shown ? (after / goal) * 100 : (before / goal) * 100)}%` }} /></div>
        </div>
        <div className="field">
          <span className="label">这段时间的专注度</span>
          <div className="rating">
            {LEVELS.map((l, i) => (
              <button key={l} aria-pressed={rating === i + 1} onClick={() => setRating(rating === i + 1 ? null : i + 1)}>
                <span className="bars">{[0, 1, 2, 3, 4].map((j) => <i key={j} className={j <= i ? "on" : ""} style={{ height: 4 + j * 3 }} />)}</span>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="refl-note">一句话记录（同窗能看到）</label>
          <textarea id="refl-note" className="textarea" maxLength={280} placeholder="学到了什么？卡在哪里？" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 10 }}>
          <div className="field">
            <label className="label" htmlFor="refl-task">任务</label>
            <input id="refl-task" className="input" value={task} maxLength={80} onChange={(e) => setTask(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="refl-subj">科目</label>
            <select id="refl-subj" className="select input" value={subjectId || ""} onChange={(e) => setSubjectId(e.target.value || null)}>
              <option value="">未分类</option>
              {mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="nextsteps">
          <span className="label">保存记录，接下来</span>
          <div className="row3" role="group" aria-label="接下来做什么">
            <button className="btn primary" disabled={!!saving} onClick={() => save("break")}>
              {saving === "break" ? "保存中…" : <>休息<small>{pomo ? `${breakMin} 分钟${inBreak ? "，已开始" : ""}` : `建议 ${breakMin} 分钟`}</small></>}
            </button>
            <button className="btn" disabled={!!saving} onClick={() => save("again")}>
              {saving === "again" ? "保存中…" : <>再来一轮<small>{pomo ? `${p.focusMin || app.myProfile.pomodoroMin} 分钟番茄` : p.mode === "countdown" ? `倒计时 ${p.focusMin || 30} 分钟` : "心流，从 0 开始"}</small></>}
            </button>
            <button className="btn" disabled={!!saving} onClick={() => save("switch")}>
              {saving === "switch" ? "保存中…" : <>换个任务<small>重新选任务和模式</small></>}
            </button>
          </div>
          <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => focus.dropReflection()}>不记录这次</button>
        </div>
      </div>
    </div>
  );
}
