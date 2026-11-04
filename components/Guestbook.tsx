"use client";
/**
 * R-020 留言板（贴纸墙）：主页上的一块像素软木板，同窗的留言像便利贴一样钉在上面，最新的在前面。
 * 自包含：自己读写 backend、自己订阅实时更新。用法：<Guestbook ownerId={id} enabled={page.guestbook !== false} />
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import type { GuestbookEntry, UserId } from "@/lib/types";
import { ago } from "@/lib/time";
import { OUTLINE, shade } from "@/lib/pixel";
import { checkGuestbook, GB_MAX_TEXT, GB_MISSING, gbLength } from "@/lib/guestbook";
import { Avatar } from "./bits";
import { ITrash } from "./Icons";
import { Sticker, STICKERS, stickerName } from "./Stickers";

/** notes shown before “查看更早的” */
const FOLD = 8;
/** notes fetched per page */
const PAGE = 60;

const PAPERS = ["#ffe58a", "#ffc4d2", "#bfe3ff", "#c9ef9f", "#ffd2a1", "#ddd0ff"];
const PINS = ["#e34948", "#2a78d6", "#1baf7a", "#eda100", "#6250d6"];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** a note's look, fixed by its id: paper color, a stair-stepped tilt (whole pixels, no blurry rotation), pin color and nudge */
function lookFor(id: string) {
  const h = hash(id);
  const steps = [0, 1, 1, 2, 2][h % 5];
  const dir = (h >>> 3) & 1 ? 1 : -1;
  return {
    paper: PAPERS[(h >>> 5) % PAPERS.length],
    pin: PINS[(h >>> 9) % PINS.length],
    pinX: (((h >>> 12) % 5) - 2) * 4, // -8..8 px
    dy: ((h >>> 15) % 3) * 4, // 0, 4, 8 px
    clip: stairClip(steps, dir),
  };
}
/** a quadrilateral whose top and bottom edges drop 2px per step, so the note looks tilted but stays on the pixel grid */
function stairClip(steps: number, dir: number) {
  if (!steps) return undefined;
  const n = steps + 1;
  const max = steps * 2;
  const off = (k: number) => (dir > 0 ? k : steps - k) * 2;
  const pct = (k: number) => `${((k / n) * 100).toFixed(2)}%`;
  const pts: string[] = [];
  // top edge, left to right
  for (let k = 0; k < n; k++) pts.push(`${pct(k)} ${off(k)}px`, `${pct(k + 1)} ${off(k)}px`);
  // bottom edge, right to left, parallel to the top
  for (let k = n - 1; k >= 0; k--) pts.push(`${pct(k + 1)} calc(100% - ${max - off(k)}px)`, `${pct(k)} calc(100% - ${max - off(k)}px)`);
  return `polygon(${pts.join(", ")})`;
}

function Pin({ color }: { color: string }) {
  // 6 × 7 pixel push pin: outline, head, highlight, needle
  const map = [".kkkk.", "kHWHHk", "kHHHHk", "khHHhk", ".kkkk.", "..kk..", "..k..."];
  const fill: Record<string, string> = { k: OUTLINE, H: color, W: "#fff8e6", h: shade(color, -0.3) };
  const rects: React.ReactNode[] = [];
  map.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== ".") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill[c]} />);
  }));
  return <svg className="gb-pin" width={12} height={14} viewBox="0 0 6 7" shapeRendering="crispEdges" aria-hidden="true">{rects}</svg>;
}

export function Guestbook({ ownerId, enabled = true }: { ownerId: UserId; enabled?: boolean }) {
  const app = useApp();
  const me = app.me?.id;
  if (app.status !== "ready" || !me) return null;
  const isOwner = me === ownerId;
  if (!enabled) {
    if (!isOwner) return null;
    return (
      <section className="card gb gb-off" aria-label="留言板">
        <div className="gb-off-row">
          <Sticker id="moon" size={36} title="" />
          <p><b>留言板已关闭</b><span className="muted">同窗看不到它，也不能留言。在「编辑」里可以重新打开。</span></p>
        </div>
      </section>
    );
  }
  // only people in one of my rooms (the page itself is gated too; this keeps the board honest on its own)
  if (!isOwner && !app.peopleIds.includes(ownerId)) return null;
  return <Board ownerId={ownerId} me={me} isOwner={isOwner} />;
}

