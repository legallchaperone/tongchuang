"use client";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { resolveSubject, useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import type { FocusMode } from "@/lib/types";
import { IPlay, IPlus } from "./Icons";
import { seriesVar } from "./bits";

export function StartPanel({ dark = false, initial }: { dark?: boolean; initial?: { mode?: FocusMode; minutes?: number; task?: string; withUser?: string | null } }) {
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
  const [mode, setMode] = useState<FocusMode>(initial?.mode || "pomodoro");
  const [minutes, setMinutes] = useState<number>(initial?.minutes || prof.pomodoroMin);
  const [adding, setAdding] = useState(false);
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
    focus.start({ mode, minutes, task: task.trim(), subjectId, withUser: initial?.withUser || null });
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
      <div className={dark ? "" : "row"} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: dark ? "space-between" : "flex-start" }}>
        <div className="seg" role="group" aria-label="计时方式">
          <button aria-pressed={mode === "pomodoro"} onClick={() => setMode("pomodoro")}>番茄钟</button>
          <button aria-pressed={mode === "stopwatch"} onClick={() => setMode("stopwatch")}>正计时</button>
        </div>
        {mode === "pomodoro" && (
          <div className="seg" role="group" aria-label="番茄时长">
            {[25, 45, 60, 90].map((m) => <button key={m} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m} 分</button>)}
          </div>
        )}
        {dark && <button className="fbtn main" onClick={go} style={{ marginLeft: "auto" }}><IPlay /> 开始</button>}
      </div>
    </div>
  );
}
