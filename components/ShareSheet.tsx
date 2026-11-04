"use client";
/**
 * 分享图预览 sheet（R-011 / R-020 / R-021 共用）：白天 / 夜晚配色、保存图片、复制、系统分享，手机上可长按保存。
 * The caller passes a `render(theme)` that draws the PNG; the sheet re-renders whenever `render` or the theme changes,
 * so options that change the picture (e.g. 隐藏任务名) just need a new `render` callback.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import type { CardTheme } from "@/lib/shareKit";
import { Spinner } from "@/components/bits";

const SHARE_ICON = ["....#.....", "...###....", "..#.#.#...", "....#.....", "....#.....", "#...#...#.", "#.......#.", "#.......#.", "#########.", ".........."];
export function ShareIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="pxi" width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      {SHARE_ICON.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)))}
    </svg>
  );
}

export type ShareRender = (theme: CardTheme) => Promise<{ blob: Blob; url: string }>;

export interface ShareSheetProps {
  /** heading on the wooden tag */
  title: string;
  /** draws the picture; null while the data is still loading (shows a spinner) */
  render: ShareRender | null;
  /** download name; keep it ASCII (some browsers drop non-ASCII names) */
  fileName: string;
  /** title passed to the system share sheet */
  shareTitle: string;
  /** alt text of the preview image */
  alt: string;
  /** small print under the preview */
  tip?: React.ReactNode;
  /** extra options shown above the buttons (e.g. a checkbox) */
  options?: React.ReactNode;
  onClose: () => void;
}

export function ShareSheet({ title, render, fileName, shareTitle, alt, tip, options, onClose }: ShareSheetProps) {
  const app = useApp();
  const [theme, setTheme] = useState<CardTheme>("light");
  const [img, setImg] = useState<{ blob: Blob; url: string; key: unknown } | null>(null);
  const [err, setErr] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  // what the current picture was drawn for: a new render callback or theme makes it stale
  const want = useMemo(() => ({ render, theme }), [render, theme]);

  useEffect(() => {
    if (!want.render) return;
    let alive = true;
    setErr("");
    want.render(want.theme).then((r) => alive && setImg({ ...r, key: want }), (e) => alive && setErr((e as Error).message || "生成失败"));
    return () => { alive = false; };
  }, [want]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const file = useMemo(() => (img ? new File([img.blob], fileName, { type: "image/png" }) : null), [img, fileName]);
  const canCopy = typeof window !== "undefined" && typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
  const canShare = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
  const ready = !!img && img.key === want;

  function save() {
    if (!img) return;
    const u = URL.createObjectURL(img.blob);
    const a = document.createElement("a");
    a.href = u; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  async function copy() {
    if (!img) return;
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": img.blob })]); app.pushToast({ title: "图片已复制" }); }
    catch (e) { app.pushToast({ title: "没复制成功", body: (e as Error).message || "可以改用「保存图片」" }); }
  }
  async function share() {
    if (!file) return;
    try { await navigator.share({ files: [file], title: shareTitle }); }
    catch (e) { if ((e as Error).name !== "AbortError") app.pushToast({ title: "没分享成功", body: (e as Error).message }); }
  }

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card sheet share-sheet">
        <div className="share-head">
          <h2 id="share-title">{title}</h2>
          <button ref={closeRef} className="btn sm ghost" onClick={onClose} aria-label="关闭">关闭</button>
        </div>
        <div className="share-preview" aria-busy={!ready}>
          {img && <img src={img.url} alt={alt} className={ready ? "" : "stale"} />}
          {!ready && !err && <div className="share-wait"><Spinner /></div>}
          {err && <p className="empty">图片没生成出来：{err}</p>}
        </div>
        {tip && <p className="muted share-tip">{tip}</p>}
        {options}
        <div className="share-actions">
          <div className="seg" role="group" aria-label="卡片配色">
            <button aria-pressed={theme === "light"} onClick={() => setTheme("light")}>白天</button>
            <button aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>夜晚</button>
          </div>
          <span className="share-sp" />
          {canShare && <button className="btn" disabled={!ready} onClick={share}>分享…</button>}
          {canCopy && <button className="btn" disabled={!ready} onClick={copy}>复制</button>}
          <button className="btn primary" disabled={!ready} onClick={save}>保存图片</button>
        </div>
      </div>
    </div>
  );
}
