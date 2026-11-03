"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { Spinner } from "@/components/bits";

export default function JoinPage() {
  return <Suspense fallback={<Spinner />}><Join /></Suspense>;
}

function Join() {
  const app = useApp();
  const router = useRouter();
  const code = useSearchParams().get("code") || "";
  const [err, setErr] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (app.status === "signedOut") { router.replace("/login?next=" + encodeURIComponent("/join?code=" + code)); return; }
    if (app.status !== "ready" || tried.current) return;
    if (app.myProfile && app.myProfile.look == null) { router.replace("/welcome?next=" + encodeURIComponent("/join?code=" + code)); return; }
    tried.current = true;
    app.joinRoom(code).then((r) => router.replace("/rooms/" + r.id)).catch((e) => setErr(e.message));
  }, [app, code, router]);

  if (err) return (
    <div className="center-full"><div className="card pad" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, maxWidth: 380 }}>
      <b>没能加入自习室</b><p className="muted">{err}</p><button className="btn primary" onClick={() => router.replace("/rooms")}>手动输入邀请码</button>
    </div></div>
  );
  return <Spinner />;
}
