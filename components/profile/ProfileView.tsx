"use client";
/* R-020 个人主页：固定的头部（实时书桌、名字、时区、当前状态、签名）和小组件网格 */
import React from "react";
import { useApp } from "@/lib/store";
import type { Profile } from "@/lib/types";
import type { ProfilePage } from "@/lib/profilePage";
import type { ProfileStats } from "@/lib/profileStats";
import { liveFocusMs } from "@/lib/stats";
import { livePrefix } from "@/lib/focusModes";
import { closedReview } from "@/lib/review";
import { shownStatus } from "@/lib/status";
import { clock, dur, hhmm, partsIn, phaseAt, phaseLabel, tzCity, tzDiffLabel } from "@/lib/time";
import { DeskScene } from "@/components/Pixel";
import { seriesVar, StatePill } from "@/components/bits";
import { SetStatusLink, StatusLine } from "@/components/Status";
import { WidgetCard } from "./Widgets";

export function ProfileHeader({ p, bio, isOwner }: { p: Profile; bio: string; isOwner: boolean }) {
  const app = useApp();
  const now = app.now;
  const l = app.live[p.id];
  const present = app.online.has(p.id);
  const active = l?.state === "focus" || l?.state === "paused";
  const ms = liveFocusMs(l, now);
  const left = l?.plannedEnd ? l.plannedEnd - now : null;
  const st = shownStatus(l, now);
  const closed = closedReview(app.reviews, app.sessions, l, p.id, p.tz, now);
  const h = partsIn(now, p.tz).h;
  const viewerTz = app.myProfile?.tz || p.tz;
  return (
    <section className="card ph">
      <div className="ph-desk"><DeskScene p={p} live={l} present={present} maxScale={4} closed={!!closed} /></div>
      <div className="ph-info">
        <div className="ph-name">
          <h1>{p.name}</h1>
          {!isOwner && present && <span className="online-dot" title="正开着同窗" />}
          <StatePill l={l} />
        </div>
        <p className="ph-where">
          <span>{tzCity(p.tz)} · 当地 <b className="num">{hhmm(now, p.tz)}</b> {phaseLabel[phaseAt(h)]}</span>
          {!isOwner && <span className="muted">{tzDiffLabel(p.tz, viewerTz, now)}</span>}
        </p>
        <div className="ph-now">
          {active ? (
            <>
              <span className="ph-clock num"><small className="pre">{livePrefix(l, now)}</small>{left != null && left > 0 ? clock(left) : clock(ms)}</span>
              <span className="ph-task">{l!.subjectName && <span className="subj"><span className="dot" style={{ background: seriesVar(l!.subjectColor) }} />{l!.subjectName}</span>} {l!.task || "专注中"}</span>
            </>
          ) : l?.state === "break" ? <span>休息中{left && left > 0 ? ` · 还有 ${clock(left)}` : ""}</span>
            : st ? <StatusLine s={st} mine={isOwner} now={now} />
            : closed ? <span>收工了 · 今天 {dur(closed.totalMs)}</span>
            : isOwner ? <SetStatusLink />
            : <span className="muted">{phaseAt(h) === "night" && !present ? "大概在睡觉" : "不在书桌前"}</span>}
        </div>
        {bio ? <p className="ph-bio">“{bio}”</p> : isOwner ? <p className="ph-bio empty muted">还没有签名，在「编辑」里写一句</p> : null}
      </div>
    </section>
  );
}

/** header + widgets as classmates see them (also the editor's preview) */
export function ProfileView({ p, page, stats, isOwner }: { p: Profile; page: ProfilePage; stats: ProfileStats; isOwner: boolean }) {
  const id = p.id; // eslint-disable-line @typescript-eslint/no-unused-vars -- used by the guestbook slot below
  return (
    <>
      <ProfileHeader p={p} bio={page.bio} isOwner={isOwner} />
      {page.widgets.length ? (
        <div className="pgrid">
          {page.widgets.map((w) => <WidgetCard key={w.id} w={w} s={stats} p={p} isOwner={isOwner} />)}
        </div>
      ) : (
        <div className="card pad empty">{isOwner ? <><b>主页上还没有小组件</b>点右上角「编辑」添加几个。</> : <><b>{p.name}的主页还空着</b>以后再来看看。</>}</div>
      )}
      {/* R-020: guestbook slot — <Guestbook ownerId={id} enabled={page.guestbook !== false} /> */}
    </>
  );
}
