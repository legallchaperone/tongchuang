import type { Backend } from "./types";
import type { AuthUser, DailyReview, GuestbookEntry, Kudos, LiveStatus, Profile, Room, Session, Signal, Subject, UserId } from "../types";
import { addDaysKey, browserTz, DAY, dayKey, HOUR, MIN, partsIn, zonedToUtc } from "../time";
import { checkGuestbook } from "../guestbook";
import type { ProfilePage } from "../profilePage";
import { msOnDay } from "../stats";
import { workDay } from "../review";

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
  /** R-007; added lazily to older demo data */
  reviews?: DailyReview[];
  /** R-020 留言板; added lazily to older demo data */
  guestbook?: GuestbookEntry[];
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

type Friend = { id: UserId; name: string; color: number; tz: string; look: { skin: number; hair: number; hairColor: number }; blocks: [number, number][]; subjects: [string, number][]; tasks: Record<string, string[]>; goal: number; /** studies in flow mode (R-001) */ flow?: boolean;
  /** R-005: personal statuses outside study blocks, [from, to, emoji, text] in local hours (from > to wraps past midnight) */
  statuses: [number, number, string, string][] };

function friendsFor(myTz: string): Friend[] {
  // pick friend zones that differ from the viewer's
  const far = myTz.startsWith("America") ? ["Asia/Shanghai", "Europe/London"] : myTz.startsWith("Europe") ? ["America/New_York", "Asia/Shanghai"] : ["America/New_York", "Europe/London"];
  return [
    { id: "demo-lin", name: "林舟", color: 1, tz: far[0], goal: 300, flow: true, look: { skin: 1, hair: 4, hairColor: 1 },
      blocks: [[9.5, 12], [14.5, 17.5], [20.5, 23.5]],
      statuses: [[23.75, 8.5, "😴", "睡觉了"], [12, 13.25, "🍜", "食堂干饭"], [18, 19.5, "🎮", "打球去了"]],
      subjects: [["算法", 2], ["GRE 词汇", 4], ["实验报告", 6]],
      tasks: { "算法": ["动态规划专题", "LeetCode 周赛复盘", "图论 最短路"], "GRE 词汇": ["再要你命 List 12", "填空 30 题"], "实验报告": ["数据清洗", "写讨论部分"] } },
    { id: "demo-mia", name: "Mia", color: 2, tz: far[1], goal: 240, look: { skin: 0, hair: 2, hairColor: 2 },
      blocks: [[8, 10.5], [13, 15.5], [19, 21.5]],
      statuses: [[22.5, 7.5, "😴", "睡觉了"], [10.75, 12.5, "🏫", "在上课"], [16, 16.75, "🚇", "在路上"], [17.5, 18.5, "🍜", "做饭中"]],
      subjects: [["有机化学", 3], ["论文阅读", 7], ["法语", 5]],
      tasks: { "有机化学": ["第 9 章 亲核取代", "反应机理卡片"], "论文阅读": ["Attention 那篇精读", "综述 第 3 节"], "法语": ["听力 B2", "动词变位"] } },
  ];
}
/* ── R-020: a personal page for me and each simulated classmate ── */
function demoPage(id: UserId, tz: string): ProfilePage {
  const inDays = (n: number) => addDaysKey(dayKey(Date.now(), tz), n);
  if (id === "demo-lin") return {
    bio: "刷题和背单词交替进行，凌晨的图书馆最安静",
    widgets: [
      { id: "l1", type: "goals", size: "s", config: { goals: [{ title: "GRE 首考", date: inDays(38) }, { title: "秋招笔试", date: inDays(75) }] } },
      { id: "l2", type: "streak", size: "s", config: {} },
      { id: "l3", type: "heatmap", size: "w", config: {} },
      { id: "l4", type: "hours", size: "s", config: { days: 30 } },
      { id: "l5", type: "subjects", size: "s", config: { days: 30 } },
      { id: "l6", type: "badges", size: "w", config: { showLocked: false } },
      { id: "l7", type: "recent", size: "w", config: { count: 5, hideTask: false } },
    ],
  };
  if (id === "demo-mia") return {
    bio: "Bonjour ! 化学人，正在和法语动词变位较劲",
    widgets: [
      { id: "m1", type: "today", size: "w", config: {} },
      { id: "m2", type: "note", size: "s", config: { title: "这学期", text: "每天读一篇论文，周末整理成卡片。\n法语 B2 考试前不追剧。" } },
      { id: "m3", type: "review", size: "s", config: {} },
      { id: "m4", type: "subjects", size: "s", config: { days: 7 } },
      { id: "m5", type: "badges", size: "s", config: { showLocked: true } },
      { id: "m6", type: "recent", size: "w", config: { count: 3, hideTask: true } },
    ],
  };
  return {
    bio: "毕业论文 + 线代二刷，每天进步一点点",
    widgets: [
      { id: "me1", type: "today", size: "s", config: {} },
      { id: "me2", type: "streak", size: "s", config: {} },
      { id: "me3", type: "goals", size: "s", config: { goals: [{ title: "考研数学", date: inDays(52) }, { title: "论文初稿", date: inDays(20) }] } },
      { id: "me4", type: "heatmap", size: "w", config: {} },
      { id: "me5", type: "subjects", size: "s", config: { days: 30 } },
      { id: "me6", type: "badges", size: "w", config: { showLocked: true } },
      { id: "me7", type: "hours", size: "s", config: { days: 30 } },
      { id: "me8", type: "recent", size: "w", config: { count: 5, hideTask: false } },
      { id: "me9", type: "note", size: "s", config: { title: "座右铭", text: "慢慢来，比较快。" } },
    ],
  };
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

/* ── R-007 收工: past reviews for everyone, built from the sessions already there ── */
const TOMORROW = ["先把{t}做完", "继续{t}", "早点起，先{t}", "{t}，然后休息", "上午先搞定{t}"];
function makeReview(r: () => number, p: Profile, day: string, sessions: Session[], subjects: Subject[], tasks: string[]): DailyReview | null {
  const mine = sessions.filter((s) => s.userId === p.id);
  const total = msOnDay(mine, p.tz, day);
  if (total < 20 * MIN) return null;
  const last = mine.filter((s) => dayKey(s.startedAt, p.tz) === day).reduce((a, s) => Math.max(a, s.endedAt), 0);
  const at = last + (10 + r() * 40) * MIN;
  const ratio = total / (p.dailyGoalMin * MIN);
  const impact = Math.max(1, Math.min(4, Math.round(ratio * 2.6 + (r() - 0.5) * 1.6)));
  const energy = Math.max(1, Math.min(3, Math.round(1.9 + (r() - 0.5) * 2 + (ratio > 1.2 ? -0.4 : 0.2))));
  const t = tasks[Math.floor(r() * tasks.length)] || subjects[0]?.name || "复习";
  const note = r() < 0.8 ? TOMORROW[Math.floor(r() * TOMORROW.length)].replace("{t}", t) : "";
  return { userId: p.id, day, energy, impact, note, totalMs: Math.round(total), tz: p.tz, createdAt: at, updatedAt: at };
}
function tasksOf(userId: UserId, myTz: string) {
  const f = friendsFor(myTz).find((x) => x.id === userId);
  return Object.values(f ? f.tasks : myTasks).flat();
}
function seedReviews(db: DB): DailyReview[] {
  const out: DailyReview[] = [];
  const now = Date.now();
  const myTz = db.profiles.find((p) => p.id === ME)?.tz || browserTz();
  for (const p of db.profiles) {
    const r = rng(4242 + p.id.length * 31);
    const cur = workDay(now, p.tz);
    const days = new Set(db.sessions.filter((s) => s.userId === p.id && s.startedAt > now - 120 * DAY).map((s) => dayKey(s.startedAt, p.tz)));
    const yesterday = workDay(now - DAY, p.tz);
    for (const day of Array.from(days).sort()) {
      if (day >= cur) continue; // today is still open
      const always = p.id === ME && day === yesterday; // so “昨天的你说” shows up in the demo
      if (!always && r() > 0.72) continue;
      const rv = makeReview(r, p, day, db.sessions, db.subjects.filter((s) => s.userId === p.id), tasksOf(p.id, myTz));
      if (rv && always && !rv.note) rv.note = "先把 SVD 的证明写完";
      if (rv) out.push(rv);
    }
  }
  return out;
}

/* ── R-020 留言板: a few notes on everyone's board ── */
const GB_RANDOM: [string, string | null][] = [
  ["路过，给你打个气", "fist"], ["", "coffee"], ["今天也在认真学呢", "star"], ["", "flower"], ["别熬太晚", "moon"], ["冲！", "flame"],
];
const GB_THANKS: [string, string | null][] = [
  ["谢谢！你也加油", "fist"], ["收到～回你一张", "heart"], ["", "coffee"], ["一起努力！", "star"], ["哈哈被你发现了", "cat"],
];
function seedGuestbook(): GuestbookEntry[] {
  const now = Date.now();
  const lin = "demo-lin", mia = "demo-mia";
  const n = (ownerId: UserId, authorId: UserId, text: string, sticker: string | null, hoursAgo: number): GuestbookEntry =>
    ({ id: uid(), ownerId, authorId, text, sticker, createdAt: now - hoursAgo * HOUR });
  return [
    n(ME, lin, "今天的番茄钟我也打满了，一起冲！", "fist", 2.5),
    n(ME, mia, "", "coffee", 7),
    n(ME, mia, "看到你凌晨还在学，记得早点睡呀", "moon", 20),
    n(ME, lin, "线代那章真的难，你的笔记借我看看？", null, 30),
    n(ME, ME, "备忘：周五之前交开题报告", "book", 50),
    n(ME, mia, "", "flower", 75),
    n(ME, lin, "连续 7 天了，厉害", "trophy", 100),
    n(ME, mia, "法语考过了！谢谢你那天陪我自习", "heart", 140),
    n(ME, lin, "", "cat", 190),
    n(ME, mia, "伦敦今天出彩虹了，分你一半", "rainbow", 260),
    n(lin, mia, "GRE 加油！", "fist", 5),
    n(lin, ME, "", "tomato", 26),
    n(lin, lin, "目标：周赛进前 500", "flame", 60),
    n(mia, lin, "论文读完了吗？读完讲给我听", null, 3),
    n(mia, ME, "有机化学冲鸭", "star", 30),
    n(mia, mia, "", "coffee", 80),
  ];
}

export function createDemoBackend(): Backend {
  let db: DB;
  try { db = (typeof window !== "undefined" && JSON.parse(localStorage.getItem(KEY) || "null")) || seed(); } catch { db = seed(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* full */ } };
  if (!db.reviews) db.reviews = seedReviews(db);
  if (!db.guestbook) db.guestbook = seedGuestbook();
  // R-020: older demo data has no pages yet
  db.profiles.forEach((p) => { if (p.page === undefined) p.page = demoPage(p.id, p.tz); });
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
  const reviewSubs = new Set<{ ids: Set<UserId>; cb: (r: DailyReview) => void }>();
  const emitReview = (r: DailyReview) => reviewSubs.forEach((s) => s.ids.has(r.userId) && s.cb(r));

  /* R-020 留言板 */
  const gbSubs = new Set<{ ownerId: UserId; cb: (e: GuestbookEntry, kind: "insert" | "delete") => void }>();
  const emitGb = (e: GuestbookEntry, kind: "insert" | "delete") => gbSubs.forEach((s) => s.ownerId === e.ownerId && s.cb({ ...e }, kind));
  const sharesRoom = (a: UserId, b: UserId) => a === b || db.rooms.some((r) => r.memberIds.includes(a) && r.memberIds.includes(b));
  /** a classmate leaves me a note (and I get the toast) */
  const gbLastFrom = new Map<UserId, number>();
  function gbFromFriend(friendId: UserId, pickFrom: [string, string | null][]) {
    if ((gbLastFrom.get(friendId) || 0) > Date.now() - 2 * MIN) return; // not twice in a row
    gbLastFrom.set(friendId, Date.now());
    const [text, sticker] = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    const e: GuestbookEntry = { id: uid(), ownerId: ME, authorId: friendId, text, sticker, createdAt: Date.now() };
    db.guestbook!.push(e); save(); emitGb(e, "insert");
  }

  /** an accepted invite overrides the schedule for a while */
  const holdUntil = new Map<UserId, number>();

  /** which of a classmate's status windows covers now, with its local start and end as instants */
  function friendStatus(f: Friend, now: number) {
    const p = partsIn(now, f.tz);
    const h = p.h + p.mi / 60;
    const at = (dayOffset: number, hour: number) => {
      const d = new Date(Date.UTC(p.y, p.mo - 1, p.d + dayOffset, 12));
      return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), Math.floor(hour), Math.round((hour % 1) * 60), f.tz);
    };
    for (const [a, b, emoji, text] of f.statuses) {
      const wraps = a > b;
      const inside = wraps ? h >= a || h < b : h >= a && h < b;
      if (!inside) continue;
      const setAt = wraps && h < b ? at(-1, a) : at(0, a);
      const until = wraps && h >= a ? at(1, b) : at(0, b);
      return { statusEmoji: emoji, statusText: text, statusUntil: until, statusSetAt: setAt };
    }
    return null;
  }

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
        if (f.flow) {
          // 心流：a whole block in one go, counting up from its start
          const blockStart = now - minsIn * MIN;
          const task = (f.tasks[sub.name] || ["自习"])[0] || "自习";
          if (cur.state !== "focus" || cur.mode !== "stopwatch" || cur.startedAt !== blockStart) {
            Object.assign(cur, { userId: f.id, state: "focus", task, subjectName: sub.name, subjectColor: sub.color, mode: "stopwatch", startedAt: blockStart, plannedEnd: null, accumulatedMs: 0, runningSince: blockStart, updatedAt: now });
            emitLive(cur);
          }
          continue;
        }
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
        // a flow block just ended: log it
        if (cur.state === "focus" && cur.mode === "stopwatch" && cur.startedAt && now - cur.startedAt > MIN && now - cur.startedAt < 6 * 60 * MIN) {
          const sub = fsubs.find((x) => x.name === cur.subjectName);
          const x: Session = { id: uid(), userId: f.id, subjectId: sub?.id || null, task: cur.task, startedAt: cur.startedAt, endedAt: now, durationMs: now - cur.startedAt, mode: "stopwatch", rating: 5, note: "", tz: f.tz };
          db.sessions.push(x); emitSession(x, "upsert");
        }
        Object.assign(cur, { state: "idle", task: "", subjectName: "", subjectColor: null, startedAt: null, plannedEnd: null, runningSince: null, accumulatedMs: 0, updatedAt: now });
        emitLive(cur);
      }
      // R-005: a status outside study blocks (sleeping, lunch, class...)
      const st = block ? null : friendStatus(f, now);
      if ((cur.statusEmoji || null) !== (st?.statusEmoji || null) || (cur.statusSetAt || null) !== (st?.statusSetAt || null)) {
        Object.assign(cur, st || { statusEmoji: null, statusText: null, statusUntil: null, statusSetAt: null });
        emitLive(cur);
      }
      // R-007: done for the day after the last block → 收工
      const lastEnd = f.blocks[f.blocks.length - 1][1];
      if (!block && (h >= lastEnd + 0.2 || h < 5)) {
        const wd = workDay(now, f.tz);
        const prof = db.profiles.find((x) => x.id === f.id);
        if (prof && !db.reviews!.some((x) => x.userId === f.id && x.day === wd)) {
          const rv = makeReview(rng(p.d * 7 + f.id.length), prof, wd, db.sessions, fsubs, Object.values(f.tasks).flat());
          if (rv) { rv.createdAt = rv.updatedAt = now; db.reviews!.push(rv); emitReview(rv); }
        }
      }
      // R-020: now and then, an awake classmate on a break leaves a note on my board (about once an hour or two)
      if (!block && p.h >= 9 && p.h < 23 && Math.random() < 1 / 400) gbFromFriend(f.id, GB_RANDOM);
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
    async verifyEmailCode() { localStorage.setItem(AUTH, "1"); authCbs.forEach((c) => c(me())); },
    async resendSignupEmail() { /* nothing to send in the demo */ },
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
    countSubjectSessions: async (id) => delay(db.sessions.filter((s) => s.subjectId === id).length),
    async deleteSubject(id) {
      db.subjects = db.subjects.filter((x) => x.id !== id);
      db.sessions.forEach((s) => { if (s.subjectId === id) s.subjectId = null; });
      save();
    },
    async mergeSubject(fromId, toId) {
      if (fromId === toId) throw new Error("不能合并到自己");
      const from = db.subjects.find((x) => x.id === fromId && x.userId === ME);
      if (!db.subjects.some((x) => x.id === toId && x.userId === ME)) throw new Error("没有找到要保留的科目");
      if (!from) return 0;
      let n = 0;
      db.sessions.forEach((s) => { if (s.subjectId === fromId && s.userId === ME) { s.subjectId = toId; n++; } });
      db.subjects = db.subjects.filter((x) => x.id !== fromId);
      save(); return n;
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

    listSessions: async (ids, since, until) => delay(db.sessions.filter((s) => ids.includes(s.userId) && s.startedAt >= since && (until == null || s.startedAt < until))),
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
      // R-005: a write without status fields keeps the stored status
      const next: LiveStatus = l.statusEmoji === undefined && i >= 0
        ? { ...l, statusEmoji: db.live[i].statusEmoji ?? null, statusText: db.live[i].statusText ?? null, statusUntil: db.live[i].statusUntil ?? null, statusSetAt: db.live[i].statusSetAt ?? null }
        : { ...l };
      if (i >= 0) db.live[i] = next; else db.live.push(next);
      save(); emitLive({ ...next });
    },
    listKudos: async (ids) => delay(db.kudos.filter((k) => ids.includes(k.sessionId))),
    listRecentKudos: async (since) => delay(db.kudos.filter((k) => k.createdAt >= since)),
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
    // R-007 收工
    listReviews: async (ids, sinceDay) => delay(db.reviews!.filter((r) => ids.includes(r.userId) && r.day >= sinceDay).map((r) => ({ ...r }))),
    async saveReview(r) {
      const now = Date.now();
      const old = db.reviews!.find((x) => x.userId === r.userId && x.day === r.day);
      const full: DailyReview = { ...r, createdAt: old?.createdAt ?? now, updatedAt: now };
      db.reviews = [...db.reviews!.filter((x) => x !== old), full];
      save(); emitReview(full);
      return full;
    },
    subscribeReviews(ids, cb) { const s = { ids: new Set(ids), cb }; reviewSubs.add(s); return () => { reviewSubs.delete(s); }; },
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

    // R-020 留言板
    listGuestbook: async (ownerId, limit) => delay(sharesRoom(ME, ownerId)
      ? db.guestbook!.filter((e) => e.ownerId === ownerId).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map((e) => ({ ...e }))
      : []),
    async addGuestbook({ ownerId, text: raw, sticker }) {
      const { text, error } = checkGuestbook(raw, sticker);
      if (error) throw new Error(error);
      if (!sharesRoom(ME, ownerId)) throw new Error("只能给同一个自习室的同窗留言");
      const e: GuestbookEntry = { id: uid(), ownerId, authorId: ME, text, sticker: sticker || null, createdAt: Date.now() };
      db.guestbook!.push(e); save(); emitGb(e, "insert");
      // the classmate notices and leaves one back a moment later
      if (ownerId !== ME && db.profiles.some((p) => p.id === ownerId)) setTimeout(() => gbFromFriend(ownerId, GB_THANKS), 2500 + Math.random() * 2000);
      return { ...e };
    },
    async deleteGuestbook(id) {
      const e = db.guestbook!.find((x) => x.id === id);
      if (!e) return;
      if (e.authorId !== ME && e.ownerId !== ME) throw new Error("只有留言的人和主人能撕掉它");
      db.guestbook = db.guestbook!.filter((x) => x !== e); save(); emitGb(e, "delete");
    },
    subscribeGuestbook(ownerId, cb) { const s = { ownerId, cb }; gbSubs.add(s); return () => { gbSubs.delete(s); }; },
  };
}

export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
