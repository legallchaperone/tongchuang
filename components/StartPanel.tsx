"use client";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { resolveSubject, useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import type { FocusMode, Todo } from "@/lib/types";
import { IPlay, IPlus, ISettings } from "./Icons";
import { seriesVar } from "./bits";
import { PxIcon } from "./Pixel";
import { lastCountdownMin, MODE_INFO, MODES, normMode } from "@/lib/focusModes";
import { estLabel } from "@/lib/todos";

const MODE_ICON: Record<FocusMode, string> = { pomodoro: "tomato", stopwatch: "star", countdown: "hourglass" };

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

/** the planned length as a clock face: "25:00", "1:30:00", flow "0:00" */
function face(min: number) {
  if (!min) return "0:00";
  return min >= 60 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}:00` : `${min}:00`;
}

const DIAL_N = 40;
/** a pixel ring with the time in the middle */
function Dial({ mode, text }: { mode: FocusMode; text: string }) {
  const cells = useMemo(() => {
    const out: { x: number; y: number; t: "ring" | "edge" | "in" }[] = [];
    const c = DIAL_N / 2;
    for (let y = 0; y < DIAL_N; y++) for (let x = 0; x < DIAL_N; x++) {
      const r = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (r > c - 0.3) continue;
      out.push({ x, y, t: r > c - 1.3 ? "edge" : r > c - 4.3 ? "ring" : r > c - 5.3 ? "edge" : "in" });
    }
    return out;
  }, []);
  return (
    <div className={`dial m-${mode}`}>
      <svg viewBox={`0 0 ${DIAL_N} ${DIAL_N}`} shapeRendering="crispEdges" aria-hidden="true">
        {cells.map((q) => <rect key={`${q.x}-${q.y}`} x={q.x} y={q.y} width={1} height={1} className={`d-${q.t}`} />)}
      </svg>
      <div className="dial-t num">{text}</div>
    </div>
  );
}

/**
 * 开始专注 (laid out like a focus timer): mode tabs, "选择要专注的任务", the planned time on a dial, ▶ and ⚙.
 * The task comes from my to-dos, my recent tasks, or is typed in.
 */
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
  const todos = useMemo(() => (app.todos || []).filter((t) => !t.doneAt), [app.todos]);

  const [task, setTask] = useState(initial?.task || "");
  // nothing is preselected: the button reads “选择要专注的任务” until a task or subject is chosen
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [mode, setMode] = useState<FocusMode>(initial?.mode ? normMode(initial.mode) : "pomodoro");
  const [minutes, setMinutes] = useState<number>((initial?.mode === "pomodoro" || !initial?.mode) && initial?.minutes ? initial.minutes : prof.pomodoroMin);
  const [cdMin, setCdMin] = useState<number>(initial?.mode === "countdown" && initial.minutes ? initial.minutes : 30);
  // 倒计时记住上次的时长
  useEffect(() => { if (!(initial?.mode === "countdown" && initial.minutes)) setCdMin(lastCountdownMin()); }, [initial?.mode, initial?.minutes]);
  const [picking, setPicking] = useState(false);
  const [opts, setOpts] = useState(false);
  /** R-025: the to-do this focus will count towards */
  const [linked, setLinked] = useState<Todo | null>(null);
  const playRef = React.useRef<HTMLButtonElement>(null);

  // R-019: follow a merged / deleted subject
  useEffect(() => {
    const to = resolveSubject(subjectId, app.subjectRedirects);
    if (to !== subjectId) setSubjectId(to);
  }, [subjectId, app.subjectRedirects]);

  function choose(text: string, sid: string | null, todo: Todo | null = null) {
    setTask(text); setSubjectId(sid); setLinked(todo);
    // the mode stays whatever was picked; an estimate only pre-fills the countdown length
    if (todo?.estimateMin) setCdMin(Math.min(300, todo.estimateMin));
    setPicking(false);
    setTimeout(() => playRef.current?.focus(), 0);
  }
  useEffect(() => {
    if (!pick) return;
    choose(pick.todo.text, pick.todo.subjectId, pick.todo);
    playRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);
  const todoId = linked && task.trim() === linked.text ? linked.id : null;
  const subj = mine.find((x) => x.id === subjectId);

  function go() {
    focus.start({ mode, minutes: mode === "countdown" ? cdMin : mode === "pomodoro" ? minutes : 0, task: task.trim(), subjectId, withUser: initial?.withUser || null, todoId });
    router.push("/focus");
  }
  const planned = mode === "stopwatch" ? 0 : mode === "pomodoro" ? minutes : cdMin;

  return (
    <div className={`start2${dark ? " in-focus" : ""}`}>
      <div className="mtabs" role="radiogroup" aria-label="专注模式">
        {MODES.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={`mtab m-${m}`} title={MODE_INFO[m].desc} onClick={() => setMode(m)}>
            <PxIcon name={MODE_ICON[m]} size={16} />{MODE_INFO[m].name}
          </button>
        ))}
      </div>

      <div className="taskpick">
        {task || subj ? (
          <button type="button" className="taskchip" aria-expanded={picking} onClick={() => setPicking((v) => !v)} title="换一个任务">
            {subj && <span className="subj"><span className="dot" style={{ background: seriesVar(subj.color) }} />{subj.name}</span>}
            <b>{task || "自习"}</b>
            {todoId && <small className="muted">待办</small>}
          </button>
        ) : (
          <button type="button" className="btn primary taskbtn" aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
            <PxIcon name="task" size={18} />选择要专注的任务
          </button>
        )}
      </div>
      {picking && (
        <TaskPicker task={task} subjectId={subjectId} mine={mine} todos={todos} recent={recent}
          onSubject={setSubjectId} onType={setTask} onChoose={choose} onClose={() => { setPicking(false); setTimeout(() => playRef.current?.focus(), 0); }} />
      )}

      <Dial mode={mode} text={face(planned)} />

      <div className="dialctl">
        <button ref={playRef} type="button" className="playbtn" onClick={go} aria-label="开始专注" title="开始专注"><IPlay /></button>
        {mode !== "stopwatch" && (
          <button type="button" className={`iconbtn gearbtn${opts ? " on" : ""}`} aria-expanded={opts} aria-label="调整时长" title="调整时长" onClick={() => setOpts((v) => !v)}><ISettings /></button>
        )}
      </div>
      {opts && mode === "pomodoro" && (
        <div className="seg dialopts" role="group" aria-label="番茄时长">
          {Array.from(new Set([25, 45, 60, 90, prof.pomodoroMin, minutes])).sort((a, b) => a - b).map((m) => <button key={m} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m} 分</button>)}
        </div>
      )}
      {opts && mode === "countdown" && <div className="dialopts"><MinuteStepper id="start-cd" value={cdMin} onChange={setCdMin} /></div>}
    </div>
  );
}

/** what to focus on: type it (it is the task as you type, no Enter needed), or take one of my to-dos or recent tasks; the subject chips set the subject */
function TaskPicker({ task, subjectId, mine, todos, recent, onSubject, onType, onChoose, onClose }: {
  task: string; subjectId: string | null; mine: { id: string; name: string; color: number }[]; todos: Todo[];
  recent: { task: string; subjectId: string | null }[];
  onSubject: (id: string | null) => void; onType: (text: string) => void; onChoose: (text: string, sid: string | null, todo?: Todo | null) => void; onClose: () => void;
}) {
  const app = useApp();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  async function addSubject() {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    try { const s = await app.ensureSubject(name); onSubject(s.id); }
    catch (e) { app.pushToast({ title: "没能添加科目", body: (e as Error).message }); }
    setNewName(""); setAdding(false);
  }
  const sname = (id: string | null) => mine.find((x) => x.id === id);
  return (
    <div className="tpick" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <form onSubmit={(e) => { e.preventDefault(); onClose(); }}>
        <input className="input" id="start-task" autoFocus value={task} maxLength={80} placeholder="直接写要做什么，例如：线代 第 4 章习题"
          onChange={(e) => onType(e.target.value)} />
      </form>
      <div className="chips" role="group" aria-label="科目">
        {mine.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={subjectId === s.id} onClick={() => onSubject(subjectId === s.id ? null : s.id)}>
            <span className="dot" style={{ background: seriesVar(s.color) }} />{s.name}
          </button>
        ))}
        {adding ? (
          <input className="input" style={{ height: 30, width: 140, fontSize: 13 }} autoFocus placeholder="科目名称" value={newName} maxLength={40}
            onChange={(e) => setNewName(e.target.value)} onBlur={addSubject}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addSubject(); } if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }} />
        ) : (
          <button type="button" className="chip" onClick={() => setAdding(true)} aria-label="添加科目"><IPlus />{mine.length ? "" : "添加科目"}</button>
        )}
      </div>
      {todos.length > 0 && (
        <div className="tp-sec">
          <div className="tp-lbl">待办</div>
          <ul className="tp-list">
            {todos.map((t) => {
              const s = sname(t.subjectId);
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => onChoose(t.text, t.subjectId, t)}>
                    <span className="dot" style={{ background: s ? seriesVar(s.color) : "var(--ink-3)" }} />
                    <span className="tp-text">{t.text}</span>
                    {t.estimateMin && <span className="td-est">{estLabel(t.estimateMin)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {recent.length > 0 && (
        <div className="tp-sec">
          <div className="tp-lbl">最近</div>
          <div className="chips">
            {recent.map((r) => <button key={r.task} type="button" className="chip" onClick={() => onChoose(r.task, r.subjectId ?? subjectId)}>↺ {r.task}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