function Board({ ownerId, me, isOwner }: { ownerId: UserId; me: UserId; isOwner: boolean }) {
  const app = useApp();
  const { backend, pushToast } = app;
  const [entries, setEntries] = useState<GuestbookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState<GuestbookEntry | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const owner = app.profiles[ownerId];

  const markFresh = useCallback((id: string) => {
    setFresh((s) => new Set(s).add(id));
    setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(id); return n; }), 1200);
  }, []);
  const upsert = useCallback((e: GuestbookEntry) => {
    setEntries((list) => (list && list.some((x) => x.id === e.id) ? list : [e, ...(list || [])].sort((a, b) => b.createdAt - a.createdAt)));
  }, []);

  useEffect(() => {
    let alive = true;
    backend.listGuestbook(ownerId, limit)
      .then((list) => { if (alive) { setEntries(list); setError(null); } })
      .catch((e) => { if (alive) { setEntries((x) => x || []); setError((e as Error).message || "加载失败"); } });
    return () => { alive = false; };
  }, [backend, ownerId, limit]);

  useEffect(() => backend.subscribeGuestbook(ownerId, (e, kind) => {
    if (kind === "delete") { setEntries((list) => list && list.filter((x) => x.id !== e.id)); return; }
    upsert(e);
    markFresh(e.id);
  }), [backend, ownerId, upsert, markFresh]);

  const list = entries || [];
  const shown = expanded ? list : list.slice(0, FOLD);
  const hidden = list.length - shown.length;
  const mayHaveMore = expanded && list.length >= limit;

  async function remove(e: GuestbookEntry) {
    await backend.deleteGuestbook(e.id);
    setEntries((l) => l && l.filter((x) => x.id !== e.id));
  }

  return (
    <section className="card gb" aria-label="留言板">
      <div className="cardhead">
        <h2>留言板</h2>
        {list.length > 0 && <span className="hint num">{list.length >= limit ? `${limit}+` : list.length} 张</span>}
      </div>
      <div className="cardbody gb-body">
        {!error && (
          <Composer ownerId={ownerId} isOwner={isOwner} ownerName={owner?.name || "同窗"}
            onPosted={(e) => { upsert(e); markFresh(e.id); }} />
        )}
        <div className="gb-cork">
          {entries == null ? (
            <p className="gb-empty muted">正在取下便利贴…</p>
          ) : error ? (
            <p className="gb-empty">
              <b>留言板暂时打不开</b>
              <span className="muted">{error === GB_MISSING ? (isOwner ? error : "数据库还没更新，过一阵再来看看。") : error}</span>
            </p>
          ) : list.length === 0 ? (
            <p className="gb-empty">
              <Sticker id="flower" size={36} title="" />
              <b>{isOwner ? "还没有留言" : "这里还空着"}</b>
              <span className="muted">{isOwner ? "同窗来过会在这里贴便利贴。也可以给自己贴一张备忘。" : `第一个给 ${owner?.name || "TA"} 贴一张吧。`}</span>
            </p>
          ) : (
            <ul className="gb-notes">
              {shown.map((e) => (
                <Note key={e.id} e={e} me={me} isOwner={isOwner} fresh={fresh.has(e.id)} onDelete={() => setConfirm(e)} />
              ))}
            </ul>
          )}
        </div>
        {(hidden > 0 || mayHaveMore || (expanded && list.length > FOLD)) && (
          <div className="gb-more">
            {hidden > 0 && <button className="btn sm" onClick={() => setExpanded(true)}>查看更早的 <span className="num">{hidden}</span> 张</button>}
            {mayHaveMore && <button className="btn sm" onClick={() => setLimit((n) => n + PAGE)}>再往前翻</button>}
            {expanded && list.length > FOLD && <button className="btn sm ghost" onClick={() => setExpanded(false)}>收起</button>}
          </div>
        )}
      </div>
      {confirm && (
        <ConfirmTear e={confirm} me={me} onClose={() => setConfirm(null)}
          onConfirm={async () => {
            try { await remove(confirm); setConfirm(null); }
            catch (err) { pushToast({ title: "没撕下来", body: (err as Error).message }); }
          }} />
      )}
    </section>
  );
}

