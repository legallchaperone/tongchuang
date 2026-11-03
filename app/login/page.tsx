"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { hhmm } from "@/lib/time";
import { Logo } from "@/components/Icons";

export default function LoginPage() {
  return <Suspense fallback={null}><Login /></Suspense>;
}

const CLOCKS = [["上海", "Asia/Shanghai"], ["伦敦", "Europe/London"], ["纽约", "America/New_York"]];

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
        <div className="logo" style={{ padding: 0, color: "#f2f4f8" }}><span style={{ width: 28, display: "inline-flex", color: "#20263f" }}><Logo /></span> 同窗</div>
        <div>
          <h1>你那边是深夜，<br />我这边刚天亮。</h1>
          <p>和隔着时差的朋友一起专注。看得见彼此在学什么、学了多久，约好的番茄钟同时开始，每一段专注都留下记录。</p>
        </div>
        <div className="clocks">
          {CLOCKS.map(([n, tz]) => <div key={tz} className="num">{hhmm(app.now, tz)}<small>{n}</small></div>)}
        </div>
      </div>
      <div className="form">
        <form onSubmit={submit}>
          <div>
            <h1 style={{ fontSize: 22 }}>{demo ? "体验同窗" : mode === "up" ? "创建账号" : "登录"}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{demo ? "当前是演示模式：会生成两位模拟的同窗和几个月的示例数据，全部只保存在这个浏览器。" : "用邮箱登录，数据在你的所有设备上同步。"}</p>
          </div>
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
