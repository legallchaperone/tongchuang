/**
 * R-030 同修: a course is a syllabus of milestones laid out by week ("week 3, Sunday"), not by date.
 * A cohort (lib/types.ts) picks a start date; only then do the milestones get real deadlines.
 * Courses are written by the developers (with AI help), reviewed by hand, and shipped with the app.
 */

export type MilestoneKind = "setup" | "hw" | "checkin" | "project" | "exam";

export const KIND_LABEL: Record<MilestoneKind, string> = {
  setup: "准备", hw: "作业", checkin: "打卡", project: "项目", exam: "考试",
};

export interface Link { label: string; url: string }

/**
 * A star lights up by itself when the tests behind it pass (the learner's test run is reported automatically).
 * `tests` entries: a test function name ("test_rope"), a test file ("test_model.py"),
 * "*" (any test of the step's repo ran, passed or not) or "**" (every test of the step's repo passed).
 */
export interface Star { id: string; label: string; tests: string[] }

export interface Milestone {
  /** stable id, stored with every submission: never rename one that a cohort may already use */
  id: string;
  /** 1-based week of the course */
  week: number;
  /** day of that week, 1-7 (7 = the last day of the week); default 7 */
  day?: number;
  /** a few characters for the progress grid header, e.g. "A1·1" */
  short: string;
  title: string;
  kind: MilestoneKind;
  /** one or two sentences: what this step is about */
  summary: string;
  /** what to hand in */
  deliverables: string[];
  /** the official assignment repository this step works in (what the setup commands clone) */
  repo?: string;
  /** small wins inside the step; when all are lit, the step counts as done (no need to hand anything in) */
  stars?: Star[];
  /** the command that runs the official tests, for steps without stars (filled in by hand) */
  tests?: { cmd: string; hint?: string };
  /** a number worth comparing, e.g. a validation loss */
  metric?: { name: string; lowerIsBetter: boolean };
  /** what feedback should look at (also goes into the prompt the developers hand to Claude) */
  rubric: string[];
  gpu?: "none" | "optional" | "required";
  /** what to do when a part needs something only enrolled students have */
  offCampus?: string;
  links?: Link[];
}

export interface CourseWeek {
  week: number;
  title: string;
  /** lectures to watch this week */
  lectures: string[];
  note?: string;
}

export interface Course {
  id: string;
  /** short name, also the subject created for everyone who joins */
  name: string;
  title: string;
  url: string;
  summary: string;
  weeks: number;
  hoursPerWeek: string;
  prereqs: string[];
  /** compute needs and where to get it */
  compute: string[];
  /** anything else worth knowing before starting */
  notes: string[];
  links: Link[];
  schedule: CourseWeek[];
  milestones: Milestone[];
  /** when the developers last checked it against the official site */
  checkedOn: string;
}
