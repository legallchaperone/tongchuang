"use client";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { dur, dayKey, MIN } from "@/lib/time";
import { IClose } from "./Icons";
import { seriesVar } from "./bits";

export function Toasts() {
  const { toasts, dismissToast, profiles } = useApp();
  void profiles;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
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
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [task, setTask] = useState("");
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (p) { setRating(null); setNote(""); setTask(p.task); setSubjectId(p.subjectId); setShown(false); const t = setTimeout(() => setShown(true), 80); return () => clearTimeout(t); }
  }, [p]);

  const mine = useMemo(() => app.subjects.filter((s) => s.userId === app.me?.id && !s.archived), [app.subjects, app.me]);
  if (!p || !app.myProfile) return null;
  const tz = app.myProfile.tz;
  const today = dayKey(Date.now(), tz);
  const before = app.sessions.filter((s) => s.userId === app.me?.id && dayKey(s.startedAt, tz) === today).reduce((a, s) => a + s.durationMs, 0);
  const goal = app.myProfile.dailyGoalMin * MIN;
  const after = before + p.durationMs;
  const pct = Math.round((after / goal) * 100);

  async function save() {
    setSaving(true);
    try { await focus.saveReflection({ rating, note: note.trim(), task: task.trim(), subjectId }); }
    catch (e) { app.pushToast({ title: "保存失败", body: (e as Error).message }); }
    finally { setSaving(false); }
  }

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="refl-title">
      <div className="sheet">
        <div>
          <p className="muted" id="refl-title">{p.completedPomodoro ? "完成一个番茄 🍅" : "本次专注结束"}</p>
          <div className="done-num" style={{ marginTop: 8 }}>{dur(p.durationMs)}</div>
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
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn ghost" onClick={() => focus.dropReflection()}>不记录这次</button>
          <button className="btn primary lg" disabled={saving} onClick={save}>{saving ? "保存中…" : "保存记录"}</button>
        </div>
      </div>
    </div>
  );
}
