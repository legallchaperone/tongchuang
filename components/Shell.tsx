"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { clock } from "@/lib/time";
import { IPlay, IRoom, ISettings, IStats, IToday, Logo } from "./Icons";
import { Avatar, Spinner } from "./bits";

const NAV = [
  { href: "/", label: "今天", icon: <IToday /> },
  { href: "/rooms", label: "自习室", icon: <IRoom /> },
  { href: "/stats", label: "数据", icon: <IStats /> },
  { href: "/settings", label: "设置", icon: <ISettings /> },
];

export function useAuthGate() {
  const app = useApp();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (app.status === "signedOut") router.replace("/login?next=" + encodeURIComponent(path + (typeof location !== "undefined" ? location.search : "")));
  }, [app.status, router, path]);
  return app.status === "ready";
}

export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const focus = useFocus();
  const path = usePathname();
  const ready = useAuthGate();
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const f = focus.state;
  const left = f ? (f.plannedMs ? f.plannedMs - focus.elapsed : focus.elapsed) : 0;

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="logo"><Logo /> 同窗</Link>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>{n.icon}{n.label}</Link>
          ))}
        </nav>
        <div className="grow" />
        {f && f.phase !== "breakDone" && (
          <Link href="/focus" className="minifocus">
            <span className="pulse" style={{ background: f.phase === "break" ? "var(--ink-3)" : f.runningSince ? "var(--lamp)" : "var(--ink-3)" }} />
            <span style={{ minWidth: 0 }}>
              <span className="t">{clock(Math.max(0, left))}</span>
              <small>{f.phase === "break" ? "休息中" : f.runningSince ? f.task || "专注中" : "已暂停"}</small>
            </span>
          </Link>
        )}
        {app.backend.mode === "demo" && <div className="demo-banner">演示模式：数据只保存在这个浏览器里，同窗是模拟的。配置 Supabase 后即可和真实好友同步。</div>}
        {app.myProfile && (
          <Link href="/settings" className="me-chip"><Avatar p={app.myProfile} size={28} showSky={false} /><span>{app.myProfile.name}</span></Link>
        )}
      </aside>
      <main className="main">{ready ? children : app.status === "error" ? <ErrorBox msg={app.error} retry={app.reload} /> : <Spinner />}</main>
      <nav className="tabbar">
        {NAV.slice(0, 2).map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>{n.icon}{n.label}</Link>)}
        <Link href="/focus" className={`fab ${f && f.phase !== "breakDone" ? "on" : ""}`} aria-label="专注">
          <span className="circle">{f && f.phase !== "breakDone" ? <span className="num" style={{ fontSize: 11 }}>{clock(Math.max(0, left)).slice(0, 5)}</span> : <IPlay />}</span>
        </Link>
        {NAV.slice(2).map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>{n.icon}{n.label}</Link>)}
      </nav>
    </div>
  );
}

function ErrorBox({ msg, retry }: { msg: string | null; retry: () => Promise<void> }) {
  return (
    <div className="center-full">
      <div className="card pad" style={{ maxWidth: 420, textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
        <b>没能加载数据</b>
        <p className="muted">{msg || "网络或服务出了问题。"}</p>
        <button className="btn primary" onClick={() => retry()}>重试</button>
      </div>
    </div>
  );
}
