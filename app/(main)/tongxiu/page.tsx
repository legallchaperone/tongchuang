"use client";
// R-030 同修: my cohorts, cohorts in my rooms I could join, and the courses on offer
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { COURSES, getCourse } from "@/lib/courses";
import { useCohorts } from "@/lib/useTongxiu";
import { courseWeek } from "@/lib/tongxiu";
import { Avatar, Spinner } from "@/components/bits";

export default function TongxiuPage() {
  const app = useApp();
  const { cohorts, members, error } = useCohorts();
  const [staff, setStaff] = useState(false);
  useEffect(() => { app.backend.isStaff().then(setStaff).catch(() => {}); }, [app.backend]);
  const me = app.me!.id;
  const tz = app.myProfile!.tz;
  const active = (cid: string) => members.filter((m) => m.cohortId === cid && !m.leftAt);
  const mine = (cohorts || []).filter((c) => active(c.id).some((m) => m.userId === me));
  // a developer can read every cohort; only the ones in my own rooms are worth offering here
  const open = (cohorts || []).filter((c) => !mine.includes(c) && app.rooms.some((r) => r.id === c.roomId));

  const card = (c: NonNullable<typeof cohorts>[number]) => {
    const course = getCourse(c.courseId);
    const room = app.rooms.find((r) => r.id === c.roomId);
    const wk = courseWeek(c, app.now, tz);
    const people = active(c.id);
    return (
      <Link key={c.id} href={`/tongxiu/${c.id}`} className="card roomcard">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <h2>{course?.name || c.courseId} · {c.name}</h2>
          <span className="state-pill">{wk === 0 ? "还没开始" : course && wk > course.weeks ? "已结课" : `第 ${wk} 周`}</span>
        </div>
        <p className="muted">{course?.title || "这门课的课表还没上线"}</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {people.map((m) => <Avatar key={m.userId} p={app.profiles[m.userId]} size={30} live={app.live[m.userId]} />)}
          {!people.length && <span className="muted">还没有人加入</span>}
        </div>
        <div className="foot"><span>{room ? `在「${room.name}」` : ""}</span><span>{c.startsOn} 开课</span></div>
      </Link>
    );
  };

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>同修</h1><p className="sub">和同窗一起修一门课：按周的进度，按时交作业，交了有反馈，看得到彼此学到哪了。</p></div>
        {staff && <Link className="btn" href="/tongxiu/staff">写反馈（开发者）</Link>}
      </div>

      {error && <div className="card pad config-warn">{error}</div>}
      {cohorts == null ? <Spinner /> : (
        <>
          {mine.length > 0 && (
            <section className="stack">
              <h2 className="tx-h">我在修</h2>
              <div className="roomgrid">{mine.map(card)}</div>
            </section>
          )}
          {open.length > 0 && (
            <section className="stack">
              <h2 className="tx-h">自习室里正在开的</h2>
              <div className="roomgrid">{open.map(card)}</div>
            </section>
          )}
        </>
      )}

      <section className="stack">
        <h2 className="tx-h">可以修的课</h2>
        <div className="roomgrid">
          {COURSES.map((c) => (
            <Link key={c.id} href={`/tongxiu/c/${c.id}`} className="card roomcard">
              <h2>{c.name}</h2>
              <p>{c.title}</p>
              <p className="muted">{c.summary}</p>
              <div className="foot"><span>{c.weeks} 周 · {c.milestones.length} 次要交</span><span>{c.hoursPerWeek.split("，")[0]}</span></div>
            </Link>
          ))}
        </div>
        <p className="muted">想修别的课？告诉开发者课程名和官网链接，整理好课表后会出现在这里。</p>
      </section>
    </div>
  );
}
