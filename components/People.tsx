"use client";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { liveFocusMs, todayMs as todayFocus } from "@/lib/stats";
import type { DailyReview, Session, UserId } from "@/lib/types";
import { ago, clock, dayKey, dur, hhmm, partsIn, phaseAt, phaseLabel, tzCity, tzDiffLabel } from "@/lib/time";
import { IHand, IUsers } from "./Icons";
import { Avatar, seriesVar, StatePill } from "./bits";

/** one classmate row with live status and quick actions */
export function PersonRow({ id }: { id: UserId }) {
  const app = useApp();
  const focus = useFocus();
  const p = app.profiles[id];
  const l = app.live[id];
  const [sent, setSent] = useState<string | null>(null);
  if (!p || !app.myProfile) return null;
  const isMe = id === app.me?.id;
  const now = app.now;
  const h = partsIn(now, p.tz).h;
  const phase = phaseAt(h);
  const on = app.online.has(id);
  const focusMs = liveFocusMs(l, now);
  const left = l?.plannedEnd ? l.plannedEnd - now : null;
  const tz = p.tz;
  const todayMs = todayFocus(app.sessions, id, l, tz, now);

  async function signal(kind: "poke" | "invite") {
    try {
      if (kind === "poke") await app.sendSignal({ kind: "poke", to: id });
      else {
        const minutes = app.myProfile!.pomodoroMin;
        await app.sendSignal({ kind: "invite", to: id, mode: "pomodoro", minutes, task: focus.state?.task || "" });
      }
      setSent(kind === "poke" ? "已戳" : "已邀请");
      setTimeout(() => setSent(null), 2500);
    } catch (e) { app.pushToast({ title: "没发出去", body: (e as Error).message }); }
  }

  return (
    <div className="person">
      <Avatar p={p} size={40} live={l} />
      <div style={{ minWidth: 0 }}>
        <div className="nm"><span className="t">{p.name}{isMe ? "（你）" : ""}</span>{on && !isMe && <span className="online-dot" title="正在使用同窗" />}<StatePill l={l} /></div>
        <div className="what">
          {l?.state === "focus" || l?.state === "paused" ? (
            <>{l.subjectName && <span className="subj"><span className="dot" style={{ background: seriesVar(l.subjectColor) }} />{l.subjectName}</span>} {l.task || "专注中"}</>
          ) : l?.state === "break" ? "休息一下" : l?.updatedAt ? `${ago(l.updatedAt, now)}活跃` : "还没开始"}
        </div>
        <div className="where">{tzCity(tz)} {hhmm(now, tz)} · {phaseLabel[phase]}{isMe ? "" : ` · ${tzDiffLabel(tz, app.myProfile.tz, now)}`}</div>
      </div>
      <div className="right">
        <span className="timer">{l?.state === "focus" || l?.state === "paused" ? (left != null && left > 0 ? clock(left) : clock(focusMs)) : l?.state === "break" && left ? clock(Math.max(0, left)) : <span className="muted" style={{ fontSize: 12 }}>今日 {dur(todayMs)}</span>}</span>
        {!isMe && (
          <span className="acts">
            {sent ? <span className="muted" style={{ fontSize: 12, padding: "6px 4px" }}>{sent} ✓</span> : <>
              <button className="iconbtn" title="戳一下" aria-label={`戳一下 ${p.name}`} onClick={() => signal("poke")}><IHand /></button>
              <button className="iconbtn" title="邀请一起专注" aria-label={`邀请 ${p.name} 一起专注`} onClick={() => signal("invite")}><IUsers /></button>
            </>}
          </span>
        )}
      </div>
    </div>
  );
}

export function PeopleList({ ids, emptyHint = true }: { ids: UserId[]; emptyHint?: boolean }) {
  const app = useApp();
  const order = useMemo(() => {
    const rank = (id: UserId) => { const s = app.live[id]?.state; return s === "focus" ? 0 : s === "paused" ? 1 : s === "break" ? 2 : 3; };
    return [...ids].sort((a, b) => (a === app.me?.id ? 1 : b === app.me?.id ? -1 : rank(a) - rank(b)));
  }, [ids, app.live, app.me]);
  if (ids.length <= 1 && emptyHint) {
    return (
      <div className="empty">
        <b>还没有同窗</b>
        创建一个自习室，把邀请码发给朋友。
        <div style={{ marginTop: 12 }}><Link className="btn sm primary" href="/rooms">去创建</Link></div>
      </div>
    );
  }
  return <div className="people">{order.map((id) => <PersonRow key={id} id={id} />)}</div>;
}

const EMOJIS = ["👏", "🔥", "💪"];
const LEVEL = ["很散", "一般", "还行", "专注", "心流"];

/** consecutive sessions of the same task (e.g. a run of pomodoros) shown as one entry */
export function groupSessions(list: Session[]) {
  const out: Session[][] = [];
  for (const s of list) {
    const g = out[out.length - 1];
    const last = g?.[g.length - 1];
    if (last && last.userId === s.userId && last.task === s.task && last.subjectId === s.subjectId && last.startedAt - s.endedAt < 20 * 60_000 && last.startedAt - s.endedAt >= -60_000) g.push(s);
    else out.push([s]);
  }
  return out;
}

