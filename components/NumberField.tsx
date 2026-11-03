"use client";
import React, { useEffect, useState } from "react";

/** a number input that lets you type freely and only clamps to [min, max] when you leave it or press Enter */
export function NumberField({ id, value, min, max, onCommit, style }: { id: string; value: number; min: number; max: number; onCommit: (v: number) => void; style?: React.CSSProperties }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    const v = Number.isFinite(n) && text.trim() !== "" ? Math.max(min, Math.min(max, n)) : value;
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  const out = text.trim() !== "" && (Number(text) < min || Number(text) > max);
  return (
    <>
      <input id={id} className="input num" type="text" inputMode="numeric" value={text} style={style}
        aria-invalid={out || undefined}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
      <span className="muted" style={{ fontSize: 12, marginTop: 4, color: out ? "var(--bad)" : undefined }}>{min}–{max}{out ? "，离开输入框后会自动调整" : ""}</span>
    </>
  );
}
