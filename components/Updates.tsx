"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/store";
import { APP_VERSION, BUILD_ID, CHANGELOG, cmpVersion, lastSeenVersion, markVersionSeen } from "@/lib/version";

/** asks the server which build it serves; if it changed since this tab loaded, offer a refresh */
export function UpdateWatcher() {
  const [next, setNext] = useState<{ version: string; build: string } | null>(null);
  useEffect(() => {
    if (BUILD_ID === "dev") return;
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = await r.json();
        if (!stop && j.build && j.build !== BUILD_ID) setNext(j);
      } catch { /* offline: try later */ }
    };
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    const t = setInterval(check, 10 * 60_000);
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  if (!next) return null;
  const bump = next.version && next.version !== APP_VERSION;
  return (
    <div className="update-bar" role="status">
      <span>同窗{bump ? `更新到了 v${next.version}` : "有新版本"}，刷新后生效。正在计时不受影响。</span>
      <span style={{ display: "flex", gap: 6 }}>
        <button className="btn sm primary" onClick={() => location.reload()}>刷新</button>
        <button className="btn sm ghost" onClick={() => setNext(null)}>稍后</button>
      </span>
    </div>
  );
}

/** once per version bump: a short "what's new" note, only for people who used an earlier version */
export function WhatsNew() {
  const app = useApp();
  const path = usePathname();
  const [entries, setEntries] = useState<typeof CHANGELOG>([]);
  useEffect(() => {
    if (app.status !== "ready" || !app.myProfile || app.myProfile.look == null || path.startsWith("/welcome") || path.startsWith("/release")) return;
    const seen = lastSeenVersion();
    if (!seen) { markVersionSeen(); return; } // first visit on this device: nothing to announce
    const fresh = CHANGELOG.filter((e) => cmpVersion(e.version, seen) > 0);
    if (fresh.length) setEntries(fresh.slice(0, 3));
    else if (cmpVersion(seen, APP_VERSION) !== 0) markVersionSeen();
  }, [app.status, app.myProfile, path]);
  if (!entries.length) return null;
  const close = () => { markVersionSeen(); setEntries([]); };
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="wn-title" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="sheet card">
        <div>
          <span className="lp-kicker">v{APP_VERSION}</span>
          <h1 id="wn-title" style={{ marginTop: 8 }}>同窗更新了</h1>
        </div>
        {entries.map((e) => (
          <div key={e.version} className="inset" style={{ padding: "6px 10px" }}>
            <b style={{ fontWeight: 400 }}>{e.title}</b> <span className="muted">v{e.version}</span>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--ink-2)" }}>{e.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        ))}
        <div className="welcome-nav">
          <Link href="/release#changelog" className="btn ghost" onClick={close}>全部更新日志</Link>
          <button className="btn primary lg" onClick={close}>知道了</button>
        </div>
      </div>
    </div>
  );
}
