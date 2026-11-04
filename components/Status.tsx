"use client";
/* R-005 personal status: the picker sheet, its triggers and small display bits */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/lib/store";
import type { LiveStatus, Profile } from "@/lib/types";
import { ago } from "@/lib/time";
import {
  activeStatus, DURATIONS, durationOf, readStatusPrefs, STATUS_EMOJIS, STATUS_MAX, STATUS_PRESETS, untilFor, untilLabel,
  type ActiveStatus, type StatusDuration, type StatusPrefs,
} from "@/lib/status";
import { IClose } from "./Icons";
import { ProfileLink } from "./profile/ProfileLink";

export function useStatusPrefs(): StatusPrefs {
  const [p, setP] = useState<StatusPrefs>({ keepOnFocus: false, showInFeed: true });
  useEffect(() => {
    const read = () => setP(readStatusPrefs());
    read();
    window.addEventListener("tc-status-prefs", read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener("tc-status-prefs", read); window.removeEventListener("storage", read); };
  }, []);
  return p;
}

/** first user-perceived character of a string (keeps flags, skin tones and ✈️ together) */
function firstGlyph(s: string) {
  const t = s.trim();
  if (!t) return "";
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(x: string): Iterable<{ segment: string }> } }).Segmenter;
    if (Seg) for (const x of new Seg("zh", { granularity: "grapheme" }).segment(t)) return x.segment;
  } catch { /* fall through */ }
  return Array.from(t)[0];
}

/** "😴 睡觉了 · 3 小时前" */
export function statusLine(s: ActiveStatus, now: number) {
  return `${s.emoji} ${s.text}`.trim() + ` · ${ago(s.setAt, now)}`;
}

