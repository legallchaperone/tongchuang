"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { byDay, hourHeatInViewerTz, liveFocusMs, weekRange, withLive } from "@/lib/stats";
import { clock, dayKey, dur, hhmm, hrs, partsIn, phaseAt, phaseLabel, tzCity, tzDiffLabel } from "@/lib/time";
import { Avatar, StatePill, seriesVar } from "@/components/bits";
import { TimezoneBand } from "@/components/Charts";
import { Feed } from "@/components/People";
import { StudyHall } from "@/components/Hall";
import { IBack, ICopy, IHand, IUsers } from "@/components/Icons";
import type { UserId } from "@/lib/types";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const app = useApp();
  const router = useRouter();
  const room = app.rooms.find((r) => r.id === id);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const now = app.now;
  const viewerTz = app.myProfile!.tz;
  const members = useMemo(() => (room ? room.memberIds.map((m) => app.profiles[m]).filter(Boolean) : []), [room, app.profiles]);

  const heat = useMemo(() => {
    const out: Record<string, number[]> = {};
    members.forEach((p) => { out[p.id] = hourHeatInViewerTz(app.sessions.filter((s) => s.userId === p.id), viewerTz, 30, now); });
    return out;
    // recompute every ~minute, not every second
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, app.sessions, viewerTz, Math.floor(now / 60000)]);

  const board = useMemo(() => members.map((p) => {
    const all = withLive(app.sessions, p.id, app.live[p.id], p.tz, now);
    const d = byDay(all, p.tz);
    const week = weekRange(p.tz, now).reduce((a, k) => a + (d.get(k) || 0), 0);
    return { p, week, today: d.get(dayKey(now, p.tz)) || 0 };
  }).sort((a, b) => b.week - a.week), [members, app.sessions, app.live, now]);

  if (!room) {
    return <div className="page"><div className="card empty"><b>找不到这个自习室</b>可能已经退出了。<div style={{ marginTop: 12 }}><Link className="btn sm" href="/rooms">返回自习室列表</Link></div></div></div>;
  }
  const link = typeof location !== "undefined" ? `${location.origin}/join?code=${room.code}` : "";
  async function copy() {
    try { await navigator.clipboard.writeText(`来「同窗」和我一起自习：${link}（邀请码 ${room!.code}）`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { app.pushToast({ title: "复制失败", body: link }); }
  }
  const maxWeek = Math.max(1, ...board.map((b) => b.week));

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <Link href="/rooms" className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 4 }}><IBack />自习室</Link>
          <h1>{room.name}</h1>
          <p className="sub">{members.length} 人 · 横跨 {new Set(members.map((m) => m.tz)).size} 个时区</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="state-pill num" style={{ padding: "4px 10px", letterSpacing: ".15em", fontSize: 24, lineHeight: "24px" }}>{room.code}</span>
          <button className="btn" onClick={copy}><ICopy />{copied ? "已复制" : "复制邀请"}</button>
          {confirmLeave
            ? <><button className="btn danger" onClick={async () => { await app.leaveRoom(room.id); router.push("/rooms"); }}>确认退出</button><button className="btn ghost" onClick={() => setConfirmLeave(false)}>取消</button></>
            : <button className="btn ghost" onClick={() => setConfirmLeave(true)}>退出</button>}
        </div>
      </div>

      <StudyHall ids={room.memberIds} />

      <section className="card">
        <div className="cardhead"><h2>时差</h2><span className="hint">横轴是你的一天（{tzCity(viewerTz)}）</span></div>
        <div className="cardbody"><TimezoneBand people={members} viewerTz={viewerTz} heat={heat} now={now} /></div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="cardhead" style={{ paddingBottom: 12 }}><h2>自习室动态</h2></div>
          <Feed userIds={room.memberIds} limit={15} />
        </section>
        <section className="card">
          <div className="cardhead"><h2>本周榜</h2><span className="hint">各自从当地周一算起</span></div>
          <div className="cardbody lb">
            {board.map((b, i) => (
              <div className="r" key={b.p.id}>
                <span className="rank">{i + 1}</span>
                <Avatar p={b.p} size={28} showSky={false} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}><b style={{ fontWeight: 600 }}>{b.p.name}</b><span className="muted">今日 {dur(b.today)}</span></div>
                  <div className="hbar" style={{ gridTemplateColumns: "1fr", padding: "4px 0 0" }}><div className="track"><div className="fill" style={{ width: `${(b.week / maxWeek) * 100}%`, background: seriesVar(b.p.color) }} /></div></div>
                </div>
                <span className="num" style={{ fontWeight: 500 }}>{hrs(b.week)}h</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
