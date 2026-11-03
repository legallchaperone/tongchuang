import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { Backend, Unsub } from "./types";
import type { AuthUser, Kudos, LiveStatus, Profile, Room, Session, Signal, Subject, UserId } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ts = (v: any) => (v ? new Date(v).getTime() : null);
const iso = (v: number | null) => (v == null ? null : new Date(v).toISOString());

const toProfile = (r: any): Profile => ({
  id: r.id, name: r.name || "", color: r.color ?? 0, tz: r.tz || "UTC",
  dailyGoalMin: r.daily_goal_min ?? 240, pomodoroMin: r.pomodoro_min ?? 25, breakMin: r.break_min ?? 5,
  look: r.look && typeof r.look === "object" && "skin" in r.look ? r.look : null,
});
const toSubject = (r: any): Subject => ({ id: r.id, userId: r.user_id, name: r.name, color: r.color ?? 0, archived: !!r.archived });
const toSession = (r: any): Session => ({
  id: r.id, userId: r.user_id, subjectId: r.subject_id, task: r.task || "",
  startedAt: ts(r.started_at)!, endedAt: ts(r.ended_at)!, durationMs: Number(r.duration_ms),
  mode: r.mode, rating: r.rating, note: r.note || "", tz: r.tz || "UTC",
});
const toLive = (r: any): LiveStatus => ({
  userId: r.user_id, state: r.state, task: r.task || "", subjectName: r.subject_name || "",
  subjectColor: r.subject_color, mode: r.mode || "stopwatch", startedAt: ts(r.started_at),
  plannedEnd: ts(r.planned_end), accumulatedMs: Number(r.accumulated_ms || 0),
  runningSince: ts(r.running_since), updatedAt: ts(r.updated_at) || 0,
});
const toKudos = (r: any): Kudos => ({ id: r.id, sessionId: r.session_id, fromUser: r.from_user, emoji: r.emoji, createdAt: ts(r.created_at)! });

/** Supabase auth errors in plain Chinese */
function authError(e: { message: string; status?: number }): Error {
  const m = e.message || "";
  if (/Invalid login credentials/i.test(m)) return new Error("邮箱或密码不对");
  if (/Email not confirmed/i.test(m)) return new Error("这个邮箱还没完成验证。请输入邮件里的验证码，或点“重新发送”。");
  if (/User already registered/i.test(m)) return new Error("这个邮箱已经注册过了，直接登录就行");
  if (/rate limit|too many/i.test(m) || e.status === 429) return new Error("发得太频繁了，请过一分钟再试");
  if (/Token has expired|invalid.*(otp|token)|otp.*invalid/i.test(m)) return new Error("验证码不对或已过期，请重新发送一个");
  if (/Password should be at least/i.test(m)) return new Error("密码至少 6 位");
  if (/fetch|network|Failed to fetch/i.test(m)) return new Error("连不上服务器。如果你在中国大陆，可能需要稍后再试或换个网络。");
  return new Error(m);
}

