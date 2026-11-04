"use client";
/**
 * R-021 分享一天：「分享今天」按钮、分享预览（可隐藏任务名），以及数据页点某一天时弹出的当天小结。
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { msOnDay, touching, withLive } from "@/lib/stats";
import { dayData, renderDayCard, type CardTheme } from "@/lib/dayCard";
import { ENERGY, IMPACT } from "@/lib/review";
import { DAY, dayKey, dur, hhmm, MIN, weekdayCn, weekdayOfKey } from "@/lib/time";
import type { Session, UserId } from "@/lib/types";
import { lookOf, shirtOf } from "@/components/Pixel";
import { seriesVar, Spinner } from "@/components/bits";
import { ShareIcon, ShareSheet } from "@/components/ShareSheet";

const fmtDay = (k: string) => `${Number(k.slice(5, 7))}月${Number(k.slice(8))}日`;

/** make sure someone's records reach back to `day` (the first screen only loads about 35 days, R-013) */
function useDayLoaded(userId: UserId, day: string, tz: string) {
  const { ensureHistory } = useApp();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    const back = Math.max(1, Math.ceil((Date.now() - Date.parse(day + "T00:00:00Z")) / DAY) + 1);
    ensureHistory([userId], back).finally(() => { if (alive) setOk(true); });
    return () => { alive = false; };
  }, [ensureHistory, userId, day, tz]);
  return ok;
}

