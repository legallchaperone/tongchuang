"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getBackend } from "./backend";
import type { Backend } from "./backend/types";
import type { AuthUser, DailyReview, Kudos, SessionComment, Todo, LiveStatus, PersonalStatus, Profile, Room, Session, Signal, Subject, UserId } from "./types";
import { addDaysKey, browserTz, DAY, dayKey } from "./time";
import { activeStatus, readStatusPrefs, statusPatch } from "./status";
import { byDay, streaks } from "./stats";

/** the first screen only needs recent records (today, this week, last week, the 30-day room heat map) */
const INITIAL_DAYS = 35;
/** the data page goes back this far (a year heat map, plus some slack), loaded on demand */
export const HISTORY_DAYS = 400;

/* ---- local snapshot: show the last known data at once, then refresh in the background ---- */
const CACHE_V = 1;
const CACHE_PREFIX = "tc-cache-";
const cacheKey = (uid: UserId) => `${CACHE_PREFIX}v${CACHE_V}:${uid}`;
/** characters; localStorage holds ~5M per site and is shared with the focus timer and the demo */
const CACHE_MAX = 1_500_000;
interface Snapshot {
  /** per person: the snapshot holds every record that started at or after this instant */
  v: number; uid: UserId; at: number; cover: Record<UserId, number>;
  rooms: Room[]; profiles: Profile[]; subjects: Subject[]; sessions: Session[]; live: LiveStatus[]; kudos: Kudos[];
}
function readSnapshot(uid: UserId): Snapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(cacheKey(uid)) || "null") as Snapshot | null;
    if (!s || s.v !== CACHE_V || s.uid !== uid || !s.cover || !Array.isArray(s.sessions) || Date.now() - s.at > 14 * DAY) return null;
    return s;
  } catch { return null; }
}
function dropSnapshots(keep?: UserId) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(CACHE_PREFIX) && k !== (keep && cacheKey(keep))) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* storage blocked */ }
}
function writeSnapshot(snap: Snapshot) {
  let str = "";
  try {
    str = JSON.stringify(snap);
    // too big (a long own history, many classmates): first keep the recent window only, then the last 10 days
    for (let i = 0; str.length > CACHE_MAX && i < 2; i++) {
      const floor = Date.now() - (i ? 10 : INITIAL_DAYS) * DAY;
      const cover = Object.fromEntries(Object.entries(snap.cover).map(([id, t]) => [id, Math.max(t, floor)]));
      const sessions = snap.sessions.filter((s) => s.startedAt >= cover[s.userId]);
      const ids = new Set(sessions.map((s) => s.id));
      str = JSON.stringify({ ...snap, cover, sessions, kudos: snap.kudos.filter((k) => ids.has(k.sessionId)) });
    }
    if (str.length > CACHE_MAX) { localStorage.removeItem(cacheKey(snap.uid)); return; }
    localStorage.setItem(cacheKey(snap.uid), str);
  } catch {
    // quota: drop other accounts' snapshots and try once more
    try { dropSnapshots(snap.uid); if (str) localStorage.setItem(cacheKey(snap.uid), str); }
    catch { try { localStorage.removeItem(cacheKey(snap.uid)); } catch { /* ignore */ } }
  }
}

const byStartDesc = (a: Session, b: Session) => b.startedAt - a.startedAt;
/** b wins over a for the same id */
function mergeSessions(a: Session[], b: Session[]) {
  const ids = new Set(b.map((s) => s.id));
  return [...a.filter((s) => !ids.has(s.id)), ...b].sort(byStartDesc);
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  color?: number;
  action?: { label: string; href: string };
  ttl?: number;
}

