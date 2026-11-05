"use client";
/**
 * R-025 待办：首页“开始专注”下面的一张卡片。只有自己看得到。
 * 按科目分组，每条带一个预估时间；点 ▶ 把任务、科目、预估时长填进开始面板，专注结束后这条显示“已用多久”。
 */
import React, { useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import type { Todo } from "@/lib/types";
import { dur } from "@/lib/time";
import { checkTodo, estLabel, TODO_ESTIMATES, TODO_MAX } from "@/lib/todos";
import { seriesVar } from "./bits";
import { IPlay, ITrash } from "./Icons";

const estOf = (ts: Todo[]) => ts.reduce((a, t) => a + (t.estimateMin || 0), 0);
/** " · 约 45 分" / " · 约 2.5 小时" / "" when nothing is estimated */
const totalTxt = (min: number) => (min ? ` · ${fmtTotal(min)}` : "");
/** "约 45 分" / "约 2.5 小时" */
function fmtTotal(min: number) {
  if (min < 60) return `约 ${min} 分`;
  const h = Math.round((min / 60) * 2) / 2;
  return `约 ${h} 小时`;
}

export function TodoCard({ onPick, busy }: { onPick: (t: Todo) => void; /** a focus is running: ▶ is off */ busy: boolean }) {
  const app = useApp();
  const me = app.me?.id;
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const mine = useMemo(() => app.subjects.filter((s) => s.userId === me), [app.subjects, me]);
  // time spent per to-do, from my records that were started from it
  const used = useMemo(() => {
    const m = new Map<string, number>();
    app.sessions.forEach((s) => { if (s.todoId && s.userId === me) m.set(s.todoId, (m.get(s.todoId) || 0) + s.durationMs); });
    return m;
  }, [app.sessions, me]);

  const all = app.todos || [];
  const open = all.filter((t) => !t.doneAt);
  const done = all.filter((t) => t.doneAt).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  // groups: my subjects in their usual order, then subjects no longer listed, then 未分类
  const groups = useMemo(() => {
    const by = new Map<string, Todo[]>();
    open.forEach((t) => { const k = t.subjectId && mine.some((s) => s.id === t.subjectId) ? t.subjectId : "none"; by.set(k, [...(by.get(k) || []), t]); });
    const order = [...mine.map((s) => s.id), "none"];
    return order.filter((k) => by.has(k)).map((k) => ({ key: k, subject: mine.find((s) => s.id === k) || null, items: by.get(k)! }));
  }, [open, mine]);
  const totalMin = estOf(open);

  async function act(f: () => Promise<unknown>, fail: string) {
    try { await f(); } catch (e) { app.pushToast({ title: fail, body: (e as Error).message }); }
  }

  if (app.todosError) {
    return (
      <section className="card todo-card" style={{ order: 3 }}>
        <div className="cardhead"><h2>待办</h2></div>
        <div className="cardbody"><p className="muted">{app.todosError}</p></div>
      </section>
    );
  }
  return (
    <section className="card todo-card" style={{ order: 3 }} aria-label="待办">
      <div className="cardhead"><h2>待办</h2>{open.length > 0 && <span className="hint num">{open.length} 项{totalTxt(totalMin)}</span>}</div>
      <div className="cardbody td-body">
        {/* keyed on loading so the subject defaults to the last one used once the list is in */}
        <TodoEditor key={app.todos ? "new" : "loading"} submitLabel="添加" onSubmit={(v) => app.addTodo(v).then(() => undefined)} />
        {app.todos == null ? <p className="muted">正在加载…</p> : open.length === 0 && !done.length ? null : (
          <div className="td-groups">
            {groups.map((g) => (
              <div key={g.key} className="td-group">
                <h3 className="td-ghead">
                  <span className="dot" style={{ background: g.subject ? seriesVar(g.subject.color) : "var(--ink-3)" }} />
                  <span className="td-gname">{g.subject?.name || "未分类"}</span>
                  <span className="muted num">{g.items.length} 项{totalTxt(estOf(g.items))}</span>
                </h3>
                <ul className="td-list">
                  {g.items.map((t) => editing === t.id ? (
                    <li key={t.id} className="td-item editing">
                      <TodoEditor initial={t} submitLabel="保存" onCancel={() => setEditing(null)}
                        onSubmit={async (v) => { await app.updateTodo(t.id, v); setEditing(null); }} />
                    </li>
                  ) : (
                    <TodoRow key={t.id} t={t} used={used.get(t.id) || 0} busy={busy}
                      onDone={() => act(() => app.updateTodo(t.id, { doneAt: Date.now() }), "没勾上")}
                      onEdit={() => setEditing(t.id)} onPick={() => onPick(t)}
                      onDelete={() => act(() => app.deleteTodo(t.id), "没删掉")} />
                  ))}
                </ul>
              </div>
            ))}
            {done.length > 0 && (
              <div className="td-group td-done">
                <button type="button" className="td-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                  {showDone ? "▾" : "▸"} 已完成 <span className="num">{done.length}</span>
                </button>
                {showDone && (
                  <ul className="td-list">
                    {done.map((t) => (
                      <TodoRow key={t.id} t={t} used={used.get(t.id) || 0} busy
                        onDone={() => act(() => app.updateTodo(t.id, { doneAt: null }), "没改成")}
                        onDelete={() => act(() => app.deleteTodo(t.id), "没删掉")} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TodoRow({ t, used, busy, onDone, onEdit, onPick, onDelete }: {
  t: Todo; used: number; busy: boolean; onDone: () => void; onEdit?: () => void; onPick?: () => void; onDelete: () => void;
}) {
  const isDone = !!t.doneAt;
  const over = !!t.estimateMin && used > t.estimateMin * 60_000;
  return (
    <li className={`td-item${isDone ? " done" : ""}`}>
      <button type="button" className={`td-check${isDone ? " on" : ""}`} role="checkbox" aria-checked={isDone}
        aria-label={isDone ? `标成没做完：${t.text}` : `完成：${t.text}`} onClick={onDone} />
      <div className="td-main">
        {onEdit && !isDone
          ? <button type="button" className="td-text" onClick={onEdit} title="点一下修改">{t.text}</button>
          : <span className="td-text">{t.text}</span>}
        <span className="td-meta">
          {t.estimateMin && <span className="td-est">{estLabel(t.estimateMin)}</span>}
          {used > 0 && <span className={`num${over ? " td-over" : ""}`}>已用 {dur(used)}</span>}
        </span>
      </div>
      {onPick && !isDone && (
        <button type="button" className="btn sm td-go" onClick={onPick} disabled={busy} aria-label={`开始专注：${t.text}`} title={busy ? "正在专注" : "开始专注"}><IPlay /></button>
      )}
      <button type="button" className="iconbtn td-del" onClick={onDelete} aria-label={`删掉：${t.text}`} title="删掉"><ITrash /></button>
    </li>
  );
}

/** add a to-do, or edit one: text, subject, estimate */
function TodoEditor({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: Todo; submitLabel: string; onSubmit: (v: { text: string; subjectId: string | null; estimateMin: number | null }) => Promise<void>; onCancel?: () => void;
}) {
  const app = useApp();
  const mine = app.subjects.filter((s) => s.userId === app.me?.id && (!s.archived || s.id === initial?.subjectId));
  const [text, setText] = useState(initial?.text || "");
  const [subjectId, setSubjectId] = useState<string | null>(initial ? initial.subjectId : lastSubject(app.todos, mine.map((s) => s.id)));
  const [est, setEst] = useState<number | null>(initial ? initial.estimateMin : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const len = Array.from(text.trim()).length;
  async function submit(ev?: React.FormEvent) {
    ev?.preventDefault();
    const { text: t, error } = checkTodo(text);
    if (error) { setErr(error); return; }
    setBusy(true); setErr(null);
    try {
      await onSubmit({ text: t, subjectId, estimateMin: est });
      if (!initial) { setText(""); inputRef.current?.focus(); }
    } catch (e) { setErr((e as Error).message || "没存上，稍后再试"); }
    finally { setBusy(false); }
  }
  return (
    <form className={`td-editor${initial ? " edit" : ""}`} onSubmit={submit} onKeyDown={(e) => { if (e.key === "Escape" && onCancel) onCancel(); }}>
      <div className="td-editor-row">
        <input ref={inputRef} className="input" value={text} maxLength={TODO_MAX * 2} disabled={busy} autoFocus={!!initial}
          onChange={(e) => { setText(e.target.value); if (err) setErr(null); }}
          placeholder={initial ? "" : "添加待办，例如：第 4 章习题"} aria-label="待办内容" />
        <button type="submit" className="btn primary" disabled={busy || !len || len > TODO_MAX}>{busy ? "…" : submitLabel}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>取消</button>}
      </div>
      <div className="td-editor-row td-opts">
        <select className="input td-subj" value={subjectId || ""} onChange={(e) => setSubjectId(e.target.value || null)} aria-label="科目">
          <option value="">未分类</option>
          {mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="muted td-est-lbl">预估</span>
        <div className="seg td-est-seg" role="group" aria-label="预估时间（可不选）">
          {TODO_ESTIMATES.map((m) => (
            // optional: tap the picked one again to leave it unestimated
            <button key={m} type="button" aria-pressed={est === m} onClick={() => setEst(est === m ? null : m)}>{estLabel(m)}</button>
          ))}
        </div>
      </div>
      {(err || len > TODO_MAX) && <p className="td-err" role="alert">{err || `最多 ${TODO_MAX} 个字`}</p>}
    </form>
  );
}

/** the subject of the to-do I added last (if it still exists), so a run of to-dos for one subject is quick to type */
function lastSubject(todos: Todo[] | null, ids: string[]) {
  const last = [...(todos || [])].sort((a, b) => b.createdAt - a.createdAt)[0];
  return last?.subjectId && ids.includes(last.subjectId) ? last.subjectId : null;
}