export function FeedItem({ group }: { group: Session[] }) {
  const app = useApp();
  const s = group[0];
  const first = group[group.length - 1];
  const p = app.profiles[s.userId];
  const subj = app.subjects.find((x) => x.id === s.subjectId);
  const ids = new Set(group.map((x) => x.id));
  const ks = app.kudos.filter((k) => ids.has(k.sessionId));
  const meId = app.me?.id;
  const isMine = s.userId === meId;
  const viewerTz = app.myProfile?.tz || s.tz;
  const total = group.reduce((a, x) => a + x.durationMs, 0);
  const rated = group.filter((x) => x.rating != null);
  const rating = rated.length ? Math.round(rated.reduce((a, x) => a + x.rating!, 0) / rated.length) : null;
  const notes = group.map((x) => x.note).filter(Boolean).reverse();
  const pomos = group.filter((x) => x.mode === "pomodoro").length;
  const groups = EMOJIS.map((e) => ({ e, list: ks.filter((k) => k.emoji === e) })).filter((g) => g.list.length || !isMine);
  async function toggle(e: string) {
    const mineK = ks.find((k) => k.emoji === e && k.fromUser === meId);
    try { await app.toggleKudos(mineK ? mineK.sessionId : s.id, e); } catch (err) { app.pushToast({ title: "操作失败", body: (err as Error).message }); }
  }
  return (
    <div className="fi">
      <Avatar p={p} size={32} showSky={false} />
      <div style={{ minWidth: 0 }}>
        <div className="line1">
          <b>{isMine ? "我" : p?.name || "同窗"}</b><span className="muted">专注了</span><span className="d">{dur(total)}</span>
          {pomos > 1 && <span className="count">· {pomos} 个番茄</span>}
          {rating != null && <span className="count">· {LEVEL[rating - 1]}</span>}
        </div>
        <div className="task">
          {subj && <span className="subj" style={{ marginRight: 6 }}><span className="dot" style={{ background: seriesVar(subj.color) }} />{subj.name}</span>}
          {s.task || "自习"}
        </div>
        {notes.map((n, i) => <div className="note" key={i}>{n}</div>)}
        <div className="meta">
          <span className="num">{hhmm(first.startedAt, viewerTz)}–{hhmm(s.endedAt, viewerTz)}</span>
          {s.tz !== viewerTz && <span>{p?.name || "对方"}当地 <span className="num">{hhmm(first.startedAt, s.tz)}–{hhmm(s.endedAt, s.tz)}</span></span>}
        {groups.length > 0 && (
          <div className="kudos" style={{ marginLeft: "auto", marginTop: 0 }}>
            {groups.map(({ e, list }) => {
              const mine = list.some((k) => k.fromUser === meId);
              const names = Array.from(new Set(list.map((k) => app.profiles[k.fromUser]?.name || "同窗"))).join("、");
              return (
                <button key={e} className={`kudo ${mine ? "mine" : ""} ${list.length ? "" : "add"}`} disabled={isMine} title={names || "鼓励一下"} aria-label={`${e} ${names}`} onClick={() => toggle(e)}>
                  {e}{list.length > 0 && <span className="num">{list.length}</span>}
                </button>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

/** R-007: “小陈收工了 · 今天 4小时12分” */
export function ReviewFeedItem({ r }: { r: DailyReview }) {
  const app = useApp();
  const p = app.profiles[r.userId];
  const isMine = r.userId === app.me?.id;
  const viewerTz = app.myProfile?.tz || r.tz;
  return (
    <div className="fi fi-wrap">
      <Avatar p={p} size={32} showSky={false} />
      <div style={{ minWidth: 0 }}>
        <div className="line1">
          <b>{isMine ? "我" : p?.name || "同窗"}</b><span className="muted">收工了 · 今天</span><span className="d">{dur(r.totalMs)}</span>
          <span className="wrap-moon" aria-hidden="true" />
        </div>
        {r.note && <div className="note">明天先：{r.note}</div>}
        <div className="meta">
          <span className="num">{hhmm(r.updatedAt, viewerTz)}</span>
          {r.tz !== viewerTz && <span>{p?.name || "对方"}当地 <span className="num">{hhmm(r.updatedAt, r.tz)}</span></span>}
        </div>
      </div>
    </div>
  );
}

export function Feed({ userIds, limit = 30 }: { userIds: UserId[]; limit?: number }) {
  const app = useApp();
  const tz = app.myProfile?.tz || "UTC";
  const groups = useMemo(() => {
    const set = new Set(userIds);
    return groupSessions(app.sessions.filter((s) => set.has(s.userId)).slice(0, limit * 4)).slice(0, limit);
  }, [app.sessions, userIds, limit]);
  // R-007: 收工 entries, merged into the stream by time
  const reviews = useMemo(() => {
    const set = new Set(userIds);
    const oldest = groups.length >= limit ? groups[groups.length - 1][0].startedAt : app.now - 14 * 86400000;
    return app.reviews.filter((r) => set.has(r.userId) && r.updatedAt >= oldest).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [app.reviews, userIds, groups, limit]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!groups.length && !reviews.length) return <div className="empty"><b>还没有动态</b>完成一次专注，就会出现在这里。</div>;
  const out: React.ReactNode[] = [];
  let last = "";
  const today = dayKey(app.now, tz);
  const divider = (t: number) => {
    const k = dayKey(t, tz);
    if (k === last) return;
    const label = k === today ? "今天" : k === dayKey(app.now - 86400000, tz) ? "昨天" : Number(k.slice(5, 7)) + "月" + Number(k.slice(8)) + "日";
    out.push(<div className="daydiv" key={"d" + k}>{label}</div>);
    last = k;
  };
  let ri = 0;
  const flushReviews = (after: number) => {
    for (; ri < reviews.length && reviews[ri].updatedAt >= after; ri++) {
      divider(reviews[ri].updatedAt);
      out.push(<ReviewFeedItem key={"r" + reviews[ri].userId + reviews[ri].day} r={reviews[ri]} />);
    }
  };
  for (const g of groups) {
    flushReviews(g[0].endedAt);
    divider(g[0].startedAt);
    out.push(<FeedItem key={g[0].id} group={g} />);
  }
  flushReviews(-Infinity);
  return <div className="feed">{out}</div>;
}