interface Ctx {
  backend: Backend;
  status: "loading" | "signedOut" | "ready" | "error";
  error: string | null;
  me: AuthUser | null;
  myProfile: Profile | null;
  profiles: Record<UserId, Profile>;
  /** everyone I share a room with, me first */
  peopleIds: UserId[];
  subjects: Subject[];
  rooms: Room[];
  sessions: Session[];
  live: Record<UserId, LiveStatus>;
  kudos: Kudos[];
  online: Set<UserId>;
  toasts: Toast[];
  now: number;
  pushToast(t: Omit<Toast, "id">): void;
  dismissToast(id: string): void;
  reload(): Promise<void>;
  /** make sure these people's records reach back `days` days (fetches only what is missing, once) */
  ensureHistory(userIds: UserId[], days: number): Promise<void>;
  /** older records are being fetched */
  historyLoading: boolean;
  saveProfile(p: Profile): Promise<void>;
  saveSubject(s: Omit<Subject, "id"> & { id?: string }): Promise<Subject>;
  /** R-019: find my subject by name (case/space-insensitive, un-archiving it) or create it */
  ensureSubject(name: string): Promise<Subject>;
  countSubjectSessions(id: string): Promise<number>;
  deleteSubject(id: string): Promise<void>;
  mergeSubject(fromId: string, toId: string): Promise<number>;
  /** R-019: subjects merged (→ kept id) or deleted (→ null) on this device; lets a running focus follow along */
  subjectRedirects: Record<string, string | null>;
  createRoom(name: string): Promise<Room>;
  joinRoom(code: string): Promise<Room>;
  leaveRoom(id: string): Promise<void>;
  addSession(s: Omit<Session, "id">): Promise<Session>;
  updateSession(id: string, patch: Partial<Pick<Session, "rating" | "note" | "task" | "subjectId" | "durationMs" | "endedAt">>): Promise<void>;
  deleteSession(id: string): Promise<void>;
  setLive(l: LiveStatus): Promise<void>;
  /** R-005: set or clear (null) my personal status */
  setMyStatus(s: PersonalStatus | null): Promise<void>;
  toggleKudos(sessionId: string, emoji: string): Promise<void>;
  sendSignal(s: DistOmit<Signal, "from" | "at">): Promise<void>;
  signOut(): Promise<void>;
  /** R-007 收工: everyone's daily reviews (about a year) */
  reviews: DailyReview[];
  saveReview(r: Omit<DailyReview, "userId" | "createdAt" | "updatedAt">): Promise<DailyReview>;
  /** R-024: comments on everyone's records from the last few weeks, oldest first */
  comments: SessionComment[];
  addComment(sessionId: string, ownerId: UserId, text: string): Promise<void>;
  deleteComment(id: string): Promise<void>;
  /** R-025: my to-dos (private); null while loading, and stays null if the table is missing */
  todos: Todo[] | null;
  todosError: string | null;
  addTodo(t: { text: string; subjectId: string | null; estimateMin: number | null }): Promise<Todo>;
  updateTodo(id: string, patch: Partial<Pick<Todo, "text" | "subjectId" | "estimateMin" | "doneAt">>): Promise<void>;
  deleteTodo(id: string): Promise<void>;
}

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const REDIRECTS = "tc-subject-redirects-v1";
/** R-019: names compare case-insensitively, ignoring surrounding spaces */
export const subjectKey = (name: string) => name.trim().toLowerCase();
/** follow merges/deletes, A→B→C */
export function resolveSubject(id: string | null, redirects: Record<string, string | null>): string | null {
  for (let i = 0; id && id in redirects && i < 20; i++) id = redirects[id];
  return id;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

/** a ticking clock, shared */
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const [status, setStatus] = useState<Ctx["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [profiles, setProfiles] = useState<Record<UserId, Profile>>({});
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [live, setLiveMap] = useState<Record<UserId, LiveStatus>>({});
  const [kudos, setKudos] = useState<Kudos[]>([]);
  const [online, setOnline] = useState<Set<UserId>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const creatingSubject = useRef(new Map<string, Promise<Subject>>());
  const [subjectRedirects, setSubjectRedirects] = useState<Record<string, string | null>>({});
  useEffect(() => { try { setSubjectRedirects(JSON.parse(localStorage.getItem(REDIRECTS) || "{}") || {}); } catch { /* */ } }, []);
  const [reviews, setReviews] = useState<DailyReview[]>([]);
  const [comments, setComments] = useState<SessionComment[]>([]);
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [todosError, setTodosError] = useState<string | null>(null);
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  const [historyBusy, setHistoryBusy] = useState(0);
  const now = useNow(1000);
  const cacheOn = backend.mode === "supabase"; // the demo already lives in this browser
  /** per person: records that started at or after this instant are all loaded */
  const coverRef = useRef<Record<UserId, number>>({});
  const inflightRef = useRef(new Map<UserId, { since: number; p: Promise<void> }>());
  /** the account the loaded data belongs to (null when signed out) */
  const startedFor = useRef<UserId | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** the network load has succeeded at least once for this account (only then is a snapshot worth saving) */
  const syncedRef = useRef(false);
  const rosterTried = useRef(new Set<UserId>());
  const rosterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const liveRef = useRef(live);
  liveRef.current = live;

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.ttl ?? 6000);
    if (typeof document !== "undefined" && document.hidden && "Notification" in window && Notification.permission === "granted") {
      try { new Notification(t.title, { body: t.body, icon: "/icon.svg" }); } catch { /* ignore */ }
    }
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((x) => x.filter((y) => y.id !== id)), []);

  const load = useCallback(async (u: AuthUser, background = false): Promise<void> => {
    try {
      const rs = await backend.listRooms();
      const ids = Array.from(new Set([u.id, ...rs.flatMap((r) => r.memberIds)]));
      const since = Date.now() - INITIAL_DAYS * DAY;
      const [ps, subs, ss, lv, ks] = await Promise.all([
        backend.getProfiles(ids), backend.listSubjects(ids), backend.listSessions(ids, since), backend.getLive(ids), backend.listRecentKudos(since),
      ]);
      let mine = ps.find((p) => p.id === u.id);
      const tz = browserTz();
      if (!mine) {
        mine = { id: u.id, name: (u.email || "").split("@")[0] || "同学", color: 0, tz, dailyGoalMin: 240, pomodoroMin: 25, breakMin: 5, look: null };
        await backend.saveProfile(mine);
        ps.push(mine);
      } else if (mine.tz !== tz) {
        mine = { ...mine, tz };
        backend.saveProfile(mine).catch(() => {}); // nothing waits on this
        ps.splice(ps.findIndex((p) => p.id === u.id), 1, mine);
      }
      if (startedFor.current !== u.id) return; // signed out meanwhile
      const idSet = new Set(ids);
      const cover: Record<UserId, number> = {};
      ids.forEach((id) => { cover[id] = Math.min(coverRef.current[id] ?? since, since); });
      coverRef.current = cover;
      setRooms(rs);
      setProfiles(Object.fromEntries(ps.map((p) => [p.id, p])));
      setSubjects(subs);
      // older records fetched for the data page stay; the recent window is replaced
      setSessions((list) => mergeSessions(list.filter((s) => s.startedAt < since && idSet.has(s.userId)), ss));
      setLiveMap(Object.fromEntries(lv.map((l) => [l.userId, l])));
      setKudos(ks);
      syncedRef.current = true;
      setStatus("ready");
      setError(null);
    } catch (e) {
      if (startedFor.current !== u.id) return;
      setError((e as Error).message);
      if (!background) { setStatus("error"); return; }
      // the page is already showing (saved) data: keep it, say so, try again once
      pushToast({ title: "暂时连不上服务器", body: "显示的可能不是最新数据，稍后自动重试" });
      if (!retryRef.current) retryRef.current = setTimeout(() => { retryRef.current = null; if (startedFor.current === u.id) load(u, true); }, 20_000);
    }
  }, [backend, pushToast]);

  /** first data for a freshly known account: the saved snapshot right away, then the network */
  const start = useCallback((u: AuthUser) => {
    if (startedFor.current === u.id) return; // currentUser() and the auth event both report the same sign-in
    startedFor.current = u.id;
    syncedRef.current = false;
    coverRef.current = {};
    inflightRef.current.clear();
    const snap = cacheOn ? readSnapshot(u.id) : null;
    if (snap) {
      setRooms(snap.rooms);
      setProfiles(Object.fromEntries(snap.profiles.map((p) => [p.id, p])));
      setSubjects(snap.subjects);
      setSessions([...snap.sessions].sort(byStartDesc));
      setLiveMap(Object.fromEntries(snap.live.map((l) => [l.userId, l])));
      setKudos(snap.kudos);
      [u.id, ...snap.rooms.flatMap((r) => r.memberIds)].forEach((id) => { if (snap.cover[id] != null) coverRef.current[id] = snap.cover[id]; });
      setStatus("ready");
    } else setStatus("loading");
    load(u, !!snap);
  }, [load, cacheOn]);

  const signedOut = useCallback(() => {
    startedFor.current = null;
    coverRef.current = {};
    inflightRef.current.clear();
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    dropSnapshots();
    setRooms([]); setProfiles({}); setSubjects([]); setSessions([]); setLiveMap({}); setKudos([]); setOnline(new Set()); setReviews([]); setComments([]); setTodos(null); setTodosError(null);
    setStatus("signedOut");
  }, []);

  // auth
  useEffect(() => {
    let alive = true;
    backend.currentUser().then((u) => {
      if (!alive) return;
      setMe(u);
      if (u) start(u); else signedOut();
    });
    const off = backend.onAuthChange((u) => {
      setMe((prev) => (prev?.id === u?.id ? prev : u));
      if (u) start(u); else signedOut();
    });
    return () => { alive = false; off(); };
  }, [backend, start, signedOut]);

  const ensureHistory = useCallback(async (userIds: UserId[], days: number) => {
    const since = Date.now() - (days + 2) * DAY; // +2: the oldest day in any time zone, and records that cross midnight
    const waits: Promise<void>[] = [];
    const need: UserId[] = [];
    let until = 0;
    for (const id of userIds) {
      const cov = coverRef.current[id];
      if (cov == null || cov <= since) continue;
      const f = inflightRef.current.get(id);
      if (f && f.since <= since) { waits.push(f.p); continue; }
      need.push(id);
      until = Math.max(until, Math.min(cov, f ? f.since : cov)); // what is already loaded or on its way is not asked for again
    }
    if (need.length) {
      const owner = startedFor.current;
      const p = (async () => {
        setHistoryBusy((n) => n + 1);
        try {
          const ss = await backend.listSessions(need, since, until);
          if (startedFor.current !== owner) return;
          need.forEach((id) => { if (coverRef.current[id] != null) coverRef.current[id] = Math.min(coverRef.current[id], since); });
          setSessions((list) => mergeSessions(list, ss));
        } catch (e) {
          pushToast({ title: "更早的记录没加载出来", body: (e as Error).message });
        } finally {
          setHistoryBusy((n) => n - 1);
          need.forEach((id) => { if (inflightRef.current.get(id)?.p === p) inflightRef.current.delete(id); });
        }
      })();
      need.forEach((id) => inflightRef.current.set(id, { since, p }));
      waits.push(p);
    }
    await Promise.all(waits);
  }, [backend, pushToast]);

  const peopleIds = useMemo(() => {
    if (!me) return [];
    const ids = new Set<UserId>([me.id]);
    rooms.forEach((r) => r.memberIds.forEach((m) => ids.add(m)));
    return Array.from(ids).sort((a, b) => (a === me.id ? -1 : b === me.id ? 1 : (profiles[a]?.name || "").localeCompare(profiles[b]?.name || "")));
  }, [me, rooms, profiles]);
  const idsKey = [...peopleIds].sort().join(",");
  /** bumps after the page catches up (back from the background, the laptop woke up, the network came back): channels are rebuilt */
  const [syncTick, setSyncTick] = useState(0);
  // Realtime does not replay what happened while the connection was down, so a classmate who stopped
  // focusing while this laptop slept would look like they were still focusing, for hours. Catch up instead.
  useEffect(() => {
    if (status !== "ready" || !me) return;
    const ids = idsKey.split(",").filter(Boolean);
    let last = Date.now();
    const resync = () => {
      if (Date.now() - last < 10_000) return;
      last = Date.now();
      load(me, true);
      setSyncTick((t) => t + 1);
    };
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 30_000) resync();
      hiddenAt = 0;
    };
    // timers stall while the computer sleeps: a long gap between ticks means events were missed
    let tick = Date.now();
    const wake = setInterval(() => { const gap = Date.now() - tick; tick = Date.now(); if (gap > 60_000) resync(); }, 15_000);
    // and a light safety net while the page is open: everyone's live state every 2 minutes
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      backend.getLive(ids).then((lv) => setLiveMap((m) => {
        const next = { ...m };
        // my own entry is driven by this device's timer; the server copy may lag behind it
        lv.forEach((l) => { if (l.userId !== me.id) next[l.userId] = l; });
        return next;
      })).catch(() => { /* offline: the next tick tries again */ });
    }, 120_000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", resync);
    return () => { clearInterval(wake); clearInterval(poll); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", resync); };
  }, [status, me, idsKey, backend, load]);
  const roomKey = rooms.map((r) => r.id).join(",");

  // realtime
  useEffect(() => {
    if (status !== "ready" || !me) return;
    const ids = idsKey.split(",").filter(Boolean);
    const off = backend.subscribe(ids, {
      onLive: (l) => {
        const prev = liveRef.current[l.userId];
        if (l.userId !== me.id && l.state === "focus" && prev?.state !== "focus" && prev?.state !== "paused") {
          const p = profilesRef.current[l.userId];
          if (p) pushToast({ title: `${p.name} 开始专注`, body: [l.subjectName, l.task].filter(Boolean).join(" · ") || undefined, color: p.color });
        }
        setLiveMap((m) => ({ ...m, [l.userId]: l }));
      },
      onSession: (s, kind) => setSessions((list) => {
        const rest = list.filter((x) => x.id !== s.id);
        return kind === "delete" ? rest : [s, ...rest].sort((a, b) => b.startedAt - a.startedAt);
      }),
      onKudos: (k, kind) => {
        setKudos((list) => (kind === "delete" ? list.filter((x) => x.id !== k.id) : list.some((x) => x.id === k.id) ? list : [...list, k]));
        if (kind === "insert" && k.fromUser !== me.id) {
          setSessions((list) => {
            const s = list.find((x) => x.id === k.sessionId);
            const p = profilesRef.current[k.fromUser];
            if (s && s.userId === me.id && p) pushToast({ title: `${p.name} 给你的专注点了 ${k.emoji}`, body: s.task || undefined, color: p.color });
            return list;
          });
        }
      },
    });
    const known = new Set(ids);
    const offP = backend.presence(me.id, roomKey.split(",").filter(Boolean), (on) => {
      setOnline(on);
      // someone new joined one of my rooms: fetch the roster again, which also resubscribes with them in the filter
      const fresh = Array.from(on).filter((id) => !known.has(id) && !rosterTried.current.has(id));
      if (!fresh.length) return;
      fresh.forEach((id) => rosterTried.current.add(id));
      if (!rosterTimer.current) rosterTimer.current = setTimeout(() => { rosterTimer.current = null; if (startedFor.current === me.id) load(me, true); }, 1500);
    });
    const offS = backend.onSignal(me.id, (s) => {
      const p = profilesRef.current[s.from];
      const name = p?.name || "同窗";
      if (s.kind === "poke") pushToast({ title: `${name} 戳了戳你`, body: "该回来学习啦", color: p?.color });
      if (s.kind === "cheer") pushToast({ title: name, body: s.text, color: p?.color });
      if (s.kind === "invite") {
        const q = new URLSearchParams({ mode: s.mode, min: String(s.minutes), task: s.task, with: s.from });
        pushToast({ title: `${name} 邀请你一起专注`, body: `${s.mode === "pomodoro" ? s.minutes + " 分钟番茄钟" : s.mode === "countdown" ? s.minutes + " 分钟倒计时" : "心流"}${s.task ? " · " + s.task : ""}`, color: p?.color, action: { label: "一起开始", href: "/focus?" + q.toString() }, ttl: 20000 });
      }
    });
    return () => { off(); offP(); offS(); };
  }, [status, me, idsKey, roomKey, backend, pushToast, load, syncTick]);

  /** R-019: drop a subject locally and repoint my records at `to` (null = uncategorized) */
  const redirectSubject = (from: string, to: string | null) => {
    setSubjects((l) => l.filter((x) => x.id !== from));
    setSessions((l) => l.map((x) => (x.subjectId === from && x.userId === me?.id ? { ...x, subjectId: to } : x)));
    setTodos((l) => l && l.map((t) => (t.subjectId === from ? { ...t, subjectId: to } : t)));
    setSubjectRedirects((m) => {
      const next = { ...m, [from]: to };
      try { localStorage.setItem(REDIRECTS, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  };
  // R-007 收工: reviews load on their own so they never hold up the first screen
  useEffect(() => {
    if (status !== "ready" || !me) return;
    const ids = idsKey.split(",").filter(Boolean);
    let alive = true;
    const upsert = (r: DailyReview) => setReviews((list) => [r, ...list.filter((x) => !(x.userId === r.userId && x.day === r.day))]);
    backend.listReviews(ids, addDaysKey(dayKey(Date.now(), "UTC"), -370))
      .then((rs) => { if (alive) setReviews(rs.sort((a, b) => b.updatedAt - a.updatedAt)); })
      .catch(() => { /* table missing until the R-007 migration runs: the feature just stays empty */ });
    const off = backend.subscribeReviews(ids, upsert);
    return () => { alive = false; off(); };
  }, [status, me, idsKey, backend, syncTick]);

  // R-024 自习记录评论: load on their own, then follow live; a toast when someone comments on my record or answers me
  useEffect(() => {
    if (status !== "ready" || !me) return;
    const ids = idsKey.split(",").filter(Boolean);
    let alive = true;
    const add = (c: SessionComment) => setComments((l) => (l.some((x) => x.id === c.id) ? l : [...l, c].sort((a, b) => a.createdAt - b.createdAt)));
    backend.listComments(ids, Date.now() - 40 * 86400_000)
      .then((cs) => { if (alive) setComments((l) => { const seen = new Set(cs.map((c) => c.id)); return [...cs, ...l.filter((x) => !seen.has(x.id))].sort((a, b) => a.createdAt - b.createdAt); }); })
      .catch(() => { /* table missing until the R-024 migration runs: no comments yet */ });
    const off = backend.subscribeComments(ids, (c, kind) => {
      if (kind === "delete") { setComments((l) => l.filter((x) => x.id !== c.id)); return; }
      if (commentsRef.current.some((x) => x.id === c.id)) return;
      // someone else's record: only when its owner answers a thread I am in
      const answered = commentsRef.current.some((x) => x.sessionId === c.sessionId && x.authorId === me.id);
      add(c);
      if (c.authorId === me.id) return;
      const mine = c.ownerId === me.id;
      if (!mine && !(answered && c.authorId === c.ownerId)) return;
      const p = profilesRef.current[c.authorId];
      pushToast({
        title: mine ? `${p?.name || "同窗"} 评论了你的记录` : `${p?.name || "同窗"} 回复了你`, body: c.text, color: p?.color, ttl: 12000,
        action: typeof location !== "undefined" && location.pathname === "/" ? undefined : { label: "去看看", href: "/" },
      });
    });
    return () => { alive = false; off(); };
  }, [status, me, idsKey, backend, pushToast, syncTick]);

  // R-025 待办: mine only, loaded once the app is ready
  useEffect(() => {
    if (status !== "ready" || !me) return;
    let alive = true;
    backend.listTodos()
      .then((ts) => { if (alive) { setTodos(ts); setTodosError(null); } })
      .catch((e) => { if (alive) { setTodos(null); setTodosError((e as Error).message || "待办没加载出来"); } });
    return () => { alive = false; };
  }, [status, me, backend]);

  // R-020 留言板: someone left a note on my board → a toast on whatever page I'm on
  useEffect(() => {
    if (status !== "ready" || !me) return;
    const off = backend.subscribeGuestbook(me.id, (e, kind) => {
      if (kind !== "insert" || e.authorId === me.id) return; // notes to myself are memos, no toast
      const href = `/u/${me.id}`;
      const p = profilesRef.current[e.authorId];
      const what = e.parentId
        ? (e.replyTo === me.id ? "回复了你" : `回复了${profilesRef.current[e.replyTo || ""]?.name || "同窗"}`)
        : e.sticker ? (e.text ? "贴了一张便利贴" : "贴了一张贴纸") : "留了一句话";
      pushToast({
        title: `${p?.name || "同窗"} 在你的留言板${what}`, body: e.text || undefined, color: p?.color, ttl: 12000,
        // already looking at my board: no button to go there
        action: typeof location !== "undefined" && location.pathname === href ? undefined : { label: "去看看", href },
      });
    });
    // R-023: someone answered me on another classmate's board (my own board is covered above)
    const offR = backend.subscribeGuestbookReplies(me.id, (e) => {
      if (e.authorId === me.id || e.ownerId === me.id) return;
      const href = `/u/${e.ownerId}`;
      const p = profilesRef.current[e.authorId];
      const owner = profilesRef.current[e.ownerId];
      pushToast({
        title: `${p?.name || "同窗"} 在${e.authorId === e.ownerId ? "TA 的" : ` ${owner?.name || "同窗"} 的`}留言板回复了你`, body: e.text || undefined, color: p?.color, ttl: 12000,
        action: typeof location !== "undefined" && location.pathname === href ? undefined : { label: "去看看", href },
      });
    });
    return () => { off(); offR(); };
  }, [status, me, backend, pushToast]);

  // a streak that reaches back to the oldest loaded day may be longer: fetch my older records, doubling each time
  useEffect(() => {
    if (status !== "ready" || !me) return;
    const tz = profiles[me.id]?.tz;
    const cov = coverRef.current[me.id];
    if (!tz || cov == null) return;
    const have = Math.floor((Date.now() - cov) / DAY);
    if (have >= HISTORY_DAYS) return;
    const st = streaks(byDay(sessions.filter((s) => s.userId === me.id), tz), tz);
    if (st.current >= have - 2) ensureHistory([me.id], Math.min(HISTORY_DAYS, have * 2));
  }, [status, me, sessions, profiles, ensureHistory]);

  // keep a snapshot of the recent data for the next visit
  const snapshot = useCallback((): Snapshot | null => {
    if (!cacheOn || status !== "ready" || !me || startedFor.current !== me.id || !syncedRef.current) return null;
    // classmates: the recent window; me: whatever is loaded (a long streak then shows right away next time)
    const floor = Date.now() - INITIAL_DAYS * DAY;
    const cover: Record<UserId, number> = {};
    for (const [id, t] of Object.entries(coverRef.current)) cover[id] = id === me.id ? t : Math.max(t, floor);
    const recent = sessions.filter((s) => cover[s.userId] != null && s.startedAt >= cover[s.userId]);
    const sids = new Set(recent.map((s) => s.id));
    return {
      v: CACHE_V, uid: me.id, at: Date.now(), cover, rooms, profiles: Object.values(profiles), subjects, sessions: recent,
      live: Object.values(live), kudos: kudos.filter((k) => sids.has(k.sessionId) && !k.id.startsWith("tmp-")),
    };
  }, [cacheOn, status, me, rooms, profiles, subjects, sessions, live, kudos]);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  useEffect(() => {
    const t = setTimeout(() => { const s = snapshot(); if (s) writeSnapshot(s); }, 2000);
    return () => clearTimeout(t);
  }, [snapshot]);
  useEffect(() => {
    const flush = () => { const s = snapshotRef.current(); if (s) writeSnapshot(s); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onHide); };
  }, []);

  const reload = useCallback(async () => { if (me) await load(me, status === "ready"); }, [me, load, status]);

  const value: Ctx = {
    backend, status, error, me, myProfile: me ? profiles[me.id] || null : null, profiles, peopleIds, subjects, rooms, sessions, live, kudos, online, toasts, now,
    pushToast, dismissToast, reload, ensureHistory, historyLoading: historyBusy > 0,
    async saveProfile(p) { await backend.saveProfile(p); setProfiles((m) => ({ ...m, [p.id]: p })); },
    // an edited subject keeps its place in the list (renaming or recoloring used to move it to the end)
    async saveSubject(s) { const r = await backend.saveSubject(s); setSubjects((l) => (l.some((x) => x.id === r.id) ? l.map((x) => (x.id === r.id ? r : x)) : [...l, r])); return r; },
    async ensureSubject(name) {
      if (!me) throw new Error("未登录");
      const key = subjectKey(name);
      if (!key) throw new Error("科目名称不能为空");
      const mine = subjects.filter((x) => x.userId === me.id);
      const same = mine.filter((x) => subjectKey(x.name) === key);
      const hit = same.find((x) => !x.archived) || same[0];
      if (hit && !hit.archived) return hit;
      // a second Enter/blur while the first save is in flight must not create a twin
      const inflight = creatingSubject.current.get(key);
      if (inflight) return inflight;
      const used = new Set(mine.filter((x) => !x.archived).map((x) => x.color));
      const color = [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !used.has(c)) ?? mine.length % 8;
      const p = value.saveSubject(hit ? { ...hit, archived: false } : { userId: me.id, name: name.trim(), color, archived: false });
      creatingSubject.current.set(key, p);
      try { return await p; } finally { creatingSubject.current.delete(key); }
    },
    countSubjectSessions: (id) => backend.countSubjectSessions(id),
    async deleteSubject(id) {
      await backend.deleteSubject(id);
      redirectSubject(id, null);
    },
    async mergeSubject(fromId, toId) {
      const n = await backend.mergeSubject(fromId, toId);
      redirectSubject(fromId, toId);
      return n;
    },
    subjectRedirects,
    async createRoom(name) { const r = await backend.createRoom(name); await reload(); return r; },
    async joinRoom(code) { const r = await backend.joinRoom(code); await reload(); return r; },
    async leaveRoom(id) { await backend.leaveRoom(id); await reload(); },
    async addSession(s) {
      // R-019: the subject may have been merged or deleted while this focus was running
      const sid = resolveSubject(s.subjectId, subjectRedirects);
      s = { ...s, subjectId: sid && (s.userId !== me?.id || subjects.some((x) => x.id === sid)) ? sid : null };
      const r = await backend.addSession(s);
      setSessions((l) => [r, ...l.filter((x) => x.id !== r.id)].sort((a, b) => b.startedAt - a.startedAt));
      return r;
    },
    async updateSession(id, patch) {
      const cur = sessions.find((x) => x.id === id);
      if (cur && patch.durationMs != null) {
        // a record can only get shorter: forgetting to stop the timer is the only legitimate correction
        if (patch.durationMs > cur.durationMs) throw new Error("时长只能改短，不能改长");
        if (patch.durationMs < 60_000) throw new Error("时长至少 1 分钟");
        patch = { ...patch, endedAt: cur.endedAt - (cur.durationMs - patch.durationMs) };
      }
      await backend.updateSession(id, patch);
      setSessions((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },
    async deleteSession(id) { await backend.deleteSession(id); setSessions((l) => l.filter((x) => x.id !== id)); },
    async setLive(l) {
      const prev = liveRef.current[l.userId];
      let out = l;
      if (l.statusEmoji === undefined && prev) {
        // R-005: starting a new focus block clears my status unless I asked to keep it
        const starting = l.userId === me?.id && l.state === "focus" && prev.state !== "focus" && prev.state !== "paused";
        const st = activeStatus(prev);
        if (starting && st && !readStatusPrefs().keepOnFocus) {
          out = { ...l, ...statusPatch(null) };
          pushToast({ title: "开始专注，状态已清除", body: `${st.emoji} ${st.text}`.trim(), ttl: 3500 });
        }
      }
      // writers that leave the status out keep the stored one
      const keep = prev ? { statusEmoji: prev.statusEmoji, statusText: prev.statusText, statusUntil: prev.statusUntil, statusSetAt: prev.statusSetAt } : {};
      const merged: LiveStatus = out.statusEmoji === undefined ? { ...out, ...keep } : out;
      setLiveMap((m) => ({ ...m, [l.userId]: merged }));
      await backend.setLive(out);
    },
    async setMyStatus(st) {
      if (!me) return;
      const cur: LiveStatus = liveRef.current[me.id] || { userId: me.id, state: "idle", task: "", subjectName: "", subjectColor: null, mode: "stopwatch", startedAt: null, plannedEnd: null, accumulatedMs: 0, runningSince: null, updatedAt: Date.now() };
      const next: LiveStatus = { ...cur, ...statusPatch(st), updatedAt: Date.now() };
      liveRef.current = { ...liveRef.current, [me.id]: next };
      setLiveMap((m) => ({ ...m, [me.id]: next }));
      await backend.setLive(next);
    },
    async toggleKudos(sessionId, emoji) {
      if (!me) return;
      const has = kudos.find((k) => k.sessionId === sessionId && k.fromUser === me.id && k.emoji === emoji);
      if (has) {
        setKudos((l) => l.filter((k) => k !== has));
        await backend.removeKudos(sessionId, emoji);
      } else {
        const tmp: Kudos = { id: "tmp-" + Math.random(), sessionId, fromUser: me.id, emoji, createdAt: Date.now() };
        setKudos((l) => [...l, tmp]);
        await backend.addKudos(sessionId, emoji);
        setKudos((l) => l.filter((k) => k !== tmp || !l.some((x) => x !== tmp && x.sessionId === sessionId && x.fromUser === me.id && x.emoji === emoji)));
      }
    },
    async sendSignal(s) { if (me) await backend.sendSignal({ ...s, from: me.id, at: Date.now() } as Signal); },
    async signOut() { dropSnapshots(); await backend.signOut(); },
    todos, todosError,
    async addTodo(t) {
      const saved = await backend.addTodo(t);
      setTodos((l) => [...(l || []), saved]);
      return saved;
    },
    async updateTodo(id, patch) {
      const before = todos;
      setTodos((l) => l && l.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      try { await backend.updateTodo(id, patch); } catch (e) { setTodos(before); throw e; }
    },
    async deleteTodo(id) {
      await backend.deleteTodo(id);
      setTodos((l) => l && l.filter((t) => t.id !== id));
      setSessions((l) => l.map((x) => (x.todoId === id ? { ...x, todoId: null } : x)));
    },
    comments,
    async addComment(sessionId, ownerId, text) {
      const c = await backend.addComment({ sessionId, ownerId, text });
      setComments((l) => (l.some((x) => x.id === c.id) ? l : [...l, c]));
    },
    async deleteComment(id) {
      await backend.deleteComment(id);
      setComments((l) => l.filter((x) => x.id !== id));
    },
    reviews,
    async saveReview(r) {
      if (!me) throw new Error("还没登录");
      const saved = await backend.saveReview({ ...r, userId: me.id });
      setReviews((list) => [saved, ...list.filter((x) => !(x.userId === saved.userId && x.day === saved.day))]);
      return saved;
    },
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
