"use client";
/* R-020 个人主页：/u/<id>，只有同自习室的人能看（数据层由 RLS 保证，这里给看不到的人一个友好的说明） */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HISTORY_DAYS, useApp } from "@/lib/store";
import { normalizePage } from "@/lib/profilePage";
import { profileStats } from "@/lib/profileStats";
import { IBack } from "@/components/Icons";
import { ProfileView } from "@/components/profile/ProfileView";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { ShareProfileButton } from "@/components/profile/ShareProfile";

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const app = useApp();
  const router = useRouter();
  const p = app.profiles[id];
  const visible = !!p && app.peopleIds.includes(id);
  const isOwner = id === app.me?.id;
  const [editing, setEditing] = useState(false);
  const { ensureHistory } = app;
  // heat map, totals and badges need the long history (the first screen only loads ~35 days)
  useEffect(() => { if (visible) ensureHistory([id], HISTORY_DAYS); }, [ensureHistory, id, visible]);
  useEffect(() => { setEditing(false); }, [id]);

  const minute = Math.floor(app.now / 60000);
  const page = useMemo(() => normalizePage(p?.page), [p?.page]);
  const live = app.live[id];
  const stats = useMemo(
    () => (p ? profileStats({ p, sessions: app.sessions, subjects: app.subjects, live, reviews: app.reviews, now: Date.now() }) : null),
    [p, app.sessions, app.subjects, live, app.reviews, minute], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!visible || !stats) {
    return (
      <div className="page">
        <div className="card pad empty pu-none">
          <b>看不到这个主页</b>
          <p>只有在同一个自习室的同窗才能互相看主页。想看的话，请对方把自习室的邀请码发给你。</p>
          <div className="pu-none-acts">
            <button className="btn sm" onClick={() => router.back()}>返回</button>
            <Link className="btn sm primary" href="/rooms">去自习室</Link>
          </div>
        </div>
      </div>
    );
  }

  if (editing && isOwner) {
    return <div className="page pu"><ProfileEditor p={p} initial={page} stats={stats} onDone={() => setEditing(false)} /></div>;
  }

  return (
    <div className="page pu" aria-busy={app.historyLoading || undefined}>
      <div className="pagehead">
        <div>
          <button className="pu-back muted" onClick={() => router.back()}><IBack />返回</button>
          <h1>{isOwner ? "我的主页" : `${p.name}的主页`}</h1>
          <p className="sub">{isOwner ? "同自习室的同窗能看到这一页" : "只有同自习室的人能看到"}{app.historyLoading && <span role="status"> · 正在加载更早的记录…</span>}</p>
        </div>
        {isOwner && (
          <div className="pu-acts">
            <ShareProfileButton p={p} page={page} stats={stats} disabled={app.historyLoading} />
            <button className="btn sm primary" onClick={() => setEditing(true)}>编辑</button>
          </div>
        )}
      </div>
      <ProfileView p={p} page={page} stats={stats} isOwner={isOwner} />
    </div>
  );
}