export function StatusSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const prefs = useStatusPrefs();
  const meId = app.me!.id;
  const tz = app.myProfile?.tz || "UTC";
  const cur = activeStatus(app.live[meId], app.now);
  const [emoji, setEmoji] = useState(cur?.emoji || "");
  const [text, setText] = useState(cur?.text || "");
  const [dura, setDura] = useState<StatusDuration>(cur ? durationOf(cur.until, cur.setAt, tz) : "today");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const preset = STATUS_PRESETS.find((p) => p.emoji === emoji);
  const until = untilFor(dura, tz, app.now);
  const left = Array.from(text).length;

  function choose(e: string, t?: string) {
    setEmoji(e);
    // fill the sentence from a preset, unless the user already wrote their own
    if (t != null && (!text.trim() || STATUS_PRESETS.some((p) => p.text === text.trim()))) setText(t);
  }
  async function save() {
    if (!emoji) return;
    setBusy(true);
    try {
      await app.setMyStatus({ emoji, text: Array.from(text.trim()).slice(0, STATUS_MAX).join("") || preset?.text || "", until });
      onClose();
    } catch (e) { app.pushToast({ title: "没保存上", body: (e as Error).message }); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true);
    try { await app.setMyStatus(null); onClose(); }
    catch (e) { app.pushToast({ title: "没清除成功", body: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return createPortal(
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="st-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet card st-sheet">
        <div className="st-head">
          <h2 id="st-title">我的状态</h2>
          <button className="iconbtn" onClick={onClose} aria-label="关闭"><IClose /></button>
        </div>

        <div className="st-preview">
          <span className={`st-big ${emoji ? "" : "empty"}`} aria-hidden="true">{emoji || "?"}</span>
          <div className="field" style={{ flex: 1, minWidth: 0 }}>
            <label className="label" htmlFor="st-text">一句话 <span className="muted num">{left}/{STATUS_MAX}</span></label>
            <input id="st-text" ref={textRef} className="input" value={text} placeholder={preset?.text || "比如：去图书馆还书"}
              onChange={(e) => setText(Array.from(e.target.value).slice(0, STATUS_MAX).join(""))}
              onKeyDown={(e) => { if (e.key === "Enter" && emoji) save(); }} />
          </div>
        </div>

        <div className="st-presets" role="group" aria-label="常用状态">
          {STATUS_PRESETS.map((p) => (
            <button key={p.emoji} className="st-tile" aria-pressed={emoji === p.emoji} onClick={() => choose(p.emoji, p.text)}>
              <span className="e">{p.emoji}</span><span>{p.label}</span>
            </button>
          ))}
        </div>

        <div className="st-more">
          <span className="muted">换个图标</span>
          <div className="st-emojis">
            {STATUS_EMOJIS.map((e) => (
              <button key={e} className="st-em" aria-pressed={emoji === e} aria-label={e} onClick={() => { choose(e); textRef.current?.focus(); }}>{e}</button>
            ))}
            <input className="input st-custom" value={custom} placeholder="自定" aria-label="自己输入一个表情"
              onChange={(e) => { const g = firstGlyph(e.target.value); setCustom(g); if (g) choose(g); }} />
          </div>
        </div>

        <div className="field">
          <span className="label">多久后消失</span>
          <div className="seg st-seg" role="group" aria-label="有效期">
            {DURATIONS.map((d) => <button key={d.key} aria-pressed={dura === d.key} onClick={() => setDura(d.key)}>{d.label}</button>)}
          </div>
          <span className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {until == null ? "不会自动消失，记得回来清除。" : `${untilLabel(until, tz, app.now)}自动消失（按你的时区）。`}
            {prefs.keepOnFocus ? "开始专注时会保留。" : "开始专注时会自动清除。"}
          </span>
        </div>

        <div className="st-actions">
          {cur && <button className="btn ghost" disabled={busy} onClick={clear}>清除状态</button>}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={!emoji || busy} onClick={save}>{cur ? "更新" : "设定"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** a button that opens the status sheet; renders the current status (or a prompt) as its label */
export function StatusButton({ className = "", variant = "chip" }: { className?: string; variant?: "chip" | "rail" }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const meId = app.me?.id;
  if (!meId) return null;
  const st = activeStatus(app.live[meId], app.now);
  const tz = app.myProfile?.tz || "UTC";
  return (
    <>
      <button className={`st-btn st-${variant} ${st ? "on" : ""} ${className}`} onClick={() => setOpen(true)}
        title={st ? `${st.emoji} ${st.text}${st.until ? " · " + untilLabel(st.until, tz, app.now) : ""}` : "设置状态"} aria-haspopup="dialog">
        {st ? <><span className="e">{st.emoji}</span><span className="t">{st.text || "状态"}</span>{variant === "chip" && st.until && <span className="u">{untilLabel(st.until, tz, app.now)}</span>}</>
          : <><span className="e plus">+</span><span className="t">设个状态</span></>}
      </button>
      {open && <StatusSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** the status line under a name plate; on my own desk it doubles as the entry to the sheet */
export function StatusLine({ s, mine, now }: { s: ActiveStatus; mine: boolean; now: number }) {
  const [open, setOpen] = useState(false);
  const body = <><span className="e">{s.emoji}</span>{s.text && <span className="t">{s.text}</span>}<span className="ago">· {ago(s.setAt, now)}</span></>;
  if (!mine) return <span className="st-line" title={`${s.emoji} ${s.text}`}>{body}</span>;
  return (
    <>
      <button className="st-line mine" onClick={() => setOpen(true)} title="改状态">{body}</button>
      {open && <StatusSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** a small "+ 设个状态" link for my own idle desk */
export function SetStatusLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="st-line mine add" onClick={() => setOpen(true)}><span className="e plus">+</span><span className="t">设个状态，告诉同窗你在干嘛</span></button>
      {open && <StatusSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** feed entry: "林舟：😴 睡觉了" */
export function StatusFeedItem({ p, l, isMine, avatar }: { p?: Profile; l: LiveStatus; isMine: boolean; avatar: React.ReactNode }) {
  const app = useApp();
  const s = activeStatus(l, app.now);
  if (!s) return null;
  const viewerTz = app.myProfile?.tz || "UTC";
  return (
    <div className="fi st-fi">
      {avatar}
      <div style={{ minWidth: 0 }}>
        <div className="line1"><ProfileLink id={p?.id} className="plink-name"><b>{isMine ? "我" : p?.name || "同窗"}</b></ProfileLink><span className="muted">：</span><span className="st-say"><span className="e">{s.emoji}</span>{s.text}</span></div>
        <div className="meta"><span>{ago(s.setAt, app.now)}</span>{s.until && <span>{untilLabel(s.until, viewerTz, app.now)}</span>}{!s.until && <span>直到清除</span>}</div>
      </div>
    </div>
  );
}
