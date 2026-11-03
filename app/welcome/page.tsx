"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { defaultLook } from "@/lib/pixel";
import { browserTz, hhmm, tzCity } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { CharacterEditor } from "@/components/CharacterEditor";
import { Spinner } from "@/components/bits";
import { Logo } from "@/components/Icons";

export default function WelcomePage() {
  return <Suspense fallback={<Spinner />}><Welcome /></Suspense>;
}

const GOALS = [60, 120, 180, 240, 360, 480];
const STEPS = ["名字", "小人", "节奏", "自习室"];

function Welcome() {
  const app = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const inviteCode = (() => { try { return new URL(next, "http://x").searchParams.get("code"); } catch { return null; } })();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (app.status === "signedOut") router.replace("/login?next=" + encodeURIComponent("/welcome?next=" + encodeURIComponent(next)));
  }, [app.status, next, router]);
  useEffect(() => {
    if (app.myProfile && !p) setP({ ...app.myProfile, look: app.myProfile.look ?? defaultLook(app.myProfile.id), tz: browserTz() });
  }, [app.myProfile, p]);

  if (app.status !== "ready" || !p) return <div className="center-full"><Spinner /></div>;

  async function saveProfile() {
    setBusy(true); setErr(null);
    try { await app.saveProfile({ ...p!, name: p!.name.trim() || "同学", look: p!.look ?? defaultLook(p!.id) }); setStep(3); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function room(kind: "create" | "join") {
    setBusy(true); setErr(null);
    try {
      const r = kind === "create" ? await app.createRoom(roomName.trim() || `${p!.name} 的书房`) : await app.joinRoom(code.trim());
      router.replace(`/rooms/${r.id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  const goalLabel = (m: number) => `${m / 60} 小时`;

  return (
    <div className="welcome">
      <div className="welcome-head">
        <span className="logo" style={{ padding: 0 }}><Logo /> 同窗</span>
        <ol className="steps" aria-label="进度">
          {STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : ""}>{s}</li>)}
        </ol>
      </div>

      <div className="card welcome-card">
        {step === 0 && (
          <form onSubmit={(e) => { e.preventDefault(); if (p.name.trim()) setStep(1); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h1>欢迎来到同窗</h1>
            <p className="muted">这里每个人有一张自己的小书桌。你专注的时候，你的小人会坐到桌前，朋友们打开页面就能看到，不管他们在哪个时区。</p>
            <div className="field">
              <label className="label" htmlFor="w-name">先起个名字，朋友会看到它</label>
              <input id="w-name" className="input" autoFocus maxLength={20} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="例如：小陈" />
            </div>
            <div className="welcome-nav"><span /><button className="btn primary lg" disabled={!p.name.trim()}>下一步</button></div>
          </form>
        )}

        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h1>捏一个你的小人</h1>
            <p className="muted">以后可以在设置里改。窗外是你当地的天色，墙上的钟走的是你的时间。</p>
            <CharacterEditor p={p} onChange={setP} />
            <div className="welcome-nav">
              <button className="btn ghost" onClick={() => setStep(0)}>上一步</button>
              <button className="btn primary lg" onClick={() => setStep(2)}>就是它了</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h1>每天想学多久？</h1>
            <p className="muted">首页的进度格子按这个目标来填满，达成那天会变成绿色。随时可以改。</p>
            <div className="chips" role="group" aria-label="每日目标">
              {GOALS.map((m) => <button key={m} className="chip" aria-pressed={p.dailyGoalMin === m} onClick={() => setP({ ...p, dailyGoalMin: m })} style={{ height: 36, padding: "0 14px" }}>{goalLabel(m)}</button>)}
            </div>
            <div className="field">
              <span className="label">番茄钟</span>
              <div className="seg" role="group" aria-label="番茄钟时长" style={{ alignSelf: "flex-start" }}>
                {[[25, 5], [45, 10], [50, 10], [90, 15]].map(([f, b]) => (
                  <button key={f} aria-pressed={p.pomodoroMin === f} onClick={() => setP({ ...p, pomodoroMin: f, breakMin: b })}>{f} 分 + 休息 {b}</button>
                ))}
              </div>
            </div>
            <div className="inset" style={{ padding: "4px 8px" }}>
              你的时区：<b className="num">{tzCity(p.tz)}</b>，现在 <span className="num">{hhmm(app.now, p.tz)}</span>（自动识别）。你的“今天”按这里算，朋友那边按他们自己的时间算。
            </div>
            {err && <p style={{ color: "var(--bad)" }}>{err}</p>}
            <div className="welcome-nav">
              <button className="btn ghost" onClick={() => setStep(1)}>上一步</button>
              <button className="btn primary lg" disabled={busy} onClick={saveProfile}>{busy ? "保存中…" : "下一步"}</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h1>{inviteCode ? "有人在等你" : "找个地方一起学"}</h1>
            {inviteCode ? (
              <>
                <p className="muted">你是通过邀请链接来的，邀请码 <b className="num">{inviteCode}</b>。加入后你的书桌会出现在大家的书房里。</p>
                {err && <p style={{ color: "var(--bad)" }}>{err}</p>}
                <div className="welcome-nav"><span /><button className="btn primary lg" disabled={busy} onClick={() => router.replace(next)}>加入自习室</button></div>
              </>
            ) : (
              <>
                <p className="muted">自习室是你和朋友共享的书房，最多 12 人。建一个，把邀请链接发给朋友；或者输入朋友给你的邀请码。</p>
                <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <div className="inset" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                    <b style={{ fontWeight: 400 }}>新建自习室</b>
                    <input className="input" id="w-room" maxLength={40} placeholder={`${p.name} 的书房`} value={roomName} onChange={(e) => setRoomName(e.target.value)} />
                    <button className="btn primary" disabled={busy} onClick={() => room("create")}>创建</button>
                  </div>
                  <div className="inset" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                    <b style={{ fontWeight: 400 }}>我有邀请码</b>
                    <input className="input num" id="w-code" maxLength={8} placeholder="ABC123" style={{ textTransform: "uppercase", letterSpacing: ".15em" }} value={code} onChange={(e) => setCode(e.target.value)} />
                    <button className="btn" disabled={busy || !code.trim()} onClick={() => room("join")}>加入</button>
                  </div>
                </div>
                {err && <p style={{ color: "var(--bad)" }}>{err}</p>}
                <div className="welcome-nav"><span /><button className="btn ghost" onClick={() => router.replace("/")}>先自己学，之后再说</button></div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
