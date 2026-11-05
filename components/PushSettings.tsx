"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { disablePush, enablePush, isIOS, pushOnHere, pushSupport, type PushSupport } from "@/lib/push";

/** 设置 → 通知: Web Push for this device, or the old “only while the page is open” notifications as a fallback */
export function PushSettings() {
  const app = useApp();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [on, setOn] = useState(false);
  const [perm, setPerm] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSupport(pushSupport());
    setOn(pushOnHere());
    if ("Notification" in window) setPerm(Notification.permission);
  }, []);

  const demo = app.backend.mode === "demo";
  const run = async (f: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await f(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
    setOn(pushOnHere());
    if ("Notification" in window) setPerm(Notification.permission);
  };

  return (
    <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2>通知</h2>
      <p className="muted">同窗戳你、邀请你一起专注、给你点赞、评论或留言时提醒你。</p>

      {support === "ok" && !demo && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {on ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="up">推送已开启</span>
              <span className="muted" style={{ fontSize: 12 }}>关掉页面也能收到。只对这台设备生效。</span>
              <button className="btn sm ghost" disabled={busy} onClick={() => run(() => disablePush(app.backend))}>关闭推送</button>
            </div>
          ) : perm === "denied" ? (
            <span className="muted">通知权限被拒绝了。请在{isIOS() ? "「设置 → 通知 → 同窗」" : "浏览器地址栏左边的站点设置"}里允许通知，再回来开启。</span>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn" disabled={busy} onClick={() => run(() => enablePush(app.backend))}>{busy ? "正在开启…" : "开启推送"}</button>
              <span className="muted" style={{ fontSize: 12 }}>关掉页面也能收到。</span>
            </div>
          )}
        </div>
      )}

      {support === "needs-home-screen" && !demo && (
        <div className="muted" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>在 iPhone 上收推送，要先把同窗放到主屏幕（需要 iOS 16.4 或更新）：</span>
          <span>1. 在 Safari 里点底部的分享按钮，选「添加到主屏幕」；</span>
          <span>2. 从主屏幕上的同窗图标打开，再回到这里点「开启推送」。</span>
        </div>
      )}

      {demo && <span className="muted">演示模式下不能开启推送：数据只在这个浏览器里，没有服务器可以推送。</span>}

      {/* no push here: system notifications while the page is open in the background, as before */}
      {(support === "unsupported" || support === "not-configured" || demo) && (
        <div>
          {perm === "granted" ? <span className="up">页面开着时会弹出系统通知</span>
            : perm === "denied" ? <span className="muted">浏览器已拒绝通知，请在浏览器地址栏的站点设置里开启。</span>
            : "Notification" in (typeof window === "undefined" ? {} : window)
              ? <button className="btn" onClick={async () => setPerm(await Notification.requestPermission())}>开启通知（页面开着时）</button>
              : <span className="muted">这个浏览器不支持通知。</span>}
        </div>
      )}

      {err && <span className="down" role="alert">{err}</span>}
    </section>
  );
}
