import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { Backend, Unsub } from "./types";
import type { AuthUser, DailyReview, Kudos, LiveStatus, Profile, Room, Session, Signal, Subject, UserId } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ts = (v: any) => (v ? new Date(v).getTime() : null);
const iso = (v: number | null) => (v == null ? null : new Date(v).toISOString());

const toProfile = (r: any): Profile => ({
  id: r.id, name: r.name || "", color: r.color ?? 0, tz: r.tz || "UTC",
  dailyGoalMin: r.daily_goal_min ?? 240, pomodoroMin: r.pomodoro_min ?? 25, breakMin: r.break_min ?? 5,
  look: r.look && typeof r.look === "object" && "skin" in r.look ? r.look : null,
  focusPrefs: r.focus_prefs && typeof r.focus_prefs === "object" ? r.focus_prefs : null,
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
  statusEmoji: r.status_emoji || null, statusText: r.status_text || null,
  statusUntil: ts(r.status_until), statusSetAt: ts(r.status_set_at),
});
const toKudos = (r: any): Kudos => ({ id: r.id, sessionId: r.session_id, fromUser: r.from_user, emoji: r.emoji, createdAt: ts(r.created_at)! });

const toReview = (r: any): DailyReview => ({
  userId: r.user_id, day: String(r.day).slice(0, 10), energy: r.energy ?? null, impact: r.impact ?? null, note: r.note || "",
  totalMs: Number(r.total_ms || 0), tz: r.tz || "UTC", createdAt: ts(r.created_at) || 0, updatedAt: ts(r.updated_at) || ts(r.created_at) || 0,
});

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
      const row: any = {
        id: p.id, name: p.name, color: p.color, tz: p.tz,
        daily_goal_min: p.dailyGoalMin, pomodoro_min: p.pomodoroMin, break_min: p.breakMin, look: p.look,
      };
      if (p.focusPrefs) row.focus_prefs = p.focusPrefs;
      const { error } = await sb.from("profiles").upsert(row);
      if (!error) return;
      // R-001/R-002: the database may not have focus_prefs yet (schema.sql not re-run); save the rest
      if (row.focus_prefs && /focus_prefs/.test(error.message)) {
        delete row.focus_prefs;
        check(await sb.from("profiles").upsert(row));
        throw new Error("其他设置已保存。专注模式的设置需要先更新数据库：在 Supabase 里重新运行 supabase/schema.sql。");
      }
      throw new Error(error.message);
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
    async countSubjectSessions(id) {
      const { count, error } = await sb.from("sessions").select("id", { count: "exact", head: true }).eq("subject_id", id);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async deleteSubject(id) { check(await sb.from("subjects").delete().eq("id", id)); },
    async mergeSubject(fromId, toId) {
      const { data, error } = await sb.rpc("merge_subject", { from_id: fromId, to_id: toId });
      if (error) throw new Error(error.message.includes("merge_subject") ? "数据库还没更新，请先执行 supabase/schema.sql 末尾的 R-019 部分" : error.message.includes("not found") ? "没有找到要保留的科目" : error.message);
      return Number(data) || 0;
    },

    async listRooms() {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return [];
      const mine = check(await sb.from("room_members").select("room_id").eq("user_id", u.user.id)) as any[];
      if (!mine.length) return [];
      const rows = check(await sb.from("rooms").select("*").in("id", mine.map((m) => m.room_id)).order("created_at")) as any[];
      return roomsWithMembers(rows);
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
      const { data: u } = await sb.auth.getUser();
      check(await sb.from("room_members").delete().eq("room_id", roomId).eq("user_id", u.user!.id));
    },

    async listSessions(userIds, sinceMs) {
      if (!userIds.length) return [];
      const out: Session[] = [];
      // page through in 1000-row chunks
      for (let from = 0; ; from += 1000) {
        const rows = check(await sb.from("sessions").select("*").in("user_id", userIds)
          .gte("started_at", iso(sinceMs)!).order("started_at", { ascending: false }).range(from, from + 999)) as any[];
        out.push(...rows.map(toSession));
        if (rows.length < 1000) break;
      }
      return out;
    },
    async addSession(s) {
      const row: any = {
        user_id: s.userId, subject_id: s.subjectId, task: s.task, started_at: iso(s.startedAt), ended_at: iso(s.endedAt),
        duration_ms: Math.round(s.durationMs), mode: s.mode, rating: s.rating, note: s.note, tz: s.tz,
      };
      const insert = (r: any) => sb.from("sessions").insert(r).select().single();
      let res = await insert(row);
      // R-019: the subject was deleted or merged on another device meanwhile; keep the record, uncategorized
      if (res.error?.code === "23503" && s.subjectId) { row.subject_id = null; res = await insert(row); }
      // R-001: before the schema migration the mode check only knows stopwatch/pomodoro; keep the record anyway
      if (res.error && s.mode === "countdown" && /sessions_mode_check|check constraint/i.test(res.error.message)) {
        res = await insert({ ...row, mode: "stopwatch" });
      }
      return toSession(check(res));
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
      const row: any = {
        user_id: l.userId, state: l.state, task: l.task, subject_name: l.subjectName, subject_color: l.subjectColor,
        mode: l.mode, started_at: iso(l.startedAt), planned_end: iso(l.plannedEnd), accumulated_ms: Math.round(l.accumulatedMs),
        running_since: iso(l.runningSince), updated_at: new Date().toISOString(),
      };
      // R-005: only touch the status columns when the caller says something about them
      if (l.statusEmoji !== undefined) {
        row.status_emoji = l.statusEmoji || null;
        row.status_text = l.statusEmoji ? l.statusText || "" : null;
        row.status_until = iso(l.statusEmoji ? l.statusUntil ?? null : null);
        row.status_set_at = iso(l.statusEmoji ? l.statusSetAt ?? Date.now() : null);
      }
      check(await sb.from("live_status").upsert(row));
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
    async addKudos(sessionId, emoji) {
      const { data: u } = await sb.auth.getUser();
      const { error } = await sb.from("kudos").insert({ session_id: sessionId, from_user: u.user!.id, emoji });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    },
    async removeKudos(sessionId, emoji) {
      const { data: u } = await sb.auth.getUser();
      check(await sb.from("kudos").delete().eq("session_id", sessionId).eq("from_user", u.user!.id).eq("emoji", emoji));
    },

    subscribe(userIds, h) {
      const set = new Set(userIds);
      const ch = sb.channel("db-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "live_status" }, (p: any) => {
          const r = p.new && p.new.user_id ? p.new : null;
          if (r && set.has(r.user_id)) h.onLive(toLive(r));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (p: any) => {
          if (p.eventType === "DELETE") { if (p.old?.id) h.onSession(toSession({ ...p.old, started_at: p.old.started_at || 0, ended_at: p.old.ended_at || 0 }), "delete"); return; }
          if (set.has(p.new.user_id)) h.onSession(toSession(p.new), "upsert");
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "kudos" }, (p: any) => {
          if (p.eventType === "DELETE") { if (p.old?.id) h.onKudos(toKudos(p.old), "delete"); return; }
          h.onKudos(toKudos(p.new), "insert");
        })
        .subscribe();
      return () => { sb.removeChannel(ch); };
    },

    // R-007 收工
    async listReviews(userIds, sinceDay) {
      if (!userIds.length) return [];
      const out: DailyReview[] = [];
      for (let from = 0; ; from += 1000) {
        const rows = check(await sb.from("daily_reviews").select("*").in("user_id", userIds)
          .gte("day", sinceDay).order("day", { ascending: false }).range(from, from + 999)) as any[];
        out.push(...rows.map(toReview));
        if (rows.length < 1000) break;
      }
      return out;
    },
    async saveReview(r) {
      return toReview(check(await sb.from("daily_reviews").upsert({
        user_id: r.userId, day: r.day, energy: r.energy, impact: r.impact, note: r.note,
        total_ms: Math.round(r.totalMs), tz: r.tz, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,day" }).select().single()));
    },
    subscribeReviews(userIds, cb) {
      const set = new Set(userIds);
      const ch = sb.channel("reviews-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "daily_reviews" }, (p: any) => {
          const r = p.new && p.new.user_id ? p.new : null;
          if (r && set.has(r.user_id)) cb(toReview(r));
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