function check<T>(res: { data: T; error: any }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  const toUser = (u: any): AuthUser | null => (u ? { id: u.id, email: u.email ?? null } : null);
  const userChannels = new Map<string, RealtimeChannel>();
  /** my id from the locally stored session (getUser() would be a network round trip) */
  const myId = async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error("没有登录");
    return data.session.user.id;
  };

  async function roomsWithMembers(rows: any[]): Promise<Room[]> {
    if (!rows.length) return [];
    const mem = check(await sb.from("room_members").select("room_id,user_id").in("room_id", rows.map((r) => r.id)));
    return rows.map((r) => ({
      id: r.id, name: r.name, code: r.code, createdBy: r.created_by,
      memberIds: (mem as any[]).filter((m) => m.room_id === r.id).map((m) => m.user_id),
    }));
  }

  return {
    mode: "supabase",

    async currentUser() {
      const { data } = await sb.auth.getSession();
      return toUser(data.session?.user);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toUser(s?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw authError(error);
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
      if (error) throw authError(error);
      return { needsConfirm: !data.session };
    },
    async sendMagicLink(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname + location.search } });
      if (error) throw authError(error);
    },
    async verifyEmailCode(email, code, kind) {
      const token = code.replace(/\s/g, "");
      const { error } = await sb.auth.verifyOtp({ email, token, type: kind === "signup" ? "signup" : "email" });
      if (error) throw authError(error);
    },
    async resendSignupEmail(email) {
      const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: location.origin } });
      if (error) throw authError(error);
    },
    async signOut() { await sb.auth.signOut(); },

    async getProfiles(ids) {
      if (!ids.length) return [];
      return (check(await sb.from("profiles").select("*").in("id", ids)) as any[]).map(toProfile);
    },
    async saveProfile(p) {
      check(await sb.from("profiles").upsert({
        id: p.id, name: p.name, color: p.color, tz: p.tz,
        daily_goal_min: p.dailyGoalMin, pomodoro_min: p.pomodoroMin, break_min: p.breakMin, look: p.look,
      }));
    },

    async listSubjects(userIds) {
      if (!userIds.length) return [];
      return (check(await sb.from("subjects").select("*").in("user_id", userIds).order("created_at")) as any[]).map(toSubject);
    },
    async saveSubject(s) {
      const row: any = { user_id: s.userId, name: s.name, color: s.color, archived: s.archived };
      if (s.id) row.id = s.id;
      return toSubject(check(await sb.from("subjects").upsert(row).select().single()));
    },

    async listRooms() {
      const { data: s } = await sb.auth.getSession();
      if (!s.session) return [];
      // one request instead of four: RLS only returns the rooms I'm in, and every member of those rooms
      const rows = check(await sb.from("rooms").select("*, room_members(user_id)").order("created_at")) as any[];
      return rows.map((r) => ({
        id: r.id, name: r.name, code: r.code, createdBy: r.created_by,
        memberIds: ((r.room_members || []) as any[]).map((m) => m.user_id),
      }));
    },
    async createRoom(name) {
      const r = check(await sb.rpc("create_room", { room_name: name }));
      return (await roomsWithMembers([r]))[0];
    },
    async joinRoom(code) {
      const { data, error } = await sb.rpc("join_room", { room_code: code });
      if (error) throw new Error(error.message.includes("not found") ? "没有找到这个邀请码" : error.message.includes("full") ? "这个自习室已满（最多 12 人）" : error.message);
      return (await roomsWithMembers([data]))[0];
    },
    async leaveRoom(roomId) {
      check(await sb.from("room_members").delete().eq("room_id", roomId).eq("user_id", await myId()));
    },

    async listSessions(userIds, sinceMs, untilMs) {
      if (!userIds.length) return [];
      const PAGE = 1000; // PostgREST's max rows per response on Supabase
      const page = (from: number, count: boolean) => {
        let q = sb.from("sessions").select("*", count ? { count: "exact" } : undefined).in("user_id", userIds).gte("started_at", iso(sinceMs)!);
        if (untilMs != null) q = q.lt("started_at", iso(untilMs)!);
        return q.order("started_at", { ascending: false }).range(from, from + PAGE - 1);
      };
      // the first page also returns the total, so the remaining pages can be fetched in parallel
      const first = await page(0, true);
      const rows = [...(check(first) as any[])];
      if (rows.length >= PAGE) {
        if (first.count != null) {
          const rest = await Promise.all(Array.from({ length: Math.ceil((first.count - PAGE) / PAGE) }, (_, i) => page(PAGE * (i + 1), false)));
          rest.forEach((r) => rows.push(...(check(r) as any[])));
        } else {
          for (let from = PAGE; ; from += PAGE) {
            const more = check(await page(from, false)) as any[];
            rows.push(...more);
            if (more.length < PAGE) break;
          }
        }
      }
      const seen = new Set<string>();
      return rows.filter((r) => !seen.has(r.id) && !!seen.add(r.id)).map(toSession);
    },
    async addSession(s) {
      return toSession(check(await sb.from("sessions").insert({
        user_id: s.userId, subject_id: s.subjectId, task: s.task, started_at: iso(s.startedAt), ended_at: iso(s.endedAt),
        duration_ms: Math.round(s.durationMs), mode: s.mode, rating: s.rating, note: s.note, tz: s.tz,
      }).select().single()));
    },
    async updateSession(id, patch) {
      const row: any = {};
      // the database also refuses to make a record longer (see the guard trigger in schema.sql)
      if ("rating" in patch) row.rating = patch.rating;
      if ("note" in patch) row.note = patch.note;
      if ("task" in patch) row.task = patch.task;
      if ("subjectId" in patch) row.subject_id = patch.subjectId;
      if ("durationMs" in patch) row.duration_ms = Math.round(patch.durationMs!);
      if ("endedAt" in patch) row.ended_at = iso(patch.endedAt!);
      const { error } = await sb.from("sessions").update(row).eq("id", id);
      if (error) throw new Error(error.message.includes("only be shortened") ? "时长只能改短，不能改长" : error.message);
    },
    async deleteSession(id) { check(await sb.from("sessions").delete().eq("id", id)); },

    async getLive(userIds) {
      if (!userIds.length) return [];
      return (check(await sb.from("live_status").select("*").in("user_id", userIds)) as any[]).map(toLive);
    },
    async setLive(l) {
      check(await sb.from("live_status").upsert({
        user_id: l.userId, state: l.state, task: l.task, subject_name: l.subjectName, subject_color: l.subjectColor,
        mode: l.mode, started_at: iso(l.startedAt), planned_end: iso(l.plannedEnd), accumulated_ms: Math.round(l.accumulatedMs),
        running_since: iso(l.runningSince), updated_at: new Date().toISOString(),
      }));
    },

    async listKudos(sessionIds) {
      if (!sessionIds.length) return [];
      const out: Kudos[] = [];
      for (let i = 0; i < sessionIds.length; i += 150) {
        const rows = check(await sb.from("kudos").select("*").in("session_id", sessionIds.slice(i, i + 150))) as any[];
        out.push(...rows.map(toKudos));
      }
      return out;
    },
    async listRecentKudos(sinceMs) {
      // a kudos is always given after the record started, so this covers every record since sinceMs
      return (check(await sb.from("kudos").select("*").gte("created_at", iso(sinceMs)!)) as any[]).map(toKudos);
    },
    async addKudos(sessionId, emoji) {
      const { error } = await sb.from("kudos").insert({ session_id: sessionId, from_user: await myId(), emoji });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    },
    async removeKudos(sessionId, emoji) {
      check(await sb.from("kudos").delete().eq("session_id", sessionId).eq("from_user", await myId()).eq("emoji", emoji));
    },

    subscribe(userIds, h) {
      const set = new Set(userIds);
      const ch = sb.channel("db-" + Math.random().toString(36).slice(2));
      const onLive = (p: any) => {
        const r = p.new && p.new.user_id ? p.new : null;
        if (r && set.has(r.user_id)) h.onLive(toLive(r));
      };
      const onSession = (p: any) => { if (p.new && set.has(p.new.user_id)) h.onSession(toSession(p.new), "upsert"); };
      // filter on the server: only my classmates' changes are sent (Realtime takes at most 100 values per `in` filter)
      for (let i = 0; i < userIds.length; i += 100) {
        const filter = `user_id=in.(${userIds.slice(i, i + 100).join(",")})`;
        ch.on("postgres_changes", { event: "*", schema: "public", table: "live_status", filter }, onLive)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "sessions", filter }, onSession)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter }, onSession);
      }
      // DELETE events cannot be filtered; with RLS on they only carry the id, and unknown ids are ignored
      ch.on("postgres_changes", { event: "DELETE", schema: "public", table: "sessions" }, (p: any) => {
        if (p.old?.id) h.onSession(toSession({ ...p.old, started_at: p.old.started_at || 0, ended_at: p.old.ended_at || 0 }), "delete");
      })
        // kudos has no owner column to filter on; RLS already limits it to kudos on my classmates' records
        .on("postgres_changes", { event: "*", schema: "public", table: "kudos" }, (p: any) => {
          if (p.eventType === "DELETE") { if (p.old?.id) h.onKudos(toKudos(p.old), "delete"); return; }
          h.onKudos(toKudos(p.new), "insert");
        })
        .subscribe();
      return () => { sb.removeChannel(ch); };
    },

    presence(me, roomIds, onOnline) {
      const chans = roomIds.map((rid) => {
        const ch = sb.channel("room:" + rid, { config: { presence: { key: me } } });
        ch.on("presence", { event: "sync" }, () => emit());
        ch.subscribe((status) => { if (status === "SUBSCRIBED") ch.track({ at: Date.now() }); });
        return ch;
      });
      function emit() {
        const ids = new Set<UserId>([me]);
        chans.forEach((c) => Object.keys(c.presenceState()).forEach((k) => ids.add(k)));
        onOnline(ids);
      }
      emit();
      return () => chans.forEach((c) => sb.removeChannel(c));
    },

    async sendSignal(s: Signal) {
      let ch = userChannels.get(s.to);
      if (!ch) {
        ch = sb.channel("user:" + s.to);
        userChannels.set(s.to, ch);
        await new Promise<void>((res) => ch!.subscribe((st) => { if (st === "SUBSCRIBED") res(); }));
      }
      await ch.send({ type: "broadcast", event: "signal", payload: s });
    },
    onSignal(me, cb) {
      const ch = sb.channel("user:" + me).on("broadcast", { event: "signal" }, (p: any) => {
        const s = p.payload as Signal;
        if (s && s.to === me) cb(s);
      }).subscribe();
      return () => { sb.removeChannel(ch); };
    },
  };
}
