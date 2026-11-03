"use client";
import React from "react";
import type { LiveStatus, Profile } from "@/lib/types";
import { defaultLook, HAIR_COLORS, HAIR_NAMES, SKINS } from "@/lib/pixel";
import { DeskScene } from "./Pixel";
import { seriesVar } from "./bits";

function Swatch({ color, on, label, onClick }: { color: string; on: boolean; label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} aria-pressed={on} onClick={onClick} style={{ width: 28, height: 28, background: color, border: "2px solid var(--edge)", boxShadow: on ? "0 0 0 2px var(--panel), 0 0 0 4px var(--edge)" : "inset 0 -4px 0 rgba(0,0,0,.2)", cursor: "pointer" }} />;
}

const previewLive = (id: string): LiveStatus => ({ userId: id, state: "focus", task: "", subjectName: "", subjectColor: null, mode: "pomodoro", startedAt: 0, plannedEnd: null, accumulatedMs: 0, runningSince: 0, updatedAt: 0 });

/** live preview + pickers for hair, hair color, skin and shirt */
export function CharacterEditor({ p, onChange, scale = 4 }: { p: Profile; onChange: (p: Profile) => void; scale?: number }) {
  const look = p.look ?? defaultLook(p.id);
  return (
    <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
      <div className="card" style={{ alignSelf: "start" }}>
        <DeskScene p={{ ...p, look }} live={previewLive(p.id)} present maxScale={scale} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div className="field">
          <span className="label">发型</span>
          <div className="chips">{HAIR_NAMES.map((n, i) => <button type="button" key={n} className="chip" aria-pressed={look.hair === i} onClick={() => onChange({ ...p, look: { ...look, hair: i } })}>{n}</button>)}</div>
        </div>
        <div className="field">
          <span className="label">发色</span>
          <div className="chips">{HAIR_COLORS.map((c, i) => <Swatch key={c} color={c} on={look.hairColor === i} label={`发色 ${i + 1}`} onClick={() => onChange({ ...p, look: { ...look, hairColor: i } })} />)}</div>
        </div>
        <div className="field">
          <span className="label">肤色</span>
          <div className="chips">{SKINS.map((c, i) => <Swatch key={c} color={c} on={look.skin === i} label={`肤色 ${i + 1}`} onClick={() => onChange({ ...p, look: { ...look, skin: i } })} />)}</div>
        </div>
        <div className="field">
          <span className="label">衣服（也是你在图表里的颜色）</span>
          <div className="chips">{[0, 1, 2, 3, 4, 5, 6, 7].map((c) => <Swatch key={c} color={seriesVar(c)} on={p.color === c} label={`颜色 ${c + 1}`} onClick={() => onChange({ ...p, color: c })} />)}</div>
        </div>
      </div>
    </div>
  );
}
