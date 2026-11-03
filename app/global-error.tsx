"use client";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f8e6bd", color: "#3a2016" }}>
        <h1>同窗出错了</h1>
        <p>请刷新页面。如果反复出现，把这段信息发给开发者：</p>
        <pre style={{ whiteSpace: "pre-wrap", background: "#fff6dc", padding: 12 }}>{error.message}</pre>
        <button onClick={() => location.reload()} style={{ padding: "8px 16px" }}>刷新页面</button>
      </body>
    </html>
  );
}