/** one person's sessions, the running one included, with the running one's subject filled in by name */
function useSessions(userId: UserId, at?: number) {
  const app = useApp();
  const p = app.profiles[userId];
  const tz = p?.tz || "UTC";
  const now = at ?? app.now;
  const minute = Math.floor(now / MIN);
  return useMemo(() => {
    const l = app.live[userId];
    return withLive(app.sessions, userId, l, tz, now).map((s) => {
      if (s.id !== "live" || !l?.subjectName) return s;
      const sub = app.subjects.find((x) => x.userId === userId && x.name === l.subjectName && !x.archived) || app.subjects.find((x) => x.userId === userId && x.name === l.subjectName);
      return sub ? { ...s, subjectId: sub.id } : s;
    });
  }, [app.sessions, app.live, app.subjects, userId, tz, minute]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ─────────── the share sheet for one of my days ─────────── */
export function DayShareSheet({ day, onClose }: { day: string; onClose: () => void }) {
  const app = useApp();
  const me = app.myProfile!;
  const loaded = useDayLoaded(me.id, day, me.tz);
  // the picture is taken when the sheet opens, so a running session does not redraw it every minute
  const [openedAt] = useState(() => Date.now());
  const sessions = useSessions(me.id, openedAt);
  const [hide, setHide] = useState(false);
  const data = useMemo(() => dayData({
    sessions, subjects: app.subjects.filter((s) => s.userId === me.id), reviews: app.reviews, userId: me.id, tz: me.tz, day,
    goalMs: me.dailyGoalMin * MIN, name: me.name, look: lookOf(me), shirt: shirtOf(me), now: openedAt,
  }), [sessions, app.subjects, app.reviews, me, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const render = useCallback((theme: CardTheme) => renderDayCard(data, theme, hide), [data, hide]);
  const isToday = day === dayKey(app.now, me.tz);
  return (
    <ShareSheet
      title={isToday ? "分享今天" : `分享 ${fmtDay(day)}`}
      render={loaded ? render : null}
      fileName={`tongchuang-day-${day}.png`}
      shareTitle={`${fmtDay(day)}的学习 · 同窗`}
      alt={`${fmtDay(day)}的学习记录卡片：专注 ${dur(data.totalMs)}`}
      tip="只包含你自己这一天的数据。手机上也可以长按图片保存。"
      options={
        <label className="check day-hide">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          隐藏任务名，只显示科目
        </label>
      }
      onClose={onClose}
    />
  );
}

/** a button that opens the share sheet for one of my days (today by default) */
export function ShareDayButton({ day, label = "分享今天", className = "btn sm share-btn" }: { day?: string; label?: string; className?: string }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const d = day || dayKey(app.now, app.myProfile!.tz);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} aria-haspopup="dialog"><ShareIcon />{label}</button>
      {open && <DayShareSheet day={d} onClose={close} />}
    </>
  );
}

/* ─────────── stats page: what happened on a day you clicked ─────────── */
export function DayPeek({ userId, day, onClose }: { userId: UserId; day: string; onClose: () => void }) {
  const app = useApp();
  const p = app.profiles[userId] || app.myProfile!;
  const isMe = userId === app.me?.id;
  const loaded = useDayLoaded(userId, day, p.tz);
  const all = useSessions(userId);
  const [sharing, setSharing] = useState(false);
  const closeShare = useCallback(() => setSharing(false), []);

  const list = useMemo(() => touching(all, p.tz, new Set([day])).sort((a, b) => a.startedAt - b.startedAt), [all, p.tz, day]);
  const total = msOnDay(list, p.tz, day);
  const goal = p.dailyGoalMin * MIN;
  const pct = goal ? Math.round((total / goal) * 100) : 0;
  const subjects = app.subjects.filter((s) => s.userId === userId);
  const review = app.reviews.find((r) => r.userId === userId && r.day === day) || null;
  const pomos = list.filter((s) => s.mode === "pomodoro").length;

  useEffect(() => {
    if (sharing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sharing]);

  if (sharing) return <DayShareSheet day={day} onClose={closeShare} />;

  const when = (s: Session) => {
    const a = dayKey(s.startedAt, p.tz) < day ? "前一天 " : "";
    const b = s.id === "live" ? "现在" : (dayKey(s.endedAt - 1, p.tz) > day ? "次日 " : "") + hhmm(s.endedAt, p.tz);
    return `${a}${hhmm(s.startedAt, p.tz)}–${b}`;
  };

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="peek-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card sheet day-peek">
        <div className="share-head">
          <h2 id="peek-title">{fmtDay(day)} · 星期{weekdayCn[weekdayOfKey(day)]}</h2>
          <button className="btn sm ghost" onClick={onClose} aria-label="关闭" autoFocus>关闭</button>
        </div>
        {!loaded ? <div className="share-wait" style={{ position: "static", minHeight: 120 }}><Spinner /></div> : (
          <>
            <div className="peek-total">
              <div>
                <div className="muted">{isMe ? "这一天专注" : `${p.name}这一天专注`}</div>
                <div className="peek-big num">{dur(total)}</div>
              </div>
              <div className="peek-goal">
                <div className="wrap-goalline"><span className="muted">目标 {dur(goal)}</span><span className="num" style={{ color: pct >= 100 ? "var(--good)" : "var(--ink-2)" }}>{pct}%{pct >= 100 ? " · 达成" : ""}</span></div>
                <div className="progressbar"><div style={{ width: `${Math.min(100, pct)}%` }} /></div>
              </div>
            </div>
            {list.length ? (
              <ul className="peek-list">
                {list.map((s) => {
                  const sub = subjects.find((x) => x.id === s.subjectId);
                  return (
                    <li key={s.id}>
                      <span className="num muted peek-when">{when(s)}</span>
                      <span className="peek-what"><span className="dot" style={{ background: sub ? seriesVar(sub.color) : "var(--ink-3)" }} />{sub?.name ? <b>{sub.name}</b> : null}{s.task ? ` ${s.task}` : sub ? "" : " 自习"}</span>
                      <span className="num">{dur(s.durationMs)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="muted">这一天没有专注记录。</p>}
            {list.length > 0 && <p className="muted peek-sub">{list.length} 次专注{pomos ? ` · ${pomos} 个番茄` : ""}{list.some((s) => dayKey(s.startedAt, p.tz) !== day || dayKey(s.endedAt - 1, p.tz) !== day) ? " · 跨过午夜的只算这一天的部分" : ""}</p>}
            {review && (
              <div className="peek-review">
                <span>精力 <b>{review.energy ? ENERGY[review.energy - 1].label : "—"}</b></span>
                <span>收获 <b>{review.impact ? IMPACT[review.impact - 1].label : "—"}</b></span>
                {review.note && <span className="peek-note"><span className="muted">明天先：</span>{review.note}</span>}
              </div>
            )}
            {isMe && (
              <div className="share-actions">
                <span className="share-sp" />
                <button className="btn primary" onClick={() => setSharing(true)}><ShareIcon />分享这一天</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
