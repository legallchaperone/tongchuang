// Who gets a push for a database event, and what it says. Pure logic over a small data interface,
// so it can be tested without a database (supabase/tests/webpush.test.mjs).
// The wording follows the in-app toasts in lib/store.tsx.

export interface Db {
  /** display name, or null when unknown */
  name(userId: string): Promise<string | null>;
  session(id: string): Promise<{ user_id: string; task: string } | null>;
  /** authors of earlier comments on this record */
  commenters(sessionId: string): Promise<string[]>;
  /** the person's current status icon and when it ends (epoch ms, null = until cleared) */
  status(userId: string): Promise<{ emoji: string | null; until: number | null } | null>;
}

export interface Note {
  to: string;
  title: string;
  body?: string;
  /** page to open when the notification is tapped */
  url: string;
  /** same tag = the newer notification replaces the older one */
  tag: string;
  urgency?: "normal" | "high";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DbEvent { type: string; record: any }

const MODE_TEXT = (mode: string, minutes: number) =>
  mode === "pomodoro" ? `${minutes} 分钟番茄钟` : mode === "countdown" ? `${minutes} 分钟倒计时` : "心流";

async function sleeping(db: Db, userId: string, now: number) {
  const s = await db.status(userId);
  return !!s && s.emoji === "😴" && (s.until == null || s.until > now);
}

export async function notesFor(e: DbEvent, db: Db, now = Date.now()): Promise<Note[]> {
  const r = e.record || {};
  const who = async (id: string) => (await db.name(id)) || "同窗";

  if (e.type === "signals") {
    if (!r.to_user || r.from_user === r.to_user) return [];
    if (await sleeping(db, r.to_user, now)) return []; // “睡觉了”：不打扰
    const name = await who(r.from_user);
    const p = r.payload || {};
    const base = { to: r.to_user, tag: `signal-${r.from_user}`, urgency: "high" as const };
    if (r.kind === "poke") return [{ ...base, title: `${name} 戳了戳你`, body: "该回来学习啦", url: "/" }];
    if (r.kind === "cheer") return [{ ...base, title: name, body: String(p.text || ""), url: "/" }];
    if (r.kind === "invite") {
      const minutes = Number(p.minutes) || 25;
      const q = new URLSearchParams({ mode: String(p.mode || "pomodoro"), min: String(minutes), task: String(p.task || ""), with: r.from_user });
      return [{ ...base, title: `${name} 邀请你一起专注`, body: MODE_TEXT(String(p.mode), minutes) + (p.task ? ` · ${p.task}` : ""), url: "/focus?" + q.toString() }];
    }
    return [];
  }

  if (e.type === "kudos") {
    const s = await db.session(r.session_id);
    if (!s || s.user_id === r.from_user) return [];
    return [{ to: s.user_id, title: `${await who(r.from_user)} 给你的专注点了 ${r.emoji}`, body: s.task || undefined, url: "/", tag: `kudos-${r.session_id}` }];
  }

  if (e.type === "session_comments") {
    const name = await who(r.author_id);
    const out: Note[] = [];
    if (r.author_id !== r.owner_id) {
      out.push({ to: r.owner_id, title: `${name} 评论了你的记录`, body: r.text, url: "/", tag: `comment-${r.session_id}` });
    } else {
      // the owner answered under their own record: tell everyone who commented there
      const people = new Set((await db.commenters(r.session_id)).filter((id) => id !== r.owner_id));
      for (const to of people) out.push({ to, title: `${name} 回复了你`, body: r.text, url: "/", tag: `comment-${r.session_id}` });
    }
    return out;
  }

  if (e.type === "guestbook") {
    const name = await who(r.author_id);
    const url = `/u/${r.owner_id}`;
    const out: Note[] = [];
    if (r.author_id !== r.owner_id) {
      const what = r.parent_id
        ? (r.reply_to === r.owner_id ? "回复了你" : `回复了${await who(r.reply_to)}`)
        : r.sticker ? (r.text ? "贴了一张便利贴" : "贴了一张贴纸") : "留了一句话";
      out.push({ to: r.owner_id, title: `${name} 在你的留言板${what}`, body: r.text || undefined, url, tag: `guestbook-${r.owner_id}` });
    }
    // a reply to someone other than the board's owner
    if (r.parent_id && r.reply_to && r.reply_to !== r.author_id && r.reply_to !== r.owner_id) {
      const where = r.author_id === r.owner_id ? "TA 的" : ` ${await who(r.owner_id)} 的`;
      out.push({ to: r.reply_to, title: `${name} 在${where}留言板回复了你`, body: r.text || undefined, url, tag: `guestbook-${r.owner_id}` });
    }
    return out;
  }

  // R-006: the server finished a timed block while the page may be closed
  if (e.type === "focus_due") {
    if (r.phase === "focus") {
      const breakMin = Number(r.break_min) || 0;
      return [{ to: r.user_id, title: "专注时间到了", body: (r.task ? `${r.task} · ` : "") + (breakMin ? `休息 ${breakMin} 分钟吧` : "记得写一句复盘"), url: "/focus", tag: "focus", urgency: "high" }];
    }
    if (r.phase === "break") return [{ to: r.user_id, title: "休息结束", body: "回到书桌前，开始下一轮吧", url: "/focus", tag: "focus", urgency: "high" }];
    return [];
  }

  return [];
}
