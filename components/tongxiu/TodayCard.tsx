"use client";
// R-030 同修 on the 今天 page: this week's step, my stars against my classmates', and one button to start on it
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { useFocus } from "@/lib/focus";
import { getCourse } from "@/lib/courses";
import { useCohorts, useCohortWork } from "@/lib/useTongxiu";
import { courseWeek, currentStep, leftLabel, starsLit } from "@/lib/tongxiu";
import { Avatar } from "@/components/bits";
import { IPlay } from "@/components/Icons";
import { Stars } from "./Schedule";

export function TongxiuTodayCard({ style }: { style?: React.CSSProperties }) {
  const app = useApp();
  const meId = app.me!.id;
  const { cohorts, members } = useCohorts();
  const live = (cid: string) => members.filter((m) => m.cohortId === cid && !m.leftAt);
  const mine = (cohorts || []).filter((c) => getCourse(c.courseId) && live(c.id).some((m) => m.userId === meId));
  const cohort = mine.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  const work = useCohortWork(cohort?.id || null);
  const router = useRouter();
  const focus = useFocus();
  if (!cohorts) return null;

  if (!cohort) {
    const open = cohorts.find((c) => getCourse(c.courseId) && app.rooms.some((r) => r.id === c.roomId) && live(c.id).length > 0);
    if (!open) return null;
    const course = getCourse(open.courseId)!;
    const who = live(open.id).map((m) => app.profiles[m.userId]?.name).filter(Boolean);
    return (
      <section className="card" style={style}>
        <div className="cardhead"><h2>同修</h2></div>
        <div className="cardbody tx-form">
          <p>{who.slice(0, 3).join("、")}{who.length > 3 ? ` 等 ${who.length} 人` : ""} 在一起修 {course.name}（{course.title}）。</p>
          <div><Link className="btn primary" href={`/tongxiu/${open.id}`}>一起修</Link></div>
        </div>
      </section>
    );
  }

  const course = getCourse(cohort.courseId)!;
  const me = live(cohort.id).find((m) => m.userId === meId)!;
  const subs = work.subs || [];
  const cur = currentStep(course, cohort, me, subs.filter((s) => s.userId === meId), work.tests[meId], app.now);
  const wk = courseWeek(cohort, app.now, app.myProfile!.tz);
  const board = live(cohort.id).map((m) => ({ m, n: starsLit(course, work.tests[m.userId]) })).sort((a, b) => b.n - a.n);
  const focusing = !!focus.state && focus.state.phase !== "breakDone";

  return (
    <section className="card tx-today" style={style}>
      <div className="cardhead">
        <h2>同修 · {course.name}</h2>
        <Link className="hint" href={`/tongxiu/${cohort.id}`}>{wk > 0 && wk <= course.weeks ? `第 ${wk} 周` : "进度"} →</Link>
      </div>
      <div className="cardbody tx-form">
        {cur ? (
          <>
            <Link href={`/tongxiu/${cohort.id}`} className="tx-now-title">
              <b>{cur.m.title}</b>{cur.st.total > 0 && <Stars lit={cur.st.lit} total={cur.st.total} />}
            </Link>
            <span className={cur.st.due < app.now ? "td-err" : "muted"}>{leftLabel(cur.st.due, app.now)}</span>
          </>
        ) : <b>这门课全部完成了 🎉</b>}
        <div className="tx-board">
          {board.map(({ m, n }) => (
            <span key={m.userId} className={m.userId === meId ? "me" : ""} title={`${app.profiles[m.userId]?.name || "同窗"}：${n} 颗星`}>
              <Avatar p={app.profiles[m.userId]} size={22} showSky={false} live={app.live[m.userId]} /><b className="num">★{n}</b>
            </span>
          ))}
        </div>
        {cur && (
          <div className="tx-actions">
            <button className="btn primary" disabled={focusing} onClick={() => {
              focus.start({ mode: "pomodoro", minutes: app.myProfile!.pomodoroMin, task: `${course.name} ${cur.m.title}`, subjectId: me.subjectId, withUser: null, todoId: null });
              router.push("/focus");
            }}><IPlay />{focusing ? "正在专注" : "开始专注这一步"}</button>
            <Link className="btn" href={`/tongxiu/${cohort.id}`}>跑测试 / 看进度</Link>
          </div>
        )}
      </div>
    </section>
  );
}
