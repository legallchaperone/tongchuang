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
  const [mode, setMode] = useState<"in" | "code" | "up">("in");
  /** after an email went out: waiting for the code from it */
  const [verify, setVerify] = useState<null | "signup" | "login">(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cool, setCool] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const demo = app.backend.mode === "demo";
  const cfg = configStatus();
  const [isLocal, setIsLocal] = useState(true);
  useEffect(() => { setIsLocal(/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)); }, []);
  useEffect(() => { if (app.status === "ready") router.replace(next); }, [app.status, next, router]);
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(cool - 1), 1000); return () => clearTimeout(t); }, [cool]);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (err) { setMsg({ ok: false, text: (err as Error).message }); } finally { setBusy(false); }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      if (demo) { await app.backend.signInWithPassword("", ""); return; }
      if (verify) { await app.backend.verifyEmailCode(email.trim(), code, verify); return; }
      if (mode === "in") {
        try { await app.backend.signInWithPassword(email.trim(), pw); }
        catch (err) {
          // signed up but never confirmed: go straight to the code step
          if (/还没完成验证/.test((err as Error).message)) { setVerify("signup"); setMsg({ ok: false, text: (err as Error).message }); return; }
          throw err;
        }
      } else if (mode === "up") {
        const r = await app.backend.signUp(email.trim(), pw);
        if (r.needsConfirm) { setVerify("signup"); setCool(60); }
      } else {
        await app.backend.sendMagicLink(email.trim());
        setVerify("login"); setCool(60);
      }
    });
  }

  function resend() {
    run(async () => {
      if (verify === "signup") await app.backend.resendSignupEmail(email.trim());
      else await app.backend.sendMagicLink(email.trim());
      setCool(60);
      setMsg({ ok: true, text: "已重新发送" });
    });
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
              <div style={{ color: "var(--ink)", padding: "4px 4px 0", display: "flex", justifyContent: "space-between" }}><span>{x.city}</span><span className="num" suppressHydrationWarning>{hhmm(app.now, x.p.tz)}</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="form">
        <form onSubmit={submit} className="card" style={{ padding: 12 }}>
          {verify ? (
            <>
              <div>
                <h1 style={{ fontSize: 22 }}>{verify === "signup" ? "验证你的邮箱" : "输入登录验证码"}</h1>
                <p className="muted" style={{ marginTop: 6 }}>验证码已发到 <b style={{ color: "var(--ink)", fontWeight: 400 }}>{email}</b>。没看到的话，翻一下垃圾邮件和广告邮件。</p>
              </div>
              <div className="field">
                <label className="label" htmlFor="otp">邮件里的验证码</label>
                <input id="otp" className="input num" inputMode="numeric" autoComplete="one-time-code" autoFocus required
                  maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{ fontSize: 24, height: 48, letterSpacing: ".3em", textAlign: "center" }} placeholder="······" />
              </div>
              <button className="btn primary lg" disabled={busy || code.length < 6} type="submit">{busy ? "验证中…" : verify === "signup" ? "完成注册" : "登录"}</button>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn sm ghost" disabled={busy || cool > 0} onClick={resend}>{cool > 0 ? `${cool} 秒后可重新发送` : "重新发送"}</button>
                <button type="button" className="btn sm ghost" onClick={() => { setVerify(null); setCode(""); setMsg(null); }}>换个邮箱</button>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>邮件里如果是一个链接而不是数字，也可以直接点链接完成验证。</p>
            </>
          ) : (
            <>
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
                  <button type="button" aria-pressed={mode === "in"} onClick={() => { setMode("in"); setMsg(null); }}>密码登录</button>
                  <button type="button" aria-pressed={mode === "code"} onClick={() => { setMode("code"); setMsg(null); }}>邮箱验证码</button>
                  <button type="button" aria-pressed={mode === "up"} onClick={() => { setMode("up"); setMsg(null); }}>注册</button>
                </div>
              )}
              {!demo && (
                <div className="field">
                  <label className="label" htmlFor="email">邮箱</label>
                  <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              )}
              {!demo && mode !== "code" && (
                <div className="field">
                  <label className="label" htmlFor="pw">密码</label>
                  <input id="pw" className="input" type="password" required minLength={6} autoComplete={mode === "up" ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
                </div>
              )}
              <button className="btn primary lg" disabled={busy} type="submit">{busy ? "请稍候…" : demo ? "进入演示" : mode === "in" ? "登录" : mode === "up" ? "注册" : "发送验证码"}</button>
              {!demo && mode === "up" && <p className="muted" style={{ fontSize: 12 }}>如果需要验证邮箱，会收到一封带验证码的邮件，在这个页面输入就行。</p>}
            </>
          )}
          {msg && <p style={{ color: msg.ok ? "var(--good)" : "var(--bad)" }}>{msg.text}</p>}
        </form>
      </div>
    </div>
  );
}
