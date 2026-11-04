"use client";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { resolveSubject, useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import type { FocusMode, Todo } from "@/lib/types";
import { IPlay, IPlus } from "./Icons";
import { seriesVar } from "./bits";
import { PxIcon } from "./Pixel";
import { lastCountdownMin, MODE_INFO, MODES, normMode } from "@/lib/focusModes";

const MODE_ICON: Record<FocusMode, string> = { pomodoro: "tomato", stopwatch: "star", countdown: "hourglass" };

/** R-001: pick 番茄钟 / 心流 / 倒计时, one line each */
export function ModePicker({ mode, onChange }: { mode: FocusMode; onChange: (m: FocusMode) => void }) {
  return (
    <div className="modecards" role="radiogroup" aria-label="专注模式">
      {MODES.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} className={`modecard m-${m}`} onClick={() => onChange(m)}>
          <PxIcon name={MODE_ICON[m]} size={20} />
          <b>{MODE_INFO[m].name}</b>
          <small>{MODE_INFO[m].desc}</small>
        </button>
      ))}
    </div>
  );
}

/** − [n] + 分钟 */
export function MinuteStepper({ value, onChange, min = 1, max = 300, id }: { value: number; onChange: (v: number) => void; min?: number; max?: number; id?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = (t = text) => { const n = Math.round(Number(t)); const v = Number.isFinite(n) && t.trim() ? Math.max(min, Math.min(max, n)) : value; setText(String(v)); if (v !== value) onChange(v); };
  return (
    <span className="stepper">
      <button type="button" aria-label="少 1 分钟" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
      <input id={id} className="num" inputMode="numeric" aria-label="分钟" value={text} onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={() => commit()} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
      <button type="button" aria-label="多 1 分钟" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
      <span className="u">分钟</span>
    </span>
  );
}

export function StartPanel({ dark = false, initial, pick }: {
  dark?: boolean; initial?: { mode?: FocusMode; minutes?: number; task?: string; withUser?: string | null };
  /** R-025: a to-do picked on the home page (n changes on every pick, even of the same one) */
  pick?: { todo: Todo; n: number } | null;
}) {
  const app = useApp();
  const focus = useFocus();
  const router = useRouter();
  const prof = app.myProfile!;
  const mine = useMemo(() => app.subjects.filter((s) => s.userId === app.me?.id && !s.archived), [app.subjects, app.me]);
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: { task: string; subjectId: string | null }[] = [];
    for (const s of app.sessions) {
      if (s.userId !== app.me?.id || !s.task || seen.has(s.task)) continue;
      seen.add(s.task); out.push({ task: s.task, subjectId: s.subjectId });
      if (out.length >= 4) break;
    }
    return out;
  }, [app.sessions, app.me]);

  const [task, setTask] = useState(initial?.task || "");
  const [subjectId, setSubjectId] = useState<string | null>(recent[0]?.subjectId ?? mine[0]?.id ?? null);
  const [mode, setMode] = useState<FocusMode>(initial?.mode ? normMode(initial.mode) : "pomodoro");
  const [minutes, setMinutes] = useState<number>((initial?.mode === "pomodoro" || !initial?.mode) && initial?.minutes ? initial.minutes : prof.pomodoroMin);
  const [cdMin, setCdMin] = useState<number>(initial?.mode === "countdown" && initial.minutes ? initial.minutes : 30);
  // 倒计时记住上次的时长
  useEffect(() => { if (!(initial?.mode === "countdown" && initial.minutes)) setCdMin(lastCountdownMin()); }, [initial?.mode, initial?.minutes]);
  const [adding, setAdding] = useState(false);
  /** R-025: the to-do this focus will count towards, while the task still reads the same */
  const [linked, setLinked] = useState<Todo | null>(null);
  useEffect(() => {
    if (!pick) return;
    const t = pick.todo;
    setTask(t.text); setSubjectId(t.subjectId); setMode("countdown"); setCdMin(t.estimateMin); setLinked(t);
    const el = document.getElementById("start-task") as HTMLInputElement | null;
    el?.focus(); el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [pick]);
  const todoId = linked && task.trim() === linked.text ? linked.id : null;
  const [newName, setNewName] = useState("");

  // R-019: follow a merged / deleted subject
  useEffect(() => {
    const to = resolveSubject(subjectId, app.subjectRedirects);
    if (to !== subjectId) setSubjectId(to);
  }, [subjectId, app.subjectRedirects]);

  async function addSubject() {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    try {
      // an existing subject with the same name is picked (and restored if archived) instead of duplicated
      const s = await app.ensureSubject(name);
      setSubjectId(s.id);
    } catch (e) { app.pushToast({ title: "没能添加科目", body: (e as Error).message }); }
    setNewName(""); setAdding(false);
  }

  function go() {
    focus.start({ mode, minutes: mode === "countdown" ? cdMin : mode === "pomodoro" ? minutes : 0, task: task.trim(), subjectId, withUser: initial?.withUser || null, todoId });
    router.push("/focus");
  }

  return (
    <div className={dark ? "setup" : "start"}>
      <div className={dark ? "" : "row"}>
        {dark && <div className="lbl">接下来要做什么</div>}
        <input className="input task" id="start-task" placeholder="接下来要做什么？例如：线代 第 4 章习题" value={task} maxLength={80}
          onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) go(); }} autoFocus={dark} />
        {!dark && <button className="btn primary lg" onClick={go}><IPlay /> 开始专注</button>}
      </div>
      {todoId && (
        <div className="start-linked">
          <span className="muted">来自待办</span>
          <button type="button" className="iconbtn" aria-label="不算进这条待办" title="不算进这条待办" onClick={() => setLinked(null)}>✕</button>
        </div>
      )}
      {recent.length > 0 && (
        <div>
          {dark && <div className="lbl">最近</div>}
          <div className="chips">
            {recent.map((r) => (
              <button key={r.task} className="chip" onClick={() => { setTask(r.task); if (r.subjectId) setSubjectId(r.subjectId); }}>↺ {r.task}</button>
            ))}
          </div>
        </div>
      )}
      <div>
        {dark && <div className="lbl">科目</div>}
        <div className="chips">
          {mine.map((s) => (
            <button key={s.id} className="chip" aria-pressed={subjectId === s.id} onClick={() => setSubjectId(subjectId === s.id ? null : s.id)}>
              <span className="dot" style={{ background: seriesVar(s.color) }} />{s.name}
            </button>
          ))}
          {adding ? (
            <input className="input" style={{ height: 30, width: 140, borderRadius: 99, fontSize: 13 }} autoFocus placeholder="科目名称" value={newName} maxLength={40}
              onChange={(e) => setNewName(e.target.value)} onBlur={addSubject} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addSubject(); if (e.key === "Escape") setAdding(false); }} />
          ) : (
            <button className="chip" onClick={() => setAdding(true)}><IPlus />{mine.length ? "" : "添加科目"}</button>
          )}
        </div>
      </div>
      <div>
        {dark && <div className="lbl">专注模式</div>}
        <ModePicker mode={mode} onChange={setMode} />
      </div>
      <div className="modeopts" style={{ justifyContent: dark ? "space-between" : "flex-start" }}>
        {mode === "pomodoro" && (
          <div className="seg" role="group" aria-label="番茄时长">
            {Array.from(new Set([25, 45, 60, 90, prof.pomodoroMin, minutes])).sort((a, b) => a - b).map((m) => <button key={m} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m} 分</button>)}
          </div>
        )}
        {mode === "countdown" && <MinuteStepper id="start-cd" value={cdMin} onChange={setCdMin} />}
        {mode === "stopwatch" && <span className="modehint">从 0 开始数。每满 25 分钟，窗外亮一颗星星。</span>}
        {dark && <button className="fbtn main" onClick={go} style={{ marginLeft: "auto" }}><IPlay /> 开始</button>}
      </div>
    </div>
  );
}
