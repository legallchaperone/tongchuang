import type { Backend } from "./types";
import type { AuthUser, Kudos, LiveStatus, Profile, Room, Session, Signal, Subject, UserId } from "../types";
import { browserTz, DAY, MIN, partsIn, zonedToUtc } from "../time";

/**
 * Demo backend: everything lives in this browser (localStorage).
 * Two simulated classmates in other time zones follow a daily rhythm in their own local time,
 * so their live status, history and replies look like the real thing.
 */

const KEY = "tc-demo-v3";
const AUTH = "tc-demo-auth";
const ME = "demo-me";

type DB = {
  profiles: Profile[]; subjects: Subject[]; rooms: Room[]; sessions: Session[];
  live: LiveStatus[]; kudos: Kudos[]; seededAt: number;
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

type Friend = { id: UserId; name: string; color: number; tz: string; look: { skin: number; hair: number; hairColor: number }; blocks: [number, number][]; subjects: [string, number][]; tasks: Record<string, string[]>; goal: number };

function friendsFor(myTz: string): Friend[] {
  // pick friend zones that differ from the viewer's
  const far = myTz.startsWith("America") ? ["Asia/Shanghai", "Europe/London"] : myTz.startsWith("Europe") ? ["America/New_York", "Asia/Shanghai"] : ["America/New_York", "Europe/London"];
  return [
    { id: "demo-lin", name: "林舟", color: 1, tz: far[0], goal: 300, look: { skin: 1, hair: 4, hairColor: 1 },
      blocks: [[9.5, 12], [14.5, 17.5], [20.5, 23.5]],
      subjects: [["算法", 2], ["GRE 词汇", 4], ["实验报告", 6]],
      tasks: { "算法": ["动态规划专题", "LeetCode 周赛复盘", "图论 最短路"], "GRE 词汇": ["再要你命 List 12", "填空 30 题"], "实验报告": ["数据清洗", "写讨论部分"] } },
    { id: "demo-mia", name: "Mia", color: 2, tz: far[1], goal: 240, look: { skin: 0, hair: 2, hairColor: 2 },
      blocks: [[8, 10.5], [13, 15.5], [19, 21.5]],
      subjects: [["有机化学", 3], ["论文阅读", 7], ["法语", 5]],
      tasks: { "有机化学": ["第 9 章 亲核取代", "反应机理卡片"], "论文阅读": ["Attention 那篇精读", "综述 第 3 节"], "法语": ["听力 B2", "动词变位"] } },
  ];
}
const mySubjects: [string, number][] = [["线性代数", 0], ["毕业论文", 1], ["英语阅读", 2], ["编程", 3]];
const myTasks: Record<string, string[]> = {
  "线性代数": ["第 4 章 特征值习题", "复习 SVD", "真题 2023"], "毕业论文": ["写相关工作", "改实验图", "整理参考文献"],
  "英语阅读": ["经济学人 一篇精读", "长难句 20 句"], "编程": ["写 Rust 小项目", "刷 3 道题"],
};
const notes = ["状态不错，一口气做完", "中间走神了一会儿", "终于搞懂了", "有点困，但坚持下来了", "", "", "效率很高", "明天继续"];

function genDay(r: () => number, userId: UserId, tz: string, dayStart: { y: number; mo: number; d: number }, blocks: [number, number][], subs: Subject[], tasks: Record<string, string[]>, until: number, weekendLazy: boolean) {
  const out: Session[] = [];
  const wd = new Date(Date.UTC(dayStart.y, dayStart.mo - 1, dayStart.d)).getUTCDay();
  for (const [a, b] of blocks) {
    if (r() < (weekendLazy && (wd === 0 || wd === 6) ? 0.55 : 0.22)) continue;
    let t = a + (r() - 0.5) * 0.8;
    const end = b + (r() - 0.5) * 0.8;
    const sub = subs[Math.floor(r() * subs.length)];
    const pomo = r() < 0.6;
    while (t < end - 0.3) {
      const len = pomo ? 25 / 60 : 0.6 + r() * 0.9;
      const startH = Math.floor(t), startM = Math.round((t - startH) * 60);
      const start = zonedToUtc(dayStart.y, dayStart.mo, dayStart.d, startH, startM, tz);
      const dms = Math.round(len * 3600_000);
      if (start + dms > until) return out;
      const list = tasks[sub.name] || ["自习"];
      out.push({
        id: uid(), userId, subjectId: sub.id, task: list[Math.floor(r() * list.length)], startedAt: start, endedAt: start + dms,
        durationMs: dms, mode: pomo ? "pomodoro" : "stopwatch", rating: r() < 0.85 ? Math.min(5, Math.max(2, Math.round(3.4 + (r() - 0.4) * 2.4))) : null,
        note: r() < 0.35 ? notes[Math.floor(r() * notes.length)] : "", tz,
      });
      t += len + (pomo ? 5 / 60 : 0.15 + r() * 0.3);
    }
  }
  return out;
}

function seed(): DB {
  const myTz = browserTz();
  const now = Date.now();
  const fr = friendsFor(myTz);
  const profiles: Profile[] = [
    { id: ME, name: "我", color: 0, tz: myTz, dailyGoalMin: 240, pomodoroMin: 25, breakMin: 5, look: { skin: 0, hair: 0, hairColor: 0 } },
    ...fr.map((f) => ({ id: f.id, name: f.name, color: f.color, tz: f.tz, dailyGoalMin: f.goal, pomodoroMin: 25, breakMin: 5, look: f.look })),
  ];
  const subjects: Subject[] = [
    ...mySubjects.map(([n, c]) => ({ id: uid(), userId: ME, name: n, color: c, archived: false })),
    ...fr.flatMap((f) => f.subjects.map(([n, c]) => ({ id: uid(), userId: f.id, name: n, color: c, archived: false }))),
  ];
  const sessions: Session[] = [];
  const all = [{ id: ME, tz: myTz, blocks: [[9, 11.5], [14, 16.5], [20, 22.5]] as [number, number][], tasks: myTasks }, ...fr];
  all.forEach((u, ui) => {
    const r = rng(1234 + ui * 999);
    const subs = subjects.filter((s) => s.userId === u.id);
    for (let i = 200; i >= 0; i--) {
      const p = partsIn(now - i * DAY, u.tz);
      // fewer sessions further back, a couple of fully skipped days
      if (i > 120 && r() < 0.5) continue;
      if (r() < 0.07) continue;
      // keep today's live block for the simulator: stop before "now"
      sessions.push(...genDay(r, u.id, u.tz, p, u.blocks, subs, u.tasks, u.id === ME && i === 0 ? now - 2 * 3600_000 : now - 40 * MIN, true));
    }
  });
  const kudos: Kudos[] = [];
  const r = rng(77);
  sessions.filter((s) => s.userId === ME && s.startedAt > now - 10 * DAY).forEach((s) => {
    if (r() < 0.45) kudos.push({ id: uid(), sessionId: s.id, fromUser: fr[r() < 0.5 ? 0 : 1].id, emoji: ["👏", "🔥", "💪"][Math.floor(r() * 3)], createdAt: s.endedAt + 20 * MIN });
  });
  const room: Room = { id: "demo-room", name: "凌晨三点的图书馆", code: "DEMO42", createdBy: ME, memberIds: [ME, ...fr.map((f) => f.id)] };
  const live: LiveStatus[] = profiles.map((p) => ({ userId: p.id, state: "idle", task: "", subjectName: "", subjectColor: null, mode: "stopwatch", startedAt: null, plannedEnd: null, accumulatedMs: 0, runningSince: null, updatedAt: now }));
  return { profiles, subjects, rooms: [room], sessions, live, kudos, seededAt: now };
}

export function createDemoBackend(): Backend {
  let db: DB;
  try { db = (typeof window !== "undefined" && JSON.parse(localStorage.getItem(KEY) || "null")) || seed(); } catch { db = seed(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* full */ } };
  save();
  const fr = () => db.profiles.filter((p) => p.id !== ME);
  const friendDef = () => friendsFor(db.profiles.find((p) => p.id === ME)!.tz);

  const authCbs = new Set<(u: AuthUser | null) => void>();
  const subs = new Set<{ ids: Set<UserId>; h: Parameters<Backend["subscribe"]>[1] }>();
  const sigCbs = new Set<(s: Signal) => void>();
  const me = (): AuthUser | null => (localStorage.getItem(AUTH) ? { id: ME, email: "demo@tongchuang.app" } : null);

  const emitLive = (l: LiveStatus) => subs.forEach((s) => s.ids.has(l.userId) && s.h.onLive(l));
  const emitSession = (x: Session, k: "upsert" | "delete") => subs.forEach((s) => s.ids.has(x.userId) && s.h.onSession(x, k));
  const emitKudos = (k: Kudos, kind: "insert" | "delete") => subs.forEach((s) => s.h.onKudos(k, kind));

  /** an accepted invite overrides the schedule for a while */
  const holdUntil = new Map<UserId, number>();

  /** simulated classmates: derive their state from their local clock */
  function simulate() {
    const now = Date.now();
    for (const f of friendDef()) {
      if ((holdUntil.get(f.id) || 0) > now) continue;
      const p = partsIn(now, f.tz);
      const h = p.h + p.mi / 60;
      const block = f.blocks.find(([a, b]) => h >= a - 0.1 && h < b);
      const cur = db.live.find((l) => l.userId === f.id)!;
      const fsubs = db.subjects.filter((s) => s.userId === f.id);
      if (block) {
        const r = rng(p.d * 100 + Math.floor(block[0]) + f.id.length);
        const sub = fsubs[Math.floor(r() * fsubs.length)];
        const cycle = 30; // 25 focus + 5 break
        const minsIn = (h - block[0]) * 60;
        const inCycle = minsIn % cycle;
        const cycleStart = now - inCycle * MIN;
        const focusing = inCycle < 25;
        const task = (f.tasks[sub.name] || ["自习"])[Math.floor(r() * 2)] || "自习";
        const next: LiveStatus = focusing
          ? { userId: f.id, state: "focus", task, subjectName: sub.name, subjectColor: sub.color, mode: "pomodoro", startedAt: cycleStart, plannedEnd: cycleStart + 25 * MIN, accumulatedMs: 0, runningSince: cycleStart, updatedAt: cycleStart }
          : { userId: f.id, state: "break", task, subjectName: sub.name, subjectColor: sub.color, mode: "pomodoro", startedAt: cycleStart + 25 * MIN, plannedEnd: cycleStart + 30 * MIN, accumulatedMs: 0, runningSince: cycleStart + 25 * MIN, updatedAt: cycleStart + 25 * MIN };
        // log a finished pomodoro when a focus block flips to break
        if (cur.state === "focus" && next.state === "break" && cur.startedAt) {
          const s: Session = { id: uid(), userId: f.id, subjectId: sub.id, task: cur.task, startedAt: cur.startedAt, endedAt: cur.startedAt + 25 * MIN, durationMs: 25 * MIN, mode: "pomodoro", rating: 4, note: "", tz: f.tz };
          db.sessions.push(s); emitSession(s, "upsert");
        }
        if (cur.state !== next.state || cur.startedAt !== next.startedAt) { Object.assign(cur, next); emitLive(cur); }
      } else if (cur.state !== "idle") {
        Object.assign(cur, { state: "idle", task: "", subjectName: "", subjectColor: null, startedAt: null, plannedEnd: null, runningSince: null, accumulatedMs: 0, updatedAt: now });
        emitLive(cur);
      }
    }
    save();
  }
  if (typeof window !== "undefined") {
    simulate();
    setInterval(simulate, 15_000);
  }

  function reply(to: Signal) {
    const f = db.profiles.find((p) => p.id === to.to);
    if (!f) return;
    const h = partsIn(Date.now(), f.tz).h;
    const asleep = h < 7 || h >= 24;
    setTimeout(() => {
      let text = "收到！一起加油 💪";
      if (to.kind === "invite") text = asleep ? `我这边才 ${h} 点，先睡了，明早一起！` : "好！我也开始了";
      else if (asleep) text = `我这边 ${h} 点了…明天见 😴`;
      const s: Signal = { kind: "cheer", from: f.id, to: ME, at: Date.now(), text };
      sigCbs.forEach((cb) => cb(s));
      if (to.kind === "invite" && !asleep) {
        const l = db.live.find((x) => x.userId === f.id)!;
        const now = Date.now();
        Object.assign(l, { state: "focus", task: to.task || "一起自习", subjectName: "", subjectColor: null, mode: to.mode, startedAt: now, plannedEnd: to.mode === "pomodoro" ? now + to.minutes * MIN : null, runningSince: now, accumulatedMs: 0, updatedAt: now });
        holdUntil.set(f.id, now + (to.mode === "pomodoro" ? to.minutes : 50) * MIN);
        emitLive(l); save();
      }
    }, 1600 + Math.random() * 1500);
  }

  const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));

  return {
    mode: "demo",
    currentUser: async () => me(),
    onAuthChange(cb) { authCbs.add(cb); return () => authCbs.delete(cb); },
    async signInWithPassword() { localStorage.setItem(AUTH, "1"); authCbs.forEach((c) => c(me())); },
    async signUp() { localStorage.setItem(AUTH, "1"); authCbs.forEach((c) => c(me())); return { needsConfirm: false }; },
    async sendMagicLink() { localStorage.setItem(AUTH, "1"); authCbs.forEach((c) => c(me())); },
    async signOut() { localStorage.removeItem(AUTH); authCbs.forEach((c) => c(null)); },

    getProfiles: async (ids) => delay(db.profiles.filter((p) => ids.includes(p.id))),
    async saveProfile(p) { db.profiles = db.profiles.map((x) => (x.id === p.id ? p : x)); save(); },
    listSubjects: async (ids) => delay(db.subjects.filter((s) => ids.includes(s.userId))),
    async saveSubject(s) {
      const full: Subject = { ...s, id: s.id || uid() } as Subject;
      const i = db.subjects.findIndex((x) => x.id === full.id);
      if (i >= 0) db.subjects[i] = full; else db.subjects.push(full);
      save(); return full;
    },
    listRooms: async () => delay(db.rooms.filter((r) => r.memberIds.includes(ME))),
    async createRoom(name) {
      const r: Room = { id: uid(), name, code: Math.random().toString(36).slice(2, 8).toUpperCase(), createdBy: ME, memberIds: [ME] };
      db.rooms.push(r); save(); return r;
    },
    async joinRoom(code) {
      const r = db.rooms.find((x) => x.code === code.trim().toUpperCase());
      if (!r) throw new Error("演示模式下只有邀请码 DEMO42 可用");
      if (!r.memberIds.includes(ME)) r.memberIds.push(ME);
      save(); return r;
    },
    async leaveRoom(id) { const r = db.rooms.find((x) => x.id === id); if (r) r.memberIds = r.memberIds.filter((m) => m !== ME); save(); },

    listSessions: async (ids, since) => delay(db.sessions.filter((s) => ids.includes(s.userId) && s.startedAt >= since)),
    async addSession(s) {
      const full = { ...s, id: uid() };
      db.sessions.push(full); save(); emitSession(full, "upsert");
      // a classmate who is awake reacts now and then
      setTimeout(() => {
        const awake = fr().filter((p) => { const h = partsIn(Date.now(), p.tz).h; return h >= 8 && h < 24; });
        if (!awake.length || full.durationMs < 10 * MIN) return;
        const k: Kudos = { id: uid(), sessionId: full.id, fromUser: awake[0].id, emoji: full.durationMs > 45 * MIN ? "🔥" : "👏", createdAt: Date.now() };
        db.kudos.push(k); save(); emitKudos(k, "insert");
      }, 4000);
      return full;
    },
    async updateSession(id, patch) {
      const s = db.sessions.find((x) => x.id === id); if (!s) return;
      Object.assign(s, patch); save(); emitSession(s, "upsert");
    },
    async deleteSession(id) {
      const s = db.sessions.find((x) => x.id === id); if (!s) return;
      db.sessions = db.sessions.filter((x) => x.id !== id); save(); emitSession(s, "delete");
    },
    getLive: async (ids) => delay(db.live.filter((l) => ids.includes(l.userId)).map((l) => ({ ...l }))),
    async setLive(l) {
      const i = db.live.findIndex((x) => x.userId === l.userId);
      if (i >= 0) db.live[i] = l; else db.live.push(l);
      save(); emitLive(l);
    },
    listKudos: async (ids) => delay(db.kudos.filter((k) => ids.includes(k.sessionId))),
    async addKudos(sessionId, emoji) {
      if (db.kudos.some((k) => k.sessionId === sessionId && k.fromUser === ME && k.emoji === emoji)) return;
      const k: Kudos = { id: uid(), sessionId, fromUser: ME, emoji, createdAt: Date.now() };
      db.kudos.push(k); save(); emitKudos(k, "insert");
    },
    async removeKudos(sessionId, emoji) {
      const k = db.kudos.find((x) => x.sessionId === sessionId && x.fromUser === ME && x.emoji === emoji);
      if (!k) return;
      db.kudos = db.kudos.filter((x) => x !== k); save(); emitKudos(k, "delete");
    },
    subscribe(ids, h) { const s = { ids: new Set(ids), h }; subs.add(s); return () => subs.delete(s); },
    presence(meId, _rooms, onOnline) {
      const tick = () => {
        // a classmate "has the app open" while awake
        const on = new Set<UserId>([meId]);
        fr().forEach((p) => { const hh = partsIn(Date.now(), p.tz).h; if (hh >= 8 && hh < 24) on.add(p.id); });
        onOnline(on);
      };
      tick();
      const t = setInterval(tick, 30_000);
      return () => clearInterval(t);
    },
    async sendSignal(s) { reply(s); },
    onSignal(_me, cb) { sigCbs.add(cb); return () => sigCbs.delete(cb); },
  };
}

export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
