"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getBackend } from "./backend";
import type { Backend } from "./backend/types";
import type { AuthUser, Kudos, LiveStatus, Profile, Room, Session, Signal, Subject, UserId } from "./types";
import { browserTz, DAY } from "./time";

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
  saveProfile(p: Profile): Promise<void>;
  saveSubject(s: Omit<Subject, "id"> & { id?: string }): Promise<Subject>;
  createRoom(name: string): Promise<Room>;
  joinRoom(code: string): Promise<Room>;
  leaveRoom(id: string): Promise<void>;
  addSession(s: Omit<Session, "id">): Promise<Session>;
  updateSession(id: string, patch: Partial<Pick<Session, "rating" | "note" | "task" | "subjectId" | "durationMs" | "endedAt">>): Promise<void>;
  deleteSession(id: string): Promise<void>;
  setLive(l: LiveStatus): Promise<void>;
  toggleKudos(sessionId: string, emoji: string): Promise<void>;
  sendSignal(s: DistOmit<Signal, "from" | "at">): Promise<void>;
  signOut(): Promise<void>;
}

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

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
  const now = useNow(1000);
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

  const load = useCallback(async (u: AuthUser) => {
    try {
      const rs = await backend.listRooms();
      const ids = Array.from(new Set([u.id, ...rs.flatMap((r) => r.memberIds)]));
      const [ps, subs, ss, lv] = await Promise.all([
        backend.getProfiles(ids), backend.listSubjects(ids), backend.listSessions(ids, Date.now() - 400 * DAY), backend.getLive(ids),
      ]);
      let mine = ps.find((p) => p.id === u.id);
      const tz = browserTz();
      if (!mine) {
        mine = { id: u.id, name: (u.email || "").split("@")[0] || "同学", color: 0, tz, dailyGoalMin: 240, pomodoroMin: 25, breakMin: 5, look: null };
        await backend.saveProfile(mine);
        ps.push(mine);
      } else if (mine.tz !== tz) {
        mine = { ...mine, tz };
        await backend.saveProfile(mine);
        ps.splice(ps.findIndex((p) => p.id === u.id), 1, mine);
      }
      const recentIds = ss.filter((s) => s.startedAt > Date.now() - 60 * DAY).map((s) => s.id);
      const ks = await backend.listKudos(recentIds);
      setRooms(rs);
      setProfiles(Object.fromEntries(ps.map((p) => [p.id, p])));
      setSubjects(subs);
      setSessions(ss.sort((a, b) => b.startedAt - a.startedAt));
      setLiveMap(Object.fromEntries(lv.map((l) => [l.userId, l])));
      setKudos(ks);
      setStatus("ready");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, [backend]);

  // auth
  useEffect(() => {
    let alive = true;
    backend.currentUser().then((u) => {
      if (!alive) return;
      setMe(u);
      if (u) load(u); else setStatus("signedOut");
    });
    const off = backend.onAuthChange((u) => {
      setMe((prev) => {
        if (u && prev?.id !== u.id) { setStatus("loading"); load(u); }
        if (!u) setStatus("signedOut");
        return u;
      });
    });
    return () => { alive = false; off(); };
  }, [backend, load]);

  const peopleIds = useMemo(() => {
    if (!me) return [];
    const ids = new Set<UserId>([me.id]);
    rooms.forEach((r) => r.memberIds.forEach((m) => ids.add(m)));
    return Array.from(ids).sort((a, b) => (a === me.id ? -1 : b === me.id ? 1 : (profiles[a]?.name || "").localeCompare(profiles[b]?.name || "")));
  }, [me, rooms, profiles]);
  const idsKey = peopleIds.join(",");
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
    const offP = backend.presence(me.id, roomKey.split(",").filter(Boolean), setOnline);
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
  }, [status, me, idsKey, roomKey, backend, pushToast]);

  const reload = useCallback(async () => { if (me) await load(me); }, [me, load]);

  const value: Ctx = {
    backend, status, error, me, myProfile: me ? profiles[me.id] || null : null, profiles, peopleIds, subjects, rooms, sessions, live, kudos, online, toasts, now,
    pushToast, dismissToast, reload,
    async saveProfile(p) { await backend.saveProfile(p); setProfiles((m) => ({ ...m, [p.id]: p })); },
    async saveSubject(s) { const r = await backend.saveSubject(s); setSubjects((l) => [...l.filter((x) => x.id !== r.id), r]); return r; },
    async createRoom(name) { const r = await backend.createRoom(name); await reload(); return r; },
    async joinRoom(code) { const r = await backend.joinRoom(code); await reload(); return r; },
    async leaveRoom(id) { await backend.leaveRoom(id); await reload(); },
    async addSession(s) {
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
    async setLive(l) { setLiveMap((m) => ({ ...m, [l.userId]: l })); await backend.setLive(l); },
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
    async signOut() { await backend.signOut(); },
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
