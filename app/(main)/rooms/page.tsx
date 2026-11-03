"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { Avatar } from "@/components/bits";
import { tzCity } from "@/lib/time";

export default function RoomsPage() {
  const app = useApp();
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) { setErr("给自习室起个名字"); return; }
    setBusy("create"); setErr(null);
    try { const r = await app.createRoom(name.trim()); router.push(`/rooms/${r.id}`); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function join() {
    if (!code.trim()) { setErr("输入朋友发给你的 6 位邀请码"); return; }
    setBusy("join"); setErr(null);
    try { const r = await app.joinRoom(code.trim()); router.push(`/rooms/${r.id}`); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>自习室</h1><p className="sub">一个自习室最多 12 人。里面的人能看到彼此的实时状态和学习记录。</p></div>
      </div>

      {app.rooms.length > 0 && (
        <div className="roomgrid">
          {app.rooms.map((r) => {
            const focusing = r.memberIds.filter((m) => app.live[m]?.state === "focus").length;
            return (
              <Link key={r.id} href={`/rooms/${r.id}`} className="card roomcard">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <h2>{r.name}</h2>
                  {focusing > 0 && <span className="state-pill focus">{focusing} 人专注中</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {r.memberIds.map((m) => <Avatar key={m} p={app.profiles[m]} size={30} live={app.live[m]} />)}
                </div>
                <div className="foot">
                  <span>{Array.from(new Set(r.memberIds.map((m) => tzCity(app.profiles[m]?.tz || "UTC")))).join(" · ")}</span>
                  <span className="num">{r.code}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2>新建自习室</h2>
          <p className="muted">建好后把邀请码或链接发给朋友。</p>
          <input id="room-name" className="input" placeholder="例如：考研冲刺 / 凌晨三点的图书馆" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <button className="btn primary" disabled={busy != null} onClick={create}>{busy === "create" ? "创建中…" : "创建"}</button>
        </section>
        <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2>用邀请码加入</h2>
          <p className="muted">{app.backend.mode === "demo" ? "演示模式下可以试试 DEMO42。" : "邀请码是 6 位字母和数字。"}</p>
          <input id="room-code" className="input num" placeholder="ABC123" value={code} maxLength={8} style={{ textTransform: "uppercase", letterSpacing: ".15em" }} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()} />
          <button className="btn" disabled={busy != null} onClick={join}>{busy === "join" ? "加入中…" : "加入"}</button>
        </section>
      </div>
      {err && <p style={{ color: "var(--bad)" }}>{err}</p>}
    </div>
  );
}
