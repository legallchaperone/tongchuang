"use client";
/* R-020 主页分享图：主页右上角的「分享」+ 预览 sheet（保存 / 复制 / 系统分享），做法同 components/ShareCard.tsx */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import type { Profile } from "@/lib/types";
import type { ProfilePage } from "@/lib/profilePage";
import type { ProfileStats } from "@/lib/profileStats";
import { renderProfileCard } from "@/lib/profileCard";
import type { CardTheme } from "@/lib/shareKit";
import { tzCity } from "@/lib/time";
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

export function ShareProfileButton({ p, page, stats, disabled }: { p: Profile; page: ProfilePage; stats: ProfileStats; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn sm share-btn" disabled={disabled} onClick={() => setOpen(true)} aria-haspopup="dialog" title={disabled ? "正在加载更早的记录…" : "把主页做成一张图片"}><ShareIcon />分享</button>
      {open && <ShareProfileSheet p={p} page={page} stats={stats} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareProfileSheet({ p, page, stats, onClose }: { p: Profile; page: ProfilePage; stats: ProfileStats; onClose: () => void }) {
  const app = useApp();
  const [theme, setTheme] = useState<CardTheme>("light");
  const [hidePrivate, setHidePrivate] = useState(true);
  // freeze the numbers while the sheet is open, so the picture doesn't re-render every second
  const [snap] = useState(() => ({ page, stats }));
  const [img, setImg] = useState<{ blob: Blob; url: string; key: string } | null>(null);
  const [err, setErr] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const key = `${theme}-${hidePrivate}`;

  const data = useMemo(() => ({
    name: p.name, look: lookOf(p), shirt: shirtOf(p), city: tzCity(p.tz), bio: snap.page.bio, page: snap.page, stats: snap.stats, hidePrivate,
  }), [p, snap, hidePrivate]);

  useEffect(() => {
    let alive = true;
    setErr("");
    renderProfileCard(data, theme).then((r) => alive && setImg({ blob: r.blob, url: r.url, key }), (e) => alive && setErr((e as Error).message || "生成失败"));
    return () => { alive = false; };
  }, [data, theme, key]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fileName = `tongchuang-profile-${snap.stats.todayKey}.png`;
  const file = useMemo(() => (img ? new File([img.blob], fileName, { type: "image/png" }) : null), [img, fileName]);
  const canCopy = typeof window !== "undefined" && typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
  const canShare = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
  const ready = !!img && img.key === key;

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
    try { await navigator.share({ files: [file], title: `${p.name}的主页 · 同窗` }); }
    catch (e) { if ((e as Error).name !== "AbortError") app.pushToast({ title: "没分享成功", body: (e as Error).message }); }
  }

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="pshare-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card sheet share-sheet">
        <div className="share-head">
          <h2 id="pshare-title">分享我的主页</h2>
          <button ref={closeRef} className="btn sm ghost" onClick={onClose} aria-label="关闭">关闭</button>
        </div>
        <div className="share-preview pshare-preview" aria-busy={!ready}>
          {img && <img src={img.url} alt={`${p.name}的个人主页长图`} className={ready ? "" : "stale"} data-testid="profile-share-img" />}
          {!ready && !err && <div className="share-wait"><Spinner /></div>}
          {err && <p className="empty">图片没生成出来：{err}</p>}
        </div>
        <label className="pe-check">
          <input type="checkbox" checked={hidePrivate} onChange={(e) => setHidePrivate(e.target.checked)} />
          隐藏任务名和收工时写的计划
        </label>
        <p className="muted share-tip">按主页上的小组件排版，不包含留言板。手机上也可以长按图片保存。</p>
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
