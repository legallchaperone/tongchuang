import type { AuthUser, DailyReview, GuestbookEntry, Kudos, LiveStatus, Profile, Room, Session, Signal, Subject, UserId } from "../types";

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
}
