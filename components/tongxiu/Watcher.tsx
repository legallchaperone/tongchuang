"use client";
// R-030 同修: toasts on any page — a classmate handed something in, or feedback arrived for me
import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { getCourse } from "@/lib/courses";

export function TongxiuWatcher() {
  const app = useApp();
  const me = app.status === "ready" ? app.me?.id : undefined;
  const roomKey = app.rooms.map((r) => r.id).join(",");
  useEffect(() => {
    if (!me) return;
    let alive = true;
    let offSubs = () => {};
    const offFb = app.backend.subscribeFeedback(me, () => {
      app.pushToast({ title: "开发者给你的作业写了反馈", ttl: 12000, action: location.pathname.startsWith("/tongxiu/") ? undefined : { label: "去看看", href: "/tongxiu" } });
    });
    app.backend.listCohorts().then(({ cohorts, members }) => {
      if (!alive) return;
      const mine = cohorts.filter((c) => members.some((m) => m.cohortId === c.id && m.userId === me && !m.leftAt));
      if (!mine.length) return;
      offSubs = app.backend.subscribeSubmissions(mine.map((c) => c.id), (s) => {
        // only the first hand-in, not later edits, and not mine
        if (s.userId === me || s.updatedAt - s.firstSubmittedAt > 5000) return;
        const c = mine.find((x) => x.id === s.cohortId);
        const course = c && getCourse(c.courseId);
        const m = course?.milestones.find((x) => x.id === s.milestoneId);
        const p = app.profiles[s.userId];
        const href = `/tongxiu/${s.cohortId}`;
        app.pushToast({
          title: `${p?.name || "同修"} 交了 ${course?.name || ""} ${m?.title || ""}`.trim(),
          body: s.testsTotal ? `测试 ${s.testsPassed ?? 0}/${s.testsTotal}` : undefined, color: p?.color, ttl: 8000,
          action: location.pathname === href ? undefined : { label: "去看看", href },
        });
      });
    }).catch(() => { /* not migrated yet: nothing to watch */ });
    return () => { alive = false; offFb(); offSubs(); };
    // profiles are read when a toast fires; reconnect only when the account or rooms change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, roomKey, app.backend]);
  return null;
}
