"use client";
// R-030 同修: toasts on any page — a classmate handed something in, or feedback arrived for me
import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { getCourse } from "@/lib/courses";
import { starStates } from "@/lib/tongxiu";
import type { TestResults } from "@/lib/types";

export function TongxiuWatcher() {
  const app = useApp();
  const me = app.status === "ready" ? app.me?.id : undefined;
  const roomKey = app.rooms.map((r) => r.id).join(",");
  useEffect(() => {
    if (!me) return;
    let alive = true;
    let offSubs = () => {};
    let offTests = () => {};
    const offFb = app.backend.subscribeFeedback(me, () => {
      app.pushToast({ title: "开发者给你的作业写了反馈", ttl: 12000, action: location.pathname.startsWith("/tongxiu/") ? undefined : { label: "去看看", href: "/tongxiu" } });
    });
    app.backend.listCohorts().then(({ cohorts }) => {
      if (!alive) return;
      // every cohort in my rooms: I may join one while the page is open, and only people who joined report anything
      const mine = cohorts.filter((c) => roomKey.split(",").includes(c.roomId));
      if (!mine.length) return;
      // stars: compare each new report with the last one we saw
      const seen = new Map<string, TestResults>();
      const keyOf = (t: TestResults) => t.cohortId + "/" + t.userId;
      app.backend.listTestResults(mine.map((c) => c.id)).then((ts) => ts.forEach((t) => { if (!seen.has(keyOf(t))) seen.set(keyOf(t), t); })).catch(() => {});
      offTests = app.backend.subscribeTestResults(mine.map((c) => c.id), (t) => {
        const prev = seen.get(keyOf(t));
        seen.set(keyOf(t), t);
        const c = mine.find((x) => x.id === t.cohortId);
        const course = c && getCourse(c.courseId);
        if (!course) return;
        const fresh: string[] = [], done: string[] = [];
        for (const m of course.milestones) {
          if (!m.stars?.length) continue;
          const a = starStates(m, t), b = starStates(m, prev);
          const newly = a.filter((x, i) => x.lit && !b[i].lit);
          if (!newly.length) continue;
          fresh.push(...newly.map((x) => x.star.label));
          if (a.every((x) => x.lit)) done.push(m.title);
        }
        if (!fresh.length) return;
        const mineToo = t.userId === me;
        const p = app.profiles[t.userId];
        const href = `/tongxiu/${t.cohortId}`;
        app.pushToast({
          title: done.length ? `${mineToo ? "你" : p?.name || "同修"}完成了 ${done.join("、")} 🎉` : `${mineToo ? "你" : p?.name || "同修"}点亮了 ★ ${fresh.join("、")}`,
          body: done.length ? `★ ${fresh.join("、")}` : undefined, color: p?.color, ttl: 8000,
          action: location.pathname === href ? undefined : { label: "去看看", href },
        });
      });
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
    return () => { alive = false; offFb(); offSubs(); offTests(); };
    // profiles are read when a toast fires; reconnect only when the account or rooms change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, roomKey, app.backend]);
  return null;
}
