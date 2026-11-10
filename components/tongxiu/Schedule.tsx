"use client";
// R-030 同修: the course week by week. With a cohort, weeks get dates and milestones get deadlines and my status.
import type { Course, Milestone } from "@/lib/courses";
import { KIND_LABEL } from "@/lib/courses";
import type { Cohort, CohortMember, Submission } from "@/lib/types";
import { addDaysKey } from "@/lib/time";
import { CELL_LABEL, cellState, dueAt, keyLabel, leftLabel } from "@/lib/tongxiu";

export function Schedule({ course, cohort, member, mine, now, currentWeek, onOpen }: {
  course: Course; cohort?: Cohort; member?: CohortMember | null; mine?: Submission[]; now: number; currentWeek?: number;
  onOpen?: (m: Milestone) => void;
}) {
  return (
    <div className="tx-weeks">
      {course.schedule.map((w) => {
        const ms = course.milestones.filter((m) => m.week === w.week);
        const start = cohort ? addDaysKey(cohort.startsOn, (w.week - 1) * 7) : null;
        return (
          <div key={w.week} className={`tx-week ${currentWeek === w.week ? "now" : ""}`}>
            <div className="tx-week-head">
              <b>第 {w.week} 周</b><span>{w.title}</span>
              {start && <span className="muted">{keyLabel(start).replace(/ 周.$/, "")} – {keyLabel(addDaysKey(start, 6)).replace(/ 周.$/, "")}</span>}
              {currentWeek === w.week && <span className="state-pill focus">本周</span>}
            </div>
            {(w.lectures.length > 0 || w.note) && (
              <p className="muted tx-lect">{w.lectures.join(" · ")}{w.note ? (w.lectures.length ? " · " : "") + w.note : ""}</p>
            )}
            {ms.map((m) => {
              const due = cohort ? dueAt(cohort, m, member) : null;
              const sub = mine?.find((s) => s.milestoneId === m.id);
              const st = due != null && member ? cellState(due, sub, now) : null;
              const Row = onOpen ? "button" : "div";
              return (
                <Row key={m.id} className="tx-ms" {...(onOpen ? { type: "button" as const, onClick: () => onOpen(m) } : {})}>
                  <span className={`tx-kind k-${m.kind}`}>{KIND_LABEL[m.kind]}</span>
                  <span className="tx-ms-title">{m.title}{m.gpu === "required" ? <span className="tx-gpu" title="需要 GPU">GPU</span> : null}</span>
                  {due != null && (
                    <span className="tx-ms-due muted">
                      {member?.extensions.includes(m.id) ? "缓交 · " : ""}{st === "done" || st === "late" ? CELL_LABEL[st] : leftLabel(due, now)}
                    </span>
                  )}
                  {st && <span className={`tx-cell c-${st}`} aria-label={CELL_LABEL[st]} />}
                </Row>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
