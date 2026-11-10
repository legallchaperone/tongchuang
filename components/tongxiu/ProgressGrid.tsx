"use client";
// R-030 同修: people × steps. A square fills up as its stars light (tests passing), and is full once the step is done.
import type { Course, Milestone } from "@/lib/courses";
import type { Cohort, CohortMember, Profile, Submission, TestResults } from "@/lib/types";
import { CELL_LABEL, starsLit, starsTotal, stepStatus } from "@/lib/tongxiu";
import { durShort } from "@/lib/time";
import { Avatar } from "@/components/bits";
import { ProfileLink } from "@/components/profile/ProfileLink";

export interface GridRow { member: CohortMember; profile?: Profile; weekMs: number; totalMs: number }

export function ProgressGrid({ course, cohort, rows, subs, tests, now, meId, onOpen }: {
  course: Course; cohort: Cohort; rows: GridRow[]; subs: Submission[]; tests: Record<string, TestResults>; now: number; meId: string;
  onOpen: (m: Milestone) => void;
}) {
  const total = starsTotal(course);
  // like a private leaderboard: most stars first, then most course time
  const ranked = rows.map((r) => ({ ...r, stars: starsLit(course, tests[r.member.userId]) }))
    .sort((a, b) => b.stars - a.stars || b.totalMs - a.totalMs);
  return (
    <div className="tx-grid-wrap">
      <table className="tx-grid">
        <thead>
          <tr>
            <th className="who" scope="col">同修</th>
            <th className="stars" scope="col" title={`一共 ${total} 颗星，测试过了自己亮`}>★</th>
            {course.milestones.map((m) => <th key={m.id} scope="col" title={m.title}><button type="button" onClick={() => onOpen(m)}>{m.short}</button></th>)}
            <th className="hrs" scope="col" title="这门课的专注时长：近 7 天 / 开课以来">时长</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.member.userId} className={r.member.userId === meId ? "me" : ""}>
              <th scope="row" className="who">
                <span className="rank num">{i + 1}</span>
                <ProfileLink id={r.member.userId} className="plink-name"><Avatar p={r.profile} size={22} showSky={false} /><span>{r.profile?.name || "同窗"}</span></ProfileLink>
              </th>
              <td className="stars num"><b>{r.stars}</b></td>
              {course.milestones.map((m) => {
                const st = stepStatus(cohort, m, r.member, subs.find((s) => s.userId === r.member.userId && s.milestoneId === m.id), tests[r.member.userId], now);
                const ext = r.member.extensions.includes(m.id);
                return (
                  <td key={m.id}>
                    <button type="button" className={`tx-cell c-${st.state}`} onClick={() => onOpen(m)}
                      style={st.frac > 0 && st.frac < 1 ? { ["--fill" as string]: `${Math.round(st.frac * 100)}%` } : undefined}
                      title={`${r.profile?.name || "同窗"} · ${m.title}：${CELL_LABEL[st.state]}${st.total ? ` · ★ ${st.lit}/${st.total}` : ""}${ext ? " · 用了缓交卡" : ""}`}
                      aria-label={`${r.profile?.name || "同窗"} ${m.title} ${CELL_LABEL[st.state]}${st.total ? ` 星星 ${st.lit}/${st.total}` : ""}`}>
                      {st.frac > 0 && st.frac < 1 ? <span className="fill" /> : null}
                      {ext ? <i /> : null}
                    </button>
                  </td>
                );
              })}
              <td className="hrs num"><b>{durShort(r.weekMs)}</b><span className="muted"> / {durShort(r.totalMs)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tx-legend muted">
        <span><span className="tx-cell c-done" />完成了</span>
        <span><span className="tx-cell c-open" style={{ ["--fill" as string]: "50%" }}><span className="fill" /></span>星星亮了一部分</span>
        <span><span className="tx-cell c-late" />晚了完成</span>
        <span><span className="tx-cell c-overdue" />过了截止还没完成</span>
        <span><span className="tx-cell c-later"><i /></span>用了缓交卡</span>
      </div>
    </div>
  );
}
