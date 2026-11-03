"use client";
/* R-011 分享热力图：数据页“一年”卡片上的「分享」按钮 + 预览 sheet */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { withLive } from "@/lib/stats";
import { renderCard, shareData, type CardTheme } from "@/lib/shareCard";
import { lookOf, shirtOf } from "@/components/Pixel";
import { Spinner } from "@/components/bits";

const SHARE_ICON = ["....#.....", "...###....", "..#.#.#...", "....#.....", "....#.....", "#...#...#.", "#.......#.", "#.......#.", "#########.", ".........."];
function ShareIcon() {
  return (
    <svg className="pxi" width={14} height={14} viewBox="0 0 10 10" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      {SHARE_ICON.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)))}
    </svg>
  );
}

/** always shares the signed-in person's own year, whoever the stats page is showing */
export function ShareYearButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn sm share-btn" onClick={() => setOpen(true)} aria-haspopup="dialog"><ShareIcon />分享</button>
      {open && <ShareSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const me = app.myProfile!;
  const [now] = useState(() => Date.now());
  const [theme, setTheme] = useState<CardTheme>("light");
  const [img, setImg] = useState<{ blob: Blob; url: string; theme: CardTheme } | null>(null);
  const [err, setErr] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  const data = useMemo(() => shareData({
    sessions: withLive(app.sessions, me.id, app.live[me.id], me.tz, now),
    subjects: app.subjects.filter((s) => s.userId === me.id),
    tz: me.tz, now, name: me.name, look: lookOf(me), shirt: shirtOf(me),
  }), [app.sessions, app.subjects, app.live, me, now]);

  useEffect(() => {
    let alive = true;
    setErr("");
    renderCard(data, theme).then((r) => alive && setImg({ ...r, theme }), (e) => alive && setErr((e as Error).message || "生成失败"));
    return () => { alive = false; };
  }, [data, theme]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ASCII name: some browsers drop non-ASCII download names and save a bare "download"
  const fileName = `tongchuang-year-${data.to}.png`;
  const file = useMemo(() => (img ? new File([img.blob], fileName, { type: "image/png" }) : null), [img, fileName]);
  const canCopy = typeof window !== "undefined" && typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
  const canShare = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
  const ready = !!img && img.theme === theme;

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
    try { await navigator.share({ files: [file], title: "我的一年 · 同窗" }); }
    catch (e) { if ((e as Error).name !== "AbortError") app.pushToast({ title: "没分享成功", body: (e as Error).message }); }
  }

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card sheet share-sheet">
        <div className="share-head">
          <h2 id="share-title">分享一年的长势</h2>
          <button ref={closeRef} className="btn sm ghost" onClick={onClose} aria-label="关闭">关闭</button>
        </div>
        <div className="share-preview" aria-busy={!ready}>
          {img && <img src={img.url} alt={`${data.name === "我" ? "我" : data.name}最近一年的学习热力图卡片`} className={ready ? "" : "stale"} />}
          {!ready && !err && <div className="share-wait"><Spinner /></div>}
          {err && <p className="empty">图片没生成出来：{err}</p>}
        </div>
        <p className="muted share-tip">只包含你自己的数据。手机上也可以长按图片保存。</p>
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
