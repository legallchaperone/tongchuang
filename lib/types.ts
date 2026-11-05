import type { ProfilePage } from "./profilePage";

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
  /** focus-mode preferences (R-001/R-002); missing = defaults */
  focusPrefs?: FocusPrefs | null;
  /** R-020 personal page (bio, widgets); null/missing = defaults. Read it through normalizePage() */
  page?: ProfilePage | null;
}

/** how flow mode suggests a break: a share of the focused time, or a lookup table */
export type FlowBreakRule = "ratio" | "table";

export interface FocusPrefs {
  flowBreak: FlowBreakRule;
  /** percent of the focused time, for the "ratio" rule */
  flowPct: number;
  /** pomodoro keeps counting when time is up instead of starting the break */
  pomoOvertime: boolean;
}

export interface Subject {
  id: string;
  userId: UserId;
  name: string;
  color: number;
  archived: boolean;
}

/**
 * "pomodoro" = 番茄钟, "stopwatch" = 心流 (counts up from 0; the stored value predates the rename),
 * "countdown" = 倒计时 (counts down, no automatic break).
 */
export type FocusMode = "stopwatch" | "pomodoro" | "countdown";

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
  /** R-025: the to-do this focus was started from (only the owner can see the to-do itself) */
  todoId?: string | null;
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
  /** pomodoro / countdown / break planned end, null for flow (and pomodoro overtime) */
  plannedEnd: number | null;
  /** focused ms accumulated before the current running stretch (for pauses) */
  accumulatedMs: number;
  /** when the current running stretch started (null while paused) */
  runningSince: number | null;
  updatedAt: number;
  /* R-005 personal status. Optional: writers that leave them out (e.g. the focus mirror) keep whatever is stored. */
  /** status icon, null = no status */
  statusEmoji?: string | null;
  /** short text, up to 20 characters */
  statusText?: string | null;
  /** when it expires (epoch ms); null = until cleared by hand */
  statusUntil?: number | null;
  /** when it was set, for "3 小时前" and the feed */
  statusSetAt?: number | null;
}

/** what the status sheet saves */
export interface PersonalStatus {
  emoji: string;
  text: string;
  until: number | null;
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

/** R-020 留言板: one sticky note on someone's home page */
export interface GuestbookEntry {
  id: string;
  /** whose board it is on */
  ownerId: UserId;
  authorId: UserId;
  /** up to 60 characters; "" = sticker only */
  text: string;
  /** sticker id from components/Stickers (null = text only) */
  sticker: string | null;
  createdAt: number;
  /** R-023: a reply hangs under this top-level note (one level only; replies are text only) */
  parentId?: string | null;
  /** R-023: who the reply answers (gets notified) */
  replyTo?: UserId | null;
}

/** R-024: a short comment under someone's study record */
export interface SessionComment {
  id: string;
  sessionId: string;
  /** whose record it is */
  ownerId: UserId;
  authorId: UserId;
  text: string;
  createdAt: number;
}

/** R-025: a private to-do, filed under a subject, with an estimate */
export interface Todo {
  id: string;
  userId: UserId;
  text: string;
  subjectId: string | null;
  /** one of TODO_ESTIMATES (minutes), or null = not estimated */
  estimateMin: number | null;
  /** null = not done yet */
  doneAt: number | null;
  createdAt: number;
}
