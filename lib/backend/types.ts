import type { AuthUser, Kudos, LiveStatus, Profile, Room, Session, Signal, Subject, UserId } from "../types";

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

  // rooms
  listRooms(): Promise<Room[]>;
  createRoom(name: string): Promise<Room>;
  joinRoom(code: string): Promise<Room>;
  leaveRoom(roomId: string): Promise<void>;

  // sessions
  listSessions(userIds: UserId[], sinceMs: number): Promise<Session[]>;
  addSession(s: Omit<Session, "id">): Promise<Session>;
  updateSession(id: string, patch: Partial<Pick<Session, "rating" | "note" | "task" | "subjectId" | "durationMs" | "endedAt">>): Promise<void>;
  deleteSession(id: string): Promise<void>;

  // live
  getLive(userIds: UserId[]): Promise<LiveStatus[]>;
  setLive(l: LiveStatus): Promise<void>;

  // kudos
  listKudos(sessionIds: string[]): Promise<Kudos[]>;
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

  /** direct signals: poke / cheer / invite */
  sendSignal(s: Signal): Promise<void>;
  onSignal(me: UserId, cb: (s: Signal) => void): Unsub;
}
