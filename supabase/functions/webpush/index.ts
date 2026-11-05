// Supabase Edge Function `webpush`: the database calls it (see push_notify in supabase/schema.sql)
// whenever something happens that someone should hear about, and it sends Web Push notifications.
// Setup: docs/web-push.md. Deploy with `supabase functions deploy webpush --no-verify-jwt`
// (the database authenticates with the shared secret in the x-tongchuang-secret header, not a user JWT).
//
// Secrets: PUSH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { sendPush, type PushTarget, type Vapid } from "./webpush.ts";
import { notesFor, type Db, type DbEvent } from "./messages.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`missing secret ${k}`);
  return v;
};

function rest(url: string, key: string) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return {
    async get<T>(path: string): Promise<T[]> {
      const res = await fetch(`${url}/rest/v1/${path}`, { headers });
      if (!res.ok) throw new Error(`GET ${path.split("?")[0]}: ${res.status}`);
      return res.json();
    },
    async del(path: string) { await fetch(`${url}/rest/v1/${path}`, { method: "DELETE", headers }); },
    async patch(path: string, body: unknown) { await fetch(`${url}/rest/v1/${path}`, { method: "PATCH", headers, body: JSON.stringify(body) }); },
  };
}

/** constant-time comparison of two strings */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!same(req.headers.get("x-tongchuang-secret") || "", env("PUSH_SECRET"))) return new Response("forbidden", { status: 403 });

  const event = (await req.json()) as DbEvent;
  const api = rest(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const q = encodeURIComponent;
  const db: Db = {
    async name(id) { return (await api.get<{ name: string }>(`profiles?id=eq.${q(id)}&select=name`))[0]?.name || null; },
    async session(id) { return (await api.get<{ user_id: string; task: string }>(`sessions?id=eq.${q(id)}&select=user_id,task`))[0] || null; },
    async commenters(sessionId) { return (await api.get<{ author_id: string }>(`session_comments?session_id=eq.${q(sessionId)}&select=author_id`)).map((r) => r.author_id); },
    async status(id) {
      const r = (await api.get<{ status_emoji: string | null; status_until: string | null }>(`live_status?user_id=eq.${q(id)}&select=status_emoji,status_until`))[0];
      return r ? { emoji: r.status_emoji, until: r.status_until ? Date.parse(r.status_until) : null } : null;
    },
  };
  const vapid: Vapid = { publicKey: env("VAPID_PUBLIC_KEY"), privateKey: env("VAPID_PRIVATE_KEY"), subject: env("VAPID_SUBJECT") };

  const notes = await notesFor(event, db);
  let sent = 0, gone = 0, failed = 0;
  for (const n of notes) {
    const subs = await api.get<PushTarget>(`push_subscriptions?user_id=eq.${q(n.to)}&select=endpoint,p256dh,auth`);
    const results = await Promise.all(subs.map((s) =>
      sendPush(s, { title: n.title, body: n.body, url: n.url, tag: n.tag }, vapid, { urgency: n.urgency, topic: n.tag })));
    for (const r of results) {
      if (r.gone) { gone++; await api.del(`push_subscriptions?endpoint=eq.${q(r.endpoint)}`); }
      else if (r.status >= 200 && r.status < 300) { sent++; await api.patch(`push_subscriptions?endpoint=eq.${q(r.endpoint)}`, { last_ok_at: new Date().toISOString() }); }
      else failed++;
    }
  }
  return Response.json({ notes: notes.length, sent, gone, failed });
});
