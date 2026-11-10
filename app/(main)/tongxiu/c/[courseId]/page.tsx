"use client";
// R-030 同修: one course — what it is, the week-by-week plan, and starting a cohort in one of my rooms
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { getCourse } from "@/lib/courses";
import { useCohorts } from "@/lib/useTongxiu";
import { COHORT_NAME_MAX, keyLabel, nextMonday } from "@/lib/tongxiu";
import { Schedule } from "@/components/tongxiu/Schedule";
import { IBack } from "@/components/Icons";

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const app = useApp();
  const router = useRouter();
  const course = getCourse(courseId);
  const { cohorts } = useCohorts();
  const tz = app.myProfile!.tz;
  const [roomId, setRoomId] = useState(app.rooms[0]?.id || "");
  const [newRoom, setNewRoom] = useState("");
  const [startsOn, setStartsOn] = useState(() => nextMonday(Date.now(), tz));
  const existing = (cohorts || []).filter((c) => c.courseId === courseId);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!course) return <div className="page"><div className="card empty"><b>找不到这门课</b><div style={{ marginTop: 12 }}><Link className="btn sm" href="/tongxiu">返回同修</Link></div></div></div>;

  async function start() {
    setErr(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) { setErr("选一个开课日期"); return; }
    const nm = (name.trim() || `第 ${existing.length + 1} 期`).slice(0, COHORT_NAME_MAX);
    setBusy(true);
    try {
      let rid = roomId;
      if (rid === "new" || !rid) {
        if (!newRoom.trim()) { setErr("给新的自习室起个名字"); setBusy(false); return; }
        rid = (await app.createRoom(newRoom.trim())).id;
      }
      const c = await app.backend.createCohort({ courseId: course!.id, name: nm, roomId: rid, startsOn });
      router.push(`/tongxiu/${c.id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <Link href="/tongxiu" className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 4 }}><IBack />同修</Link>
          <h1>{course.name}</h1>
          <p className="sub">{course.title} · {course.weeks} 周 · {course.hoursPerWeek}</p>
        </div>
        <a className="btn" href={course.url} target="_blank" rel="noreferrer">课程官网</a>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="card">
            <div className="cardhead"><h2>这门课</h2><span className="hint">课表按 {course.checkedOn} 的官网整理</span></div>
            <div className="cardbody tx-prose">
              <p>{course.summary}</p>
              <h3>需要会</h3>
              <ul>{course.prereqs.map((x) => <li key={x}>{x}</li>)}</ul>
              <h3>算力</h3>
              <ul>{course.compute.map((x) => <li key={x}>{x}</li>)}</ul>
              <h3>先知道</h3>
              <ul>{course.notes.map((x) => <li key={x}>{x}</li>)}</ul>
              <div className="chips">{course.links.map((l) => <a key={l.url} className="chip" href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}</div>
            </div>
          </section>
          <section className="card">
            <div className="cardhead"><h2>按周安排</h2><span className="hint">每周一个要交的东西，截止日都是那周最后一天</span></div>
            <div className="cardbody"><Schedule course={course} now={app.now} /></div>
          </section>
        </div>

        <div className="stack">
          {existing.length > 0 && (
            <section className="card">
              <div className="cardhead"><h2>正在开的</h2></div>
              <div className="cardbody tx-list">
                {existing.map((c) => (
                  <Link key={c.id} href={`/tongxiu/${c.id}`} className="tx-li">
                    <b>{c.name}</b><span className="muted">{app.rooms.find((r) => r.id === c.roomId)?.name || ""} · {keyLabel(c.startsOn)} 开课</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="card">
            <div className="cardhead"><h2>开一期</h2></div>
            <div className="cardbody tx-form">
              <p className="muted">一期同修放在一个自习室里：里面的人都能看到、都能加入（最多 12 人）。截止时间按地球上最晚的时区（UTC-12）算，谁都不会少一天。</p>
              <div className="field">
                <label className="label" htmlFor="tx-room">在哪个自习室</label>
                <select id="tx-room" className="input select" value={roomId || "new"} onChange={(e) => setRoomId(e.target.value)} disabled={busy}>
                  {app.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}（{r.memberIds.length} 人）</option>)}
                  <option value="new">新建一个自习室…</option>
                </select>
              </div>
              {(roomId === "new" || !roomId) && (
                <div className="field">
                  <label className="label" htmlFor="tx-newroom">新自习室的名字</label>
                  <input id="tx-newroom" className="input" value={newRoom} maxLength={40} placeholder={`${course.name} 同修`} onChange={(e) => setNewRoom(e.target.value)} disabled={busy} />
                </div>
              )}
              <div className="field">
                <label className="label" htmlFor="tx-start">第 1 周从哪天开始</label>
                <input id="tx-start" className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} disabled={busy} />
                {/^\d{4}-\d{2}-\d{2}$/.test(startsOn) && <span className="muted" style={{ marginTop: 4 }}>{keyLabel(startsOn)} 开始，每周的作业在第 7 天截止</span>}
              </div>
              <div className="field">
                <label className="label" htmlFor="tx-name">这一期叫什么</label>
                <input id="tx-name" className="input" value={name} maxLength={COHORT_NAME_MAX} placeholder={`第 ${existing.length + 1} 期`} onChange={(e) => setName(e.target.value)} disabled={busy} />
              </div>
              {err && <p className="td-err">{err}</p>}
              <button className="btn primary" onClick={start} disabled={busy}>{busy ? "正在开…" : "开这一期"}</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
