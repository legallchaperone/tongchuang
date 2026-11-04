"use client";
/* R-020 个人主页：编辑模式（签名、留言板开关、添加 / 删除 / 拖动排序 / 改尺寸 / 设置，预览同窗看到的样子） */
import React, { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import type { Profile } from "@/lib/types";
import {
  BIO_MAX, GOAL_TITLE_MAX, GOALS_MAX, newWidget, NOTE_MAX, NOTE_TITLE_MAX, WIDGET_INFO, WIDGET_ORDER, WIDGETS_MAX,
  type Goal, type ProfilePage, type Widget, type WidgetConfig, type WidgetType,
} from "@/lib/profilePage";
import type { ProfileStats } from "@/lib/profileStats";
import { PxIcon } from "@/components/Pixel";
import { ProfileHeader, ProfileView } from "./ProfileView";
import { WidgetCard } from "./Widgets";

export function ProfileEditor({ p, initial, stats, onDone }: { p: Profile; initial: ProfilePage; stats: ProfileStats; onDone: () => void }) {
  const app = useApp();
  const [draft, setDraft] = useState<ProfilePage>(() => JSON.parse(JSON.stringify(initial)));
  const [preview, setPreview] = useState(false);
  const [settingsOf, setSettingsOf] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const setWidgets = (f: (l: Widget[]) => Widget[]) => setDraft((d) => ({ ...d, widgets: f(d.widgets) }));
  const patch = (id: string, f: (w: Widget) => Widget) => setWidgets((l) => l.map((w) => (w.id === id ? f(w) : w)));
  const move = (id: string, by: number) => setWidgets((l) => {
    const i = l.findIndex((w) => w.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= l.length) return l;
    const n = l.slice(); [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const remove = (id: string) => setWidgets((l) => l.filter((w) => w.id !== id));
  const add = (t: WidgetType) => {
    const w = newWidget(t);
    setWidgets((l) => [...l, w]);
    setPicking(false);
    if (t === "goals" || t === "note") setSettingsOf(w.id);
    setTimeout(() => document.querySelector(`[data-wid="${w.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  /* drag to reorder with pointer events: the list reorders live under the pointer; near the top or bottom edge the page scrolls */
  const dragRef = useRef<{ id: string; pointer: number; x: number; y: number; raf: number } | null>(null);
  function hitTest(x: number, y: number) {
    const d = dragRef.current;
    if (!d) return;
    const el = document.elementsFromPoint(x, y).map((n) => (n as HTMLElement).closest?.("[data-wid]") as HTMLElement | null).find((n) => n && n.dataset.wid !== d.id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    // same row → compare horizontally, otherwise vertically
    const after = Math.abs(y - (r.top + r.height / 2)) < r.height / 4 ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
    const target = el.dataset.wid!;
    setWidgets((l) => {
      const from = l.findIndex((w) => w.id === d.id);
      if (from < 0) return l;
      const rest = l.filter((w) => w.id !== d.id);
      let to = rest.findIndex((w) => w.id === target);
      if (to < 0) return l;
      if (after) to++;
      if (to === from) return l;
      const n = rest.slice(); n.splice(to, 0, l[from]); return n;
    });
  }
  function autoScroll() {
    const d = dragRef.current;
    if (!d) return;
    const edge = 70, vh = window.innerHeight;
    const v = d.y < edge ? -Math.ceil((edge - d.y) / 5) : d.y > vh - edge ? Math.ceil((d.y - (vh - edge)) / 5) : 0;
    if (v) { window.scrollBy(0, v); hitTest(d.x, d.y); }
    d.raf = requestAnimationFrame(autoScroll);
  }
  // listeners live on window: React moving the dragged card in the DOM would drop a pointer capture
  function onHandleDown(e: React.PointerEvent, id: string) {
    if (e.button !== 0 || dragRef.current) return;
    e.preventDefault();
    const pointer = e.pointerId;
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== pointer) return;
      d.x = ev.clientX; d.y = ev.clientY;
      hitTest(ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      if (dragRef.current) cancelAnimationFrame(dragRef.current.raf);
      dragRef.current = null;
      setDrag(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    dragRef.current = { id, pointer, x: e.clientX, y: e.clientY, raf: requestAnimationFrame(autoScroll) };
    setDrag(id);
  }
  useEffect(() => () => { if (dragRef.current) cancelAnimationFrame(dragRef.current.raf); }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    setSaving(true);
    try {
      const page: ProfilePage = { bio: draft.bio.trim().slice(0, BIO_MAX), widgets: draft.widgets.map((w) => ({ ...w, config: cleanForSave(w) })) };
      if (draft.guestbook === false) page.guestbook = false;
      await app.saveProfile({ ...p, page });
      app.pushToast({ title: "主页已保存" });
      onDone();
    } catch (e) {
      app.pushToast({ title: "没保存成功", body: (e as Error).message, ttl: 9000 });
    } finally { setSaving(false); }
  }
  function cancel() {
    if (dirty && !window.confirm("放弃这次的修改？")) return;
    onDone();
  }

  const bar = (
    <div className="pe-bar" role="toolbar" aria-label="编辑主页">
      <b>{preview ? "预览：同窗看到的样子" : "编辑主页"}</b>
      <span className="pe-sp" />
      {preview
        ? <button className="btn sm" onClick={() => setPreview(false)}>返回编辑</button>
        : <button className="btn sm" onClick={() => { setPreview(true); setSettingsOf(null); window.scrollTo({ top: 0 }); }}>预览</button>}
      <button className="btn sm ghost" onClick={cancel}>取消</button>
      <button className="btn sm primary" disabled={saving || !dirty} onClick={save}>{saving ? "保存中…" : "保存"}</button>
    </div>
  );

  if (preview) {
    return (
      <>
        {bar}
        <div className="pe-preview"><ProfileView p={p} page={draft} stats={stats} isOwner={false} /></div>
      </>
    );
  }

  const used = new Set(draft.widgets.map((w) => w.type));
  return (
    <>
      {bar}
      <ProfileHeader p={p} bio={draft.bio} isOwner />
      <section className="card pad pe-basics">
        <label className="field">
          <span className="label">签名 <span className="muted">（{draft.bio.length}/{BIO_MAX}）</span></span>
          <input className="input" value={draft.bio} maxLength={BIO_MAX} placeholder="一句话介绍自己，比如“在准备考研，一起加油”" onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value.slice(0, BIO_MAX) }))} />
        </label>
        <label className="pe-check">
          <input type="checkbox" checked={draft.guestbook !== false} onChange={(e) => setDraft((d) => { const n = { ...d }; if (e.target.checked) delete n.guestbook; else n.guestbook = false; return n; })} />
          留言板：允许同窗在我的主页留言、贴贴纸
        </label>
      </section>

      <div className={`pgrid editing ${drag ? "is-dragging" : ""}`}>
        {draft.widgets.map((w, i) => (
          <WidgetCard key={w.id} w={w} s={stats} p={p} isOwner dragging={drag === w.id} className="pe-w">
            <div className="pe-tools">
              <button className="iconbtn pe-handle" aria-label={`拖动排序：${WIDGET_INFO[w.type].name}`} title="按住拖动排序"
                onPointerDown={(e) => onHandleDown(e, w.id)}>
                <GripIcon />
              </button>
              <button className="iconbtn" disabled={i === 0} aria-label="上移" title="上移" onClick={() => move(w.id, -1)}><Arrow up /></button>
              <button className="iconbtn" disabled={i === draft.widgets.length - 1} aria-label="下移" title="下移" onClick={() => move(w.id, 1)}><Arrow /></button>
              <span className="pe-sp" />
              <div className="seg pe-size" role="group" aria-label="尺寸">
                <button aria-pressed={w.size === "s"} onClick={() => patch(w.id, (x) => ({ ...x, size: "s" }))}>小</button>
                <button aria-pressed={w.size === "w"} onClick={() => patch(w.id, (x) => ({ ...x, size: "w" }))}>宽</button>
              </div>
              {hasSettings(w.type) && (
                <button className={`iconbtn ${settingsOf === w.id ? "on" : ""}`} aria-expanded={settingsOf === w.id} aria-label="设置" title="设置" onClick={() => setSettingsOf(settingsOf === w.id ? null : w.id)}><PxIcon name="settings" size={14} /></button>
              )}
              <button className="iconbtn" aria-label={`删除：${WIDGET_INFO[w.type].name}`} title="删除" onClick={() => remove(w.id)}><PxIcon name="trash" size={14} /></button>
            </div>
            {settingsOf === w.id && <WidgetSettings w={w} onChange={(config) => patch(w.id, (x) => ({ ...x, config }))} />}
          </WidgetCard>
        ))}
        {draft.widgets.length < WIDGETS_MAX && (
          <button className="pe-add" onClick={() => setPicking(true)}><PxIcon name="plus" size={14} />添加小组件</button>
        )}
      </div>

      {picking && (
        <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="pe-pick-title" onClick={(e) => { if (e.target === e.currentTarget) setPicking(false); }}>
          <div className="card sheet pe-pick">
            <div className="share-head"><h2 id="pe-pick-title">添加小组件</h2><button className="btn sm ghost" onClick={() => setPicking(false)}>关闭</button></div>
            <ul>
              {WIDGET_ORDER.map((t) => {
                const off = used.has(t) && !WIDGET_INFO[t].multi;
                return (
                  <li key={t}>
                    <button className="pe-pick-item" disabled={off} onClick={() => add(t)}>
                      <b>{WIDGET_INFO[t].name}</b><span className="muted">{off ? "已经在主页上了" : WIDGET_INFO[t].desc}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

const hasSettings = (t: WidgetType) => ["subjects", "hours", "recent", "goals", "badges", "note"].includes(t);

function cleanForSave(w: Widget): WidgetConfig {
  if (w.type === "goals") return { goals: (w.config.goals || []).map((g) => ({ title: g.title.trim(), date: g.date })).filter((g) => g.title || g.date) };
  if (w.type === "note") return { title: (w.config.title || "").trim(), text: (w.config.text || "").replace(/\s+$/, "") };
  return w.config;
}

function WidgetSettings({ w, onChange }: { w: Widget; onChange: (c: WidgetConfig) => void }) {
  const c = w.config;
  const seg = <T extends number>(label: string, value: T, opts: [T, string][], set: (v: T) => void) => (
    <div className="pe-row"><span className="label">{label}</span>
      <div className="seg" role="group" aria-label={label}>{opts.map(([v, t]) => <button key={v} aria-pressed={value === v} onClick={() => set(v)}>{t}</button>)}</div>
    </div>
  );
  return (
    <div className="pe-settings">
      {w.type === "subjects" && seg("时间范围", c.days === 7 ? 7 : 30, [[7, "7 天"], [30, "30 天"]], (days) => onChange({ ...c, days }))}
      {w.type === "hours" && seg("时间范围", c.days === 90 ? 90 : 30, [[30, "30 天"], [90, "90 天"]], (days) => onChange({ ...c, days }))}
      {w.type === "recent" && <>
        {seg("显示几条", c.count || 5, [[3, "3"], [5, "5"], [8, "8"]], (count) => onChange({ ...c, count }))}
        <label className="pe-check"><input type="checkbox" checked={!!c.hideTask} onChange={(e) => onChange({ ...c, hideTask: e.target.checked })} />隐藏任务名，只显示科目</label>
      </>}
      {w.type === "badges" && <label className="pe-check"><input type="checkbox" checked={c.showLocked !== false} onChange={(e) => onChange({ ...c, showLocked: e.target.checked })} />也显示还没拿到的（灰色）</label>}
      {w.type === "note" && <>
        <label className="field"><span className="label">标题（可不填）</span>
          <input className="input" value={c.title || ""} maxLength={NOTE_TITLE_MAX} placeholder="便签" onChange={(e) => onChange({ ...c, title: e.target.value.slice(0, NOTE_TITLE_MAX) })} /></label>
        <label className="field"><span className="label">内容 <span className="muted">（{(c.text || "").length}/{NOTE_MAX}）</span></span>
          <textarea className="textarea" value={c.text || ""} maxLength={NOTE_MAX} rows={4} onChange={(e) => onChange({ ...c, text: e.target.value.slice(0, NOTE_MAX) })} /></label>
      </>}
      {w.type === "goals" && <GoalsEditor goals={c.goals || []} onChange={(goals) => onChange({ ...c, goals })} />}
    </div>
  );
}

function GoalsEditor({ goals, onChange }: { goals: Goal[]; onChange: (g: Goal[]) => void }) {
  const set = (i: number, g: Partial<Goal>) => onChange(goals.map((x, j) => (j === i ? { ...x, ...g } : x)));
  return (
    <div className="pe-goals">
      {goals.map((g, i) => (
        <div className="pe-goal" key={i}>
          <input className="input" value={g.title} maxLength={GOAL_TITLE_MAX} placeholder="比如：考研数学" aria-label={`目标 ${i + 1}`} onChange={(e) => set(i, { title: e.target.value.slice(0, GOAL_TITLE_MAX) })} />
          <input className="input" type="date" value={g.date} aria-label={`目标 ${i + 1} 的日期`} onChange={(e) => set(i, { date: e.target.value })} />
          <button className="iconbtn" aria-label={`删除目标 ${i + 1}`} onClick={() => onChange(goals.filter((_, j) => j !== i))}><PxIcon name="close" size={14} /></button>
        </div>
      ))}
      {goals.length < GOALS_MAX && <button className="btn sm" onClick={() => onChange([...goals, { title: "", date: "" }])}><PxIcon name="plus" size={14} />加一个目标</button>}
      <p className="muted">倒计时按你的当地日期算。</p>
    </div>
  );
}

function GripIcon() {
  const dots = [[2, 1], [6, 1], [2, 4], [6, 4], [2, 7], [6, 7]];
  return <svg className="pxi" width={14} height={14} viewBox="0 0 10 10" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">{dots.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={2} height={2} />)}</svg>;
}
function Arrow({ up = false }: { up?: boolean }) {
  const rows = ["....##....", "...####...", "..######..", ".########.", "....##....", "....##....", "....##....", "....##....", "....##....", ".........."];
  const m = up ? rows : [...rows].reverse();
  return <svg className="pxi" width={14} height={14} viewBox="0 0 10 10" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">{m.flatMap((r, y) => [...r].map((ch, x) => (ch === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)))}</svg>;
}
