"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { clock } from "@/lib/time";
import { IBook, IPlay, IRoom, ISettings, IStats, IToday, Logo } from "./Icons";
import { Avatar, Spinner } from "./bits";
import { StatusButton } from "./Status";
import { TongxiuWatcher } from "./tongxiu/Watcher";

const NAV = [
  { href: "/", label: "今天", icon: <IToday /> },
  { href: "/rooms", label: "自习室", icon: <IRoom /> },
  { href: "/tongxiu", label: "同修", icon: <IBook /> },
  { href: "/stats", label: "数据", icon: <IStats /> },
  { href: "/settings", label: "设置", icon: <ISettings /> },
];

/** the phone tab bar has room for four around the focus button; 同修 is reached from the 自习室 page there */
const TABS = NAV.filter((n) => n.href !== "/tongxiu");

export function useAuthGate() {
  const app = useApp();
  const router = useRouter();
  const path = usePathname();
  const needsOnboarding = app.status === "ready" && !!app.myProfile && app.myProfile.look == null;
  useEffect(() => {
    const here = path + (typeof location !== "undefined" ? location.search : "");
    if (app.status === "signedOut") router.replace("/login?next=" + encodeURIComponent(here));
    else if (needsOnboarding) router.replace("/welcome?next=" + encodeURIComponent(here));
  }, [app.status, router, path, needsOnboarding]);
  return app.status === "ready" && !needsOnboarding;
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
              <span className="t">{f.plannedMs && left < 0 ? "+" + clock(-left) : clock(Math.max(0, left))}</span>
              <small>{f.phase === "break" ? "休息中" : f.runningSince ? (f.mode === "stopwatch" ? "心流 · " : "") + (f.task || "专注中") : "已暂停"}</small>
            </span>
          </Link>
        )}
        {app.backend.mode === "demo" && <div className="demo-banner">演示模式：数据只保存在这个浏览器里，同窗是模拟的。配置 Supabase 后即可和真实好友同步。</div>}
        {app.myProfile && <StatusButton variant="rail" />}
        {app.myProfile && (
          <Link href={`/u/${encodeURIComponent(app.myProfile.id)}`} className="me-chip" title="我的主页"><Avatar p={app.myProfile} size={28} showSky={false} live={app.me ? app.live[app.me.id] : undefined} /><span>{app.myProfile.name}</span></Link>
        )}
      </aside>
      {ready && <TongxiuWatcher />}
      <main className="main">{ready ? children : app.status === "error" ? <ErrorBox msg={app.error} retry={app.reload} /> : <Spinner />}</main>
      <nav className="tabbar">
        {TABS.slice(0, 2).map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>{n.icon}{n.label}</Link>)}
        <Link href="/focus" className={`fab ${f && f.phase !== "breakDone" ? "on" : ""}`} aria-label="专注">
          <span className="circle">{f && f.phase !== "breakDone" ? <span className="num" style={{ fontSize: 11 }}>{clock(Math.max(0, left)).slice(0, 5)}</span> : <IPlay />}</span>
        </Link>
        {TABS.slice(2).map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>{n.icon}{n.label}</Link>)}
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
