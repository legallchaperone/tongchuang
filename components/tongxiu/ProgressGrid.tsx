"use client";
// R-030 同修: people × milestones; a lit square for each thing handed in
import type { Course, Milestone } from "@/lib/courses";
import type { Cohort, CohortMember, Profile, Submission } from "@/lib/types";
import { CELL_LABEL, cellState, dueAt } from "@/lib/tongxiu";
import { durShort } from "@/lib/time";
import { Avatar } from "@/components/bits";
import { ProfileLink } from "@/components/profile/ProfileLink";

export interface GridRow { member: CohortMember; profile?: Profile; weekMs: number; totalMs: number }

export function ProgressGrid({ course, cohort, rows, subs, now, onOpen }: {
  course: Course; cohort: Cohort; rows: GridRow[]; subs: Submission[]; now: number; onOpen: (m: Milestone) => void;
}) {
  return (
    <div className="tx-grid-wrap">
      <table className="tx-grid">
        <thead>
          <tr>
            <th className="who" scope="col">同修</th>
            {course.milestones.map((m) => <th key={m.id} scope="col" title={m.title}><button type="button" onClick={() => onOpen(m)}>{m.short}</button></th>)}
            <th className="hrs" scope="col" title="这门课的专注时长：近 7 天 / 开课以来">时长</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const done = subs.filter((s) => s.userId === r.member.userId).length;
            return (
              <tr key={r.member.userId}>
                <th scope="row" className="who">
                  <ProfileLink id={r.member.userId} className="plink-name"><Avatar p={r.profile} size={22} showSky={false} /><span>{r.profile?.name || "同窗"}</span></ProfileLink>
                  <span className="muted num">{done}/{course.milestones.length}</span>
                </th>
                {course.milestones.map((m) => {
                  const sub = subs.find((s) => s.userId === r.member.userId && s.milestoneId === m.id);
                  const st = cellState(dueAt(cohort, m, r.member), sub, now);
                  const tests = sub?.testsTotal ? ` · 测试 ${sub.testsPassed ?? 0}/${sub.testsTotal}` : "";
                  return (
                    <td key={m.id}>
                      <button type="button" className={`tx-cell c-${st}`} onClick={() => onOpen(m)}
                        title={`${r.profile?.name || "同窗"} · ${m.title}：${CELL_LABEL[st]}${tests}${r.member.extensions.includes(m.id) ? " · 用了缓交卡" : ""}`}
                        aria-label={`${r.profile?.name || "同窗"} ${m.title} ${CELL_LABEL[st]}`}>
                        {r.member.extensions.includes(m.id) ? <i /> : null}
                      </button>
                    </td>
                  );
                })}
                <td className="hrs num"><b>{durShort(r.weekMs)}</b><span className="muted"> / {durShort(r.totalMs)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="tx-legend muted">
        {(["done", "late", "open", "overdue", "later"] as const).map((k) => <span key={k}><span className={`tx-cell c-${k}`} />{CELL_LABEL[k]}</span>)}
        <span><span className="tx-cell c-later"><i /></span>用了缓交卡</span>
      </div>
    </div>
  );
}
