"use client";
// R-030 同修: one cohort — what is due, everyone's progress, the plan, and handing in
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { getCourse, type Milestone } from "@/lib/courses";
import { useCohorts, useCohortWork } from "@/lib/useTongxiu";
import { courseWeek, keyLabel, leftLabel, localDeadline, MAX_EXTENSIONS, upcoming } from "@/lib/tongxiu";
import { DAY } from "@/lib/time";
import { HISTORY_DAYS } from "@/lib/store";
import { Schedule } from "@/components/tongxiu/Schedule";
import { ProgressGrid, type GridRow } from "@/components/tongxiu/ProgressGrid";
import { MilestoneSheet } from "@/components/tongxiu/MilestoneSheet";
import { Spinner } from "@/components/bits";
import { IBack } from "@/components/Icons";

export default function CohortPage() {
  const { id } = useParams<{ id: string }>();
  const app = useApp();
  const { cohorts, members, error, setMembers } = useCohorts();
  const cohort = cohorts?.find((c) => c.id === id) || null;
  const work = useCohortWork(cohort?.id || null);
  const [open, setOpen] = useState<Milestone | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const meId = app.me!.id;
  const tz = app.myProfile!.tz;
  const now = app.now;
  const course = cohort ? getCourse(cohort.courseId) : null;
  const cms = useMemo(() => members.filter((m) => m.cohortId === id), [members, id]);
  const active = cms.filter((m) => !m.leftAt);
  const me = cms.find((m) => m.userId === meId) || null;
  const joined = !!me && !me.leftAt;
  const room = cohort ? app.rooms.find((r) => r.id === cohort.roomId) : null;
  const subs = work.subs || [];

  // course time since the start: make sure everyone's records reach back that far
  const sinceStart = cohort ? Date.parse(cohort.startsOn + "T00:00:00Z") - DAY : 0;
  const idsKey = active.map((m) => m.userId).join(",");
  useEffect(() => {
    if (!cohort) return;
    const days = Math.min(HISTORY_DAYS, Math.ceil((Date.now() - sinceStart) / DAY) + 1);
    if (days > 30) app.ensureHistory(idsKey.split(",").filter(Boolean), days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohort?.id, idsKey]);

  const rows: GridRow[] = useMemo(() => active.map((m) => {
    const mine = m.subjectId ? app.sessions.filter((s) => s.userId === m.userId && s.subjectId === m.subjectId) : [];
    const weekMs = mine.filter((s) => s.startedAt >= now - 7 * DAY).reduce((a, s) => a + s.durationMs, 0);
    const totalMs = mine.filter((s) => s.startedAt >= sinceStart).reduce((a, s) => a + s.durationMs, 0);
    return { member: m, profile: app.profiles[m.userId], weekMs, totalMs };
  }).sort((a, b) => (a.member.userId === meId ? -1 : b.member.userId === meId ? 1 : (a.profile?.name || "").localeCompare(b.profile?.name || ""))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [active.length, idsKey, app.sessions, app.profiles, Math.floor(now / 60000), sinceStart, meId]);

  if (cohorts == null) return <Spinner />;
  if (!cohort || !course) {
    return (
      <div className="page"><div className="card empty">
        <b>{cohort ? "这门课的课表还没上线" : "找不到这一期"}</b>{error || "可能不在你的自习室里，或者已经被删掉了。"}
        <div style={{ marginTop: 12 }}><Link className="btn sm" href="/tongxiu">返回同修</Link></div>
      </div></div>
    );
  }

  const wk = courseWeek(cohort, now, tz);
  const mySubs = subs.filter((s) => s.userId === meId);
  const next = joined ? upcoming(course, cohort, me, mySubs, now) : [];
  const inRoom = !!room;

  async function join() {
    setBusy(true);
    try {
      const subject = await app.ensureSubject(course!.name);
      const m = await app.backend.joinCohort(cohort!.id, subject.id);
      setMembers((l) => [...l.filter((x) => !(x.cohortId === m.cohortId && x.userId === m.userId)), m]);
      app.pushToast({ title: `加入了 ${course!.name} · ${cohort!.name}`, body: `专注时选科目「${subject.name}」，时长就算进这门课`, color: subject.color });
    } catch (e) { app.pushToast({ title: "没加入成功", body: (e as Error).message }); } finally { setBusy(false); }
  }
  async function leave() {
    setBusy(true);
    try {
      await app.backend.leaveCohort(cohort!.id);
      setMembers((l) => l.map((x) => (x.cohortId === cohort!.id && x.userId === meId ? { ...x, leftAt: Date.now() } : x)));
      setConfirmLeave(false);
    } catch (e) { app.pushToast({ title: "没退出成功", body: (e as Error).message }); } finally { setBusy(false); }
  }
  async function setExtensions(ids: string[]) {
    await app.backend.setExtensions(cohort!.id, ids);
    setMembers((l) => l.map((x) => (x.cohortId === cohort!.id && x.userId === meId ? { ...x, extensions: ids } : x)));
  }

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <Link href="/tongxiu" className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 4 }}><IBack />同修</Link>
          <h1>{course.name} · {cohort.name}</h1>
          <p className="sub">
            {wk === 0 ? `${keyLabel(cohort.startsOn)} 开课` : wk > course.weeks ? "已结课" : `第 ${wk} 周 / 共 ${course.weeks} 周`}
            {room ? ` · 在「${room.name}」` : ""} · {active.length} 人在修
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn" href={`/tongxiu/c/${course.id}`}>课程介绍</Link>
          {joined && (confirmLeave
            ? <><button className="btn danger" onClick={leave} disabled={busy}>确认退出</button><button className="btn ghost" onClick={() => setConfirmLeave(false)}>取消</button></>
            : <button className="btn ghost" onClick={() => setConfirmLeave(true)}>退出这一期</button>)}
        </div>
      </div>

      {(error || work.error) && <div className="card pad config-warn">{error || work.error}</div>}

      {!joined && (
        <section className="card pad tx-join">
          <h2>{me?.leftAt ? "回来继续修" : "一起修这门课"}</h2>
          {inRoom ? (
            <>
              <p>加入后会给你建一个科目「{course.name}」：专注时选它，时长就算进这门课。每周有一个要交的东西，截止前交上去就行；晚了也能交，会标“迟交”。每人有 {MAX_EXTENSIONS} 张缓交卡，一张能晚 3 天。</p>
              <div><button className="btn primary" onClick={join} disabled={busy}>{busy ? "正在加入…" : me?.leftAt ? "重新加入" : "加入这一期"}</button></div>
            </>
          ) : <p className="muted">这一期在别人的自习室里，你是开发者所以能看到。加入那个自习室之后才能一起修。</p>}
        </section>
      )}

      {joined && (
        <section className="card">
          <div className="cardhead"><h2>接下来要交</h2><span className="hint">缓交卡还剩 {MAX_EXTENSIONS - me!.extensions.length} 张</span></div>
          <div className="cardbody tx-list">
            {next.length === 0 && <p className="muted">最近 8 天没有要交的。{wk > course.weeks ? "这门课修完了，辛苦了！" : "可以提前看看下周的。"}</p>}
            {next.map(({ m, due }) => (
              <button key={m.id} type="button" className={`tx-li tx-next ${due < now ? "over" : ""}`} onClick={() => setOpen(m)}>
                <b>{m.title}</b>
                <span className="muted">{leftLabel(due, now)} · 你这里是 {localDeadline(due, tz)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="cardhead"><h2>大家的进度</h2><span className="hint">点格子看要求和大家交的东西；时长 = 近 7 天 / 开课以来，只算科目「{course.name}」</span></div>
        <div className="cardbody">
          {work.subs == null ? <Spinner /> : rows.length === 0
            ? <p className="muted">还没有人加入。</p>
            : <ProgressGrid course={course} cohort={cohort} rows={rows} subs={subs} now={now} onOpen={setOpen} />}
        </div>
      </section>

      <section className="card">
        <div className="cardhead"><h2>按周安排</h2><span className="hint">截止都按地球上最晚的时区（UTC-12）算</span></div>
        <div className="cardbody"><Schedule course={course} cohort={cohort} member={joined ? me : null} mine={mySubs} now={now} currentWeek={wk} onOpen={setOpen} /></div>
      </section>

      {open && (
        <MilestoneSheet
          course={course} cohort={cohort} m={open} me={joined ? me : null} members={cms}
          subs={subs} details={work.details} feedback={work.feedback}
          onSaved={(s, d) => { work.put(s, d); work.reload(); }}
          onExtensions={setExtensions}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