function Composer({ ownerId, isOwner, ownerName, onPosted }: { ownerId: UserId; isOwner: boolean; ownerName: string; onPosted: (e: GuestbookEntry) => void }) {
  const app = useApp();
  const [text, setText] = useState("");
  const [sticker, setSticker] = useState<string | null>(null);
  const [tray, setTray] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const len = gbLength(text.trim());
  const over = len > GB_MAX_TEXT;
  const can = !busy && !over && (len > 0 || !!sticker);

  async function send(ev?: React.FormEvent) {
    ev?.preventDefault();
    const { text: t, error } = checkGuestbook(text, sticker);
    if (error) { setErr(error); return; }
    setBusy(true); setErr(null);
    try {
      const e = await app.backend.addGuestbook({ ownerId, text: t, sticker });
      onPosted(e);
      setText(""); setSticker(null); setTray(false);
    } catch (e) {
      setErr((e as Error).message || "没贴上，稍后再试");
    } finally { setBusy(false); }
  }

  return (
    <form className="gb-compose" onSubmit={send}>
      <div className="gb-compose-row">
        <input ref={inputRef} className="input" value={text} maxLength={GB_MAX_TEXT * 2} disabled={busy}
          onChange={(e) => { setText(e.target.value); if (err) setErr(null); }}
          placeholder={isOwner ? "给自己贴张备忘（不会通知谁）" : `给 ${ownerName} 留句话…`}
          aria-label={isOwner ? "备忘内容" : `给 ${ownerName} 的留言`} />
        <button type="button" className={`btn gb-pick${sticker ? " on" : ""}`} aria-expanded={tray} aria-controls="gb-tray"
          onClick={() => setTray((v) => !v)} title={sticker ? `贴纸：${stickerName(sticker)}` : "选一张贴纸"}>
          {sticker ? <Sticker id={sticker} size={18} title="" /> : <Sticker id="star" size={18} title="" />}
          <span className="gb-pick-label">{sticker ? stickerName(sticker) : "贴纸"}</span>
        </button>
        <button type="submit" className="btn primary" disabled={!can}>{busy ? "贴…" : "贴上"}</button>
      </div>
      {(len > 0 || err) && (
        <div className="gb-compose-meta">
          <span className="gb-err" role="alert">{err}</span>
          {len > 0 && <span className={`num ${over ? "gb-over" : "muted"}`}>{len}/{GB_MAX_TEXT}</span>}
        </div>
      )}
      {tray && (
        <div className="gb-tray" id="gb-tray" role="group" aria-label="选一张贴纸">
          {STICKERS.map((s) => (
            <button type="button" key={s.id} className="gb-tray-item" aria-pressed={sticker === s.id} title={s.name}
              onClick={() => { setSticker((cur) => (cur === s.id ? null : s.id)); setTray(false); inputRef.current?.focus(); }}>
              <Sticker id={s.id} size={36} title="" />
              <span>{s.name}</span>
            </button>
          ))}
          {sticker && <button type="button" className="btn sm ghost gb-tray-clear" onClick={() => { setSticker(null); setTray(false); }}>不要贴纸</button>}
        </div>
      )}
    </form>
  );
}

function Note({ e, me, isOwner, fresh, onDelete }: { e: GuestbookEntry; me: UserId; isOwner: boolean; fresh: boolean; onDelete: () => void }) {
  const app = useApp();
  const look = useMemo(() => lookFor(e.id), [e.id]);
  const p = app.profiles[e.authorId];
  const mine = e.authorId === me;
  const name = mine ? "我" : p?.name || "同窗";
  const canDelete = mine || isOwner;
  const solo = !!e.sticker && !e.text;
  const style = { "--dy": `${look.dy}px`, "--pin-x": `${look.pinX}px` } as React.CSSProperties;
  const by = (
    <div className="gb-by">
      <Avatar p={p} size={18} showSky={false} />
      <span className="gb-name">{name}</span>
      <time className="muted num" dateTime={new Date(e.createdAt).toISOString()} title={new Date(e.createdAt).toLocaleString()}>{ago(e.createdAt, app.now)}</time>
      {canDelete && (
        <button type="button" className="iconbtn gb-del" onClick={onDelete} aria-label={mine ? "撕掉我的这张" : `撕掉 ${name} 的这张`} title="撕掉">
          <ITrash />
        </button>
      )}
    </div>
  );
  return (
    <li className={`gb-note${solo ? " solo" : ""}${fresh ? " fresh" : ""}`} style={style}>
      {solo ? (
        <>
          <div className="gb-solo-art"><Sticker id={e.sticker!} size={72} /></div>
          <div className="gb-tag">{by}</div>
        </>
      ) : (
        <>
          <Pin color={look.pin} />
          <div className="gb-paper" style={{ background: look.paper, clipPath: look.clip }}>
            {e.sticker && <Sticker id={e.sticker} size={54} className="gb-paper-sticker" />}
            {e.text && <p className="gb-text">{e.text}</p>}
            {by}
          </div>
        </>
      )}
    </li>
  );
}

function ConfirmTear({ e, me, onClose, onConfirm }: { e: GuestbookEntry; me: UserId; onClose: () => void; onConfirm: () => Promise<void> }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const mine = e.authorId === me;
  const name = app.profiles[e.authorId]?.name || "同窗";
  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="gb-tear-title" onClick={(ev) => { if (ev.target === ev.currentTarget && !busy) onClose(); }}>
      <div className="sheet card gb-sheet">
        <h1 id="gb-tear-title" style={{ fontSize: 22 }}>{mine ? "撕掉这张便利贴？" : `撕掉 ${name} 的便利贴？`}</h1>
        <div className="gb-sheet-preview">
          {e.sticker && <Sticker id={e.sticker} size={36} />}
          <p>{e.text || <span className="muted">一张「{stickerName(e.sticker)}」贴纸</span>}</p>
        </div>
        <p className="muted">撕掉以后谁都看不到了，没法找回。</p>
        <div className="gb-sheet-nav">
          <button ref={cancelRef} className="btn ghost" onClick={onClose} disabled={busy}>留着</button>
          <button className="btn danger" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
            {busy ? "撕…" : "撕掉"}
          </button>
        </div>
      </div>
    </div>
  );
}
