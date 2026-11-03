"use client";
import { useEffect, useState } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { console.error(error); }, [error]);
  const detail = `同窗 ${process.env.NEXT_PUBLIC_APP_VERSION || ""} · ${typeof location !== "undefined" ? location.pathname : ""}\n${error.message}\n${(error.stack || "").split("\n").slice(0, 6).join("\n")}`;
  return (
    <div className="center-full" style={{ padding: 16 }}>
      <div className="card pad" style={{ maxWidth: 520, width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <h1>页面出错了</h1>
        <p className="muted">刷新通常就能恢复。如果反复出现，把下面的错误信息发给开发者。</p>
        <pre className="inset" style={{ margin: 0, padding: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 180, overflow: "auto", fontSize: 12 }}>{detail}</pre>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={() => reset()}>重试</button>
          <button className="btn" onClick={() => location.reload()}>刷新页面</button>
          <button className="btn ghost" onClick={() => { navigator.clipboard?.writeText(detail).then(() => setCopied(true)).catch(() => {}); }}>{copied ? "已复制" : "复制错误信息"}</button>
        </div>
      </div>
    </div>
  );
}
