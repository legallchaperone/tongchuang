"use client";
import React, { useEffect, useRef, useState } from "react";
import { applyMix, loadMix, saveMix, SOUNDS, stopAll, type MixState, type SoundId } from "@/lib/sound";
import { PxIcon } from "./Pixel";
import { useFocus } from "@/lib/focus";

/** "环境声" button + panel: pick any mix of recordings, each with its own volume, plus a master volume */
export function SoundMixer({ onChange }: { onChange?: (m: MixState) => void }) {
  const [open, setOpen] = useState(false);
  const [mix, setMix] = useState<MixState>(() => loadMix());
  const [credits, setCredits] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // leaving the focus page mid-focus keeps the sound on; the focus provider stops it once the focus is over
  const focus = useFocus();
  const running = useRef(false);
  running.current = !!focus.state;

  // the browser only lets audio start after a click; restore the saved mix on the first one
  useEffect(() => {
    onChange?.(mix);
    const first = () => applyMix(loadMix());
    window.addEventListener("pointerdown", first, { once: true });
    return () => { window.removeEventListener("pointerdown", first); if (!running.current) stopAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    setTimeout(() => window.addEventListener("pointerdown", close), 0);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [open]);

  function update(m: MixState) {
    setMix(m); saveMix(m); onChange?.(m);
    applyMix(m);
  }
  const level = (id: SoundId) => mix.levels[id] || 0;
  const toggle = (id: SoundId) => update({ ...mix, muted: false, levels: { ...mix.levels, [id]: level(id) > 0 ? 0 : 0.6 } });
  const active = SOUNDS.filter((s) => level(s.id) > 0);

  return (
    <div className="mixer" ref={panel}>
      <button className="f mixer-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <PxIcon name="sound" size={14} />
        {mix.muted || !active.length ? "环境声" : active.map((s) => s.name).join(" + ")}
      </button>
      {open && (
        <div className="card mixer-panel" role="dialog" aria-label="环境声">
          <div className="mixer-row master">
            <button className="chip" aria-pressed={!mix.muted} onClick={() => update({ ...mix, muted: !mix.muted })}>{mix.muted ? "已静音" : "总音量"}</button>
            <input type="range" min={0} max={1} step={0.01} value={mix.master} aria-label="总音量"
              onChange={(e) => update({ ...mix, muted: false, master: +e.target.value })} />
            <span className="num muted">{Math.round(mix.master * 100)}</span>
          </div>
          <p className="muted" style={{ margin: "2px 0 6px" }}>可以同时开几种，各自调大小。</p>
          {SOUNDS.map((s) => (
            <div className="mixer-row" key={s.id}>
              <button className="chip" aria-pressed={level(s.id) > 0} onClick={() => toggle(s.id)}>{s.name}</button>
              <input type="range" min={0} max={1} step={0.01} value={level(s.id)} aria-label={`${s.name}音量`}
                onChange={(e) => update({ ...mix, muted: false, levels: { ...mix.levels, [s.id]: +e.target.value } })} />
              <span className="num muted">{Math.round(level(s.id) * 100)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <button className="btn sm ghost" onClick={() => update({ ...mix, levels: {} })}>全部关掉</button>
            <button className="btn sm ghost" onClick={() => setCredits(!credits)}>{credits ? "收起" : "音源署名"}</button>
          </div>
          {credits && (
            <ul className="mixer-credits">
              {SOUNDS.map((s) => <li key={s.id}>{s.name}：<a href={s.url} target="_blank" rel="noreferrer">{s.credit}</a> · {s.license}</li>)}
              <li>录音经 Blanket 项目整理。</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
