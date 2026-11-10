import type { AuthUser, Cohort, CohortMember, DailyReview, GuestbookEntry, Kudos, SessionComment, Submission, SubmissionDetail, SubmissionFeedback, SubjectFolder, Todo, LiveStatus, Profile, Room, Session, Signal, Subject, UserId } from "../types";

export type Unsub = () => void;

export interface Backend {
  mode: "demo" | "supabase";

  // auth
  currentUser(): Promise<AuthUser | null>;
  onAuthChange(cb: (u: AuthUser | null) => void): Unsub;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirm: boolean }>;
  sendMagicLink(email: string): Promise<void>;
  /** confirm a sign-up, or finish an email-code sign-in, with the code from the email */
  verifyEmailCode(email: string, code: string, kind: "signup" | "login"): Promise<void>;
  resendSignupEmail(email: string): Promise<void>;
  signOut(): Promise<void>;

  // profiles
  getProfiles(ids: UserId[]): Promise<Profile[]>;
  saveProfile(p: Profile): Promise<void>;

  // subjects (own)
  listSubjects(userIds: UserId[]): Promise<Subject[]>;
  saveSubject(s: Omit<Subject, "id"> & { id?: string }): Promise<Subject>;
  /** R-019: how many of my records use this subject (all time) */
  countSubjectSessions(id: string): Promise<number>;
  /** R-019: delete a subject; its records become uncategorized */
  deleteSubject(id: string): Promise<void>;
  /** R-019: move every record of `fromId` to `toId`, then delete `fromId`; returns records moved */
  mergeSubject(fromId: string, toId: string): Promise<number>;

  // rooms
  listRooms(): Promise<Room[]>;
  createRoom(name: string): Promise<Room>;
  joinRoom(code: string): Promise<Room>;
  leaveRoom(roomId: string): Promise<void>;

  // sessions
  /** sessions that started in [sinceMs, untilMs) — untilMs omitted means up to now */
  listSessions(userIds: UserId[], sinceMs: number, untilMs?: number): Promise<Session[]>;
  addSession(s: Omit<Session, "id">): Promise<Session>;
  updateSession(id: string, patch: Partial<Pick<Session, "rating" | "note" | "task" | "subjectId" | "durationMs" | "endedAt">>): Promise<void>;
  deleteSession(id: string): Promise<void>;

  // live
  getLive(userIds: UserId[]): Promise<LiveStatus[]>;
  setLive(l: LiveStatus): Promise<void>;

  // kudos
  listKudos(sessionIds: string[]): Promise<Kudos[]>;
  /** every kudos I can see that was given since sinceMs (RLS limits it to my classmates' records); one request */
  listRecentKudos(sinceMs: number): Promise<Kudos[]>;
  addKudos(sessionId: string, emoji: string): Promise<void>;
  removeKudos(sessionId: string, emoji: string): Promise<void>;

  /** realtime: everything that changes for these users */
  subscribe(
    userIds: UserId[],
    handlers: {
      onLive: (l: LiveStatus) => void;
      onSession: (s: Session, kind: "upsert" | "delete") => void;
      onKudos: (k: Kudos, kind: "insert" | "delete") => void;
    }
  ): Unsub;

  /** presence across all my rooms: who has the app open */
  presence(me: UserId, roomIds: string[], onOnline: (ids: Set<UserId>) => void): Unsub;

  // R-007 收工 (daily reviews)
  listReviews(userIds: UserId[], sinceDay: string): Promise<DailyReview[]>;
  /** insert or replace my review for that day */
  saveReview(r: Omit<DailyReview, "createdAt" | "updatedAt">): Promise<DailyReview>;
  subscribeReviews(userIds: UserId[], cb: (r: DailyReview) => void): Unsub;

  /** direct signals: poke / cheer / invite */
  sendSignal(s: Signal): Promise<void>;
  onSignal(me: UserId, cb: (s: Signal) => void): Unsub;

  // R-020 留言板
  /** the `limit` newest top-level notes (newest first) plus every reply under them; RLS only returns boards of people I share a room with (and my own) */
  listGuestbook(ownerId: UserId, limit: number): Promise<GuestbookEntry[]>;
  /** leave a note on someone's board as me: text (≤ 60 characters) and/or a sticker; with parentId it is a text-only reply under that note */
  addGuestbook(e: { ownerId: UserId; text: string; sticker: string | null; parentId?: string | null; replyTo?: UserId | null }): Promise<GuestbookEntry>;
  /** the author or the board's owner can take a note down */
  deleteGuestbook(id: string): Promise<void>;
  /** realtime: notes added to / taken off one board (a delete may only carry the id) */
  subscribeGuestbook(ownerId: UserId, cb: (e: GuestbookEntry, kind: "insert" | "delete") => void): Unsub;
  /** R-023: replies to me on anyone's board */
  subscribeGuestbookReplies(me: UserId, cb: (e: GuestbookEntry) => void): Unsub;

  // R-024 自习记录评论
  /** comments on these people's records, written since sinceMs, oldest first */
  listComments(ownerIds: UserId[], sinceMs: number): Promise<SessionComment[]>;
  addComment(c: { sessionId: string; ownerId: UserId; text: string }): Promise<SessionComment>;
  /** the author or the record's owner can delete it */
  deleteComment(id: string): Promise<void>;
  /** realtime: comments added to / removed from these people's records (a delete may only carry the id) */
  subscribeComments(ownerIds: UserId[], cb: (c: SessionComment, kind: "insert" | "delete") => void): Unsub;

  // R-025 待办 (only mine; nobody else can read them)
  listTodos(): Promise<Todo[]>;
  addTodo(t: { text: string; subjectId: string | null; estimateMin: number | null }): Promise<Todo>;
  updateTodo(id: string, patch: Partial<Pick<Todo, "text" | "subjectId" | "estimateMin" | "doneAt">>): Promise<void>;
  deleteTodo(id: string): Promise<void>;

  // R-026 科目文件夹 (only mine)
  listFolders(): Promise<SubjectFolder[]>;
  saveFolder(f: { id?: string; name: string }): Promise<SubjectFolder>;
  /** its subjects go back to the top level */
  deleteFolder(id: string): Promise<void>;

  // R-030 同修
  /** cohorts in my rooms (RLS), and everyone who joined them; a developer (staff) sees all of them */
  listCohorts(): Promise<{ cohorts: Cohort[]; members: CohortMember[] }>;
  createCohort(c: { courseId: string; name: string; roomId: string; startsOn: string }): Promise<Cohort>;
  /** join (or come back to) a cohort; subjectId is my subject for the course */
  joinCohort(cohortId: string, subjectId: string | null): Promise<CohortMember>;
  leaveCohort(cohortId: string): Promise<void>;
  /** replace the milestones I used a 缓交卡 on (at most MAX_EXTENSIONS) */
  setExtensions(cohortId: string, milestoneIds: string[]): Promise<void>;
  listSubmissions(cohortIds: string[]): Promise<Submission[]>;
  /** RLS returns mine, and others' once their deadline has passed or I have handed in the same milestone */
  listSubmissionDetails(submissionIds: string[]): Promise<SubmissionDetail[]>;
  listFeedback(submissionIds: string[]): Promise<SubmissionFeedback[]>;
  /** hand in or update my submission for one milestone */
  saveSubmission(s: {
    cohortId: string; milestoneId: string; testsPassed: number | null; testsTotal: number | null; metric: number | null;
    dueAt: number; link: string; note: string; private: boolean; requestFeedback: boolean;
  }): Promise<{ submission: Submission; detail: SubmissionDetail }>;
  /** realtime: submissions handed in or updated in these cohorts */
  subscribeSubmissions(cohortIds: string[], cb: (s: Submission) => void): Unsub;
  /** realtime: feedback written for me */
  subscribeFeedback(me: UserId, cb: (f: SubmissionFeedback) => void): Unsub;
  /** am I one of the developers who write feedback */
  isStaff(): Promise<boolean>;
  /** staff only: every submission that asked for feedback, newest first */
  listFeedbackRequests(): Promise<Submission[]>;
  /** staff only */
  addFeedback(f: { submissionId: string; userId: UserId; text: string }): Promise<SubmissionFeedback>;
}
