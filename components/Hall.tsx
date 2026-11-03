"use client";
import React, { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { liveFocusMs, todayMs } from "@/lib/stats";
import type { UserId } from "@/lib/types";
import { clock, dayKey, dur, hhmm, partsIn, phaseAt, tzCity, tzDiffLabel } from "@/lib/time";
import { DeskScene } from "./Pixel";
import { livePrefix } from "@/lib/focusModes";
import { seriesVar, StatePill } from "./bits";
import { IHand, IUsers } from "./Icons";
import { shownStatus } from "@/lib/status";
import { SetStatusLink, StatusLine } from "./Status";

/** one person's desk: their little room plus a name plate */
export function DeskCard({ id, compact = false }: { id: UserId; compact?: boolean }) {
  const app = useApp();
  const focus = useFocus();
  const p = app.profiles[id];
  const l = app.live[id];
  const [sent, setSent] = useState<string | null>(null);
  if (!p || !app.myProfile) return null;
  const now = app.now;
  const isMe = id === app.me?.id;
  const ms = liveFocusMs(l, now);
  const left = l?.plannedEnd ? l.plannedEnd - now : null;
  const h = partsIn(now, p.tz).h;
  const active = l?.state === "focus" || l?.state === "paused";
  const today = todayMs(app.sessions, id, l, p.tz, now);
  const present = app.online.has(id);
  const st = shownStatus(l, now);

  async function send(kind: "poke" | "invite") {
    try {
      if (kind === "poke") await app.sendSignal({ kind: "poke", to: id });
      else await app.sendSignal({ kind: "invite", to: id, mode: "pomodoro", minutes: app.myProfile!.pomodoroMin, task: focus.state?.task || "" });
      setSent(kind === "poke" ? "已戳" : "已邀请"); setTimeout(() => setSent(null), 2500);
    } catch (e) { app.pushToast({ title: "没发出去", body: (e as Error).message }); }
  }

  return (
    <div className="card deskcard">
      <DeskScene p={p} live={l} present={present} maxScale={compact ? 3 : 5} />
      <div className="plate">
        <div className="nm">
          <b>{p.name}{isMe ? "（你）" : ""}</b>
          {!isMe && present && <span className="online-dot" title="正开着同窗" />}
          <StatePill l={l} />
        </div>
        <span className="timer num" style={{ color: active ? "var(--ink)" : "var(--ink-3)" }}>
          {active ? <><small className="pre">{livePrefix(l, now)}</small>{left != null && left > 0 ? clock(left) : clock(ms)}</> : l?.state === "break" && left ? clock(Math.max(0, left)) : "--:--"}
        </span>
        <div className="what">
          {active
            ? <>{l!.subjectName && <span className="subj" style={{ marginRight: 6 }}><span className="dot" style={{ background: seriesVar(l!.subjectColor) }} />{l!.subjectName}</span>}{l!.task || "专注中"}</>
            : l?.state === "break" ? "起来喝口水"
            : st ? <StatusLine s={st} mine={isMe} now={now} />
            : isMe ? <SetStatusLink />
            : phaseAt(h) === "night" && !present ? "大概在睡觉" : "不在书桌前"}
        </div>
        <div className="foot">
          <span>{tzCity(p.tz)} {hhmm(now, p.tz)}{isMe ? "" : ` · ${tzDiffLabel(p.tz, app.myProfile.tz, now)}`} · 今日 {dur(today)}</span>
          {!isMe && (sent ? <span>{sent} ✓</span> : (
            <span style={{ display: "flex", gap: 2, margin: "-4px -4px -4px 0" }}>
              <button className="iconbtn" title="戳一下" aria-label={`戳一下 ${p.name}`} onClick={() => send("poke")}><IHand /></button>
              <button className="iconbtn" title="邀请一起专注" aria-label={`邀请 ${p.name} 一起专注`} onClick={() => send("invite")}><IUsers /></button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StudyHall({ ids }: { ids: UserId[] }) {
  const app = useApp();
  const order = useMemo(() => {
    const rank = (id: UserId) => { const s = app.live[id]?.state; return s === "focus" ? 0 : s === "paused" ? 1 : s === "break" ? 2 : 3; };
    return [...ids].sort((a, b) => (a === app.me?.id ? -1 : b === app.me?.id ? 1 : rank(a) - rank(b)));
  }, [ids, app.live, app.me]);
  return <div className="hall">{order.map((id) => <DeskCard key={id} id={id} />)}</div>;
}
