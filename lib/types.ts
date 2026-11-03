export type UserId = string;

export interface Profile {
  id: UserId;
  name: string;
  /** index into the categorical palette, 0-7 */
  color: number;
  /** IANA time zone, e.g. "Asia/Shanghai" */
  tz: string;
  dailyGoalMin: number;
  pomodoroMin: number;
  breakMin: number;
  /** pixel character look; null = derived from id */
  look: { skin: number; hair: number; hairColor: number } | null;
}

export interface Subject {
  id: string;
  userId: UserId;
  name: string;
  color: number;
  archived: boolean;
}

export type FocusMode = "stopwatch" | "pomodoro";

export interface Session {
  id: string;
  userId: UserId;
  subjectId: string | null;
  task: string;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  /** focused time, pauses excluded */
  durationMs: number;
  mode: FocusMode;
  /** 1-5 self-rated focus, null if skipped */
  rating: number | null;
  note: string;
  tz: string;
}

export type LiveState = "focus" | "break" | "paused" | "idle";

export interface LiveStatus {
  userId: UserId;
  state: LiveState;
  task: string;
  subjectName: string;
  subjectColor: number | null;
  mode: FocusMode;
  /** when the current focus block started */
  startedAt: number | null;
  /** pomodoro / break planned end, null for stopwatch */
  plannedEnd: number | null;
  /** focused ms accumulated before the current running stretch (for pauses) */
  accumulatedMs: number;
  /** when the current running stretch started (null while paused) */
  runningSince: number | null;
  updatedAt: number;
}

export interface Room {
  id: string;
  name: string;
  code: string;
  createdBy: UserId;
  memberIds: UserId[];
}

export interface Kudos {
  id: string;
  sessionId: string;
  fromUser: UserId;
  emoji: string;
  createdAt: number;
}

export type Signal =
  | { kind: "poke"; from: UserId; to: UserId; at: number }
  | { kind: "cheer"; from: UserId; to: UserId; at: number; text: string }
  | { kind: "invite"; from: UserId; to: UserId; at: number; mode: FocusMode; minutes: number; task: string };

export interface AuthUser {
  id: UserId;
  email: string | null;
}

/** R-007 收工: one person's end-of-day review, one per local day */
export interface DailyReview {
  userId: UserId;
  /** the reviewer's local date key, YYYY-MM-DD */
  day: string;
  /** 1 tired · 2 okay · 3 full, null if skipped */
  energy: number | null;
  /** 1–4 how much today got done, null if skipped */
  impact: number | null;
  /** “明天先做什么” */
  note: string;
  /** focused time that day, snapshot at review time */
  totalMs: number;
  tz: string;
  createdAt: number;
  /** last time it was saved: the desk goes dark from here until the next focus */
  updatedAt: number;
}
