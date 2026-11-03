"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { configStatus } from "@/lib/backend";
import { hhmm } from "@/lib/time";
import { Logo } from "@/components/Icons";
import { DeskScene } from "@/components/Pixel";
import type { LiveState, Profile } from "@/lib/types";

export default function LoginPage() {
  return <Suspense fallback={null}><Login /></Suspense>;
}

const mk = (id: string, tz: string, color: number, look: Profile["look"]): Profile => ({ id, name: id, tz, color, look, dailyGoalMin: 240, pomodoroMin: 25, breakMin: 5 });
const SAMPLE: { p: Profile; state: LiveState; city: string }[] = [
  { p: mk("a", "Asia/Shanghai", 0, { skin: 0, hair: 1, hairColor: 1 }), state: "focus", city: "上海" },
  { p: mk("b", "Europe/London", 2, { skin: 2, hair: 2, hairColor: 2 }), state: "break", city: "伦敦" },
  { p: mk("c", "America/New_York", 1, { skin: 1, hair: 4, hairColor: 0 }), state: "focus", city: "纽约" },
];

function Login() {
  const app = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [mode, setMode] = useState<"in" | "up" | "link">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const demo = app.backend.mode === "demo";
  const cfg = configStatus();
  const [isLocal, setIsLocal] = useState(true);
  useEffect(() => { setIsLocal(/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)); }, []);

  useEffect(() => { if (app.status === "ready") router.replace(next); }, [app.status, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (demo) { await app.backend.signInWithPassword("", ""); return; }
      if (mode === "in") await app.backend.signInWithPassword(email, pw);
      else if (mode === "up") {
        const r = await app.backend.signUp(email, pw);
        if (r.needsConfirm) setMsg({ ok: true, text: "注册成功。去邮箱点一下确认链接，然后回来登录。" });
      } else {
        await app.backend.sendMagicLink(email);
        setMsg({ ok: true, text: "登录链接已发到你的邮箱，在这台设备上打开它即可。" });
      }
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="art">
        <div className="logo" style={{ padding: 0, color: "#f2f4f8" }}><Logo /> 同窗</div>
        <div>
          <h1>你那边是深夜，<br />我这边刚天亮。</h1>
          <p>和隔着时差的朋友一起专注。看得见彼此在学什么、学了多久，约好的番茄钟同时开始，每一段专注都留下记录。</p>
        </div>
        <div className="hallpreview" aria-label="示意：三个时区的书桌">
          {SAMPLE.map((x) => (
            <div key={x.p.id} className="card" style={{ minWidth: 0 }}>
              <DeskScene p={x.p} live={{ userId: x.p.id, state: x.state, task: "", subjectName: "", subjectColor: null, mode: "pomodoro", startedAt: 0, plannedEnd: null, accumulatedMs: 0, runningSince: 0, updatedAt: 0 }} present={x.state !== "idle"} maxScale={3} />
              <div style={{ color: "var(--ink)", padding: "4px 4px 0", display: "flex", justifyContent: "space-between" }}><span>{x.city}</span><span className="num">{hhmm(app.now, x.p.tz)}</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="form">
        <form onSubmit={submit} className="card" style={{ padding: 12 }}>
          <div>
            <h1 style={{ fontSize: 22 }}>{demo ? "体验同窗" : mode === "up" ? "创建账号" : "登录"}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{demo ? "当前是演示模式：会生成两位模拟的同窗和几个月的示例数据，全部只保存在这个浏览器。" : "用邮箱登录，数据在你的所有设备上同步。"}</p>
          </div>
          {demo && !isLocal && (
            <div className="config-warn">
              网站还没连上数据库，所以现在是演示模式。请在 Vercel → Settings → Environment Variables 里确认有{" "}
              {!cfg.url && <code>NEXT_PUBLIC_SUPABASE_URL</code>}{!cfg.url && !cfg.key && " 和 "}{!cfg.key && <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>}
              ，然后到 Deployments 里对最新一次部署点 Redeploy（变量只在构建时生效）。
            </div>
          )}
          {!demo && (
            <div className="seg" role="group" aria-label="登录方式" style={{ alignSelf: "flex-start" }}>
              <button type="button" aria-pressed={mode === "in"} onClick={() => setMode("in")}>密码登录</button>
              <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")}>邮件链接</button>
              <button type="button" aria-pressed={mode === "up"} onClick={() => setMode("up")}>注册</button>
            </div>
          )}
          {!demo && (
            <div className="field">
              <label className="label" htmlFor="email">邮箱</label>
              <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          {!demo && mode !== "link" && (
            <div className="field">
              <label className="label" htmlFor="pw">密码</label>
              <input id="pw" className="input" type="password" required minLength={6} autoComplete={mode === "up" ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
          )}
          <button className="btn primary lg" disabled={busy} type="submit">{busy ? "请稍候…" : demo ? "进入演示" : mode === "in" ? "登录" : mode === "up" ? "注册" : "发送登录链接"}</button>
          {msg && <p style={{ color: msg.ok ? "var(--good)" : "var(--bad)" }}>{msg.text}</p>}
        </form>
      </div>
    </div>
  );
}
