// Tests for the Web Push Edge Function's pure parts. Run: node --test supabase/tests/
// (Node 22+ loads the .ts sources directly by stripping their types.)
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encryptPayload, vapidAuthorization, sendPush, b64u, unb64u } from "../functions/webpush/webpush.ts";
import { notesFor } from "../functions/webpush/messages.ts";

/** a browser-side subscription: its key pair and auth secret */
function fakeBrowser() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, target: { endpoint: "https://push.example.net/send/abc", p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } };
}

/** what the browser does with the body (RFC 8188 + 8291), written against node:crypto rather than Web Crypto */
function decrypt(body, browser) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  assert.equal(rs, 4096);
  const ecdhSecret = browser.ecdh.computeSecret(asPublic);
  const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));
  const ikm = hkdf(browser.auth, ecdhSecret, Buffer.concat([Buffer.from("WebPush: info\0"), browser.ecdh.getPublicKey(), asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, "last-record delimiter");
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

function fakeVapid() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()), subject: "mailto:test@example.com" };
}

test("payload decrypts on the browser side", async () => {
  const b = fakeBrowser();
  const msg = JSON.stringify({ title: "林舟 戳了戳你", body: "该回来学习啦", url: "/" });
  const body = Buffer.from(await encryptPayload(b.target, new TextEncoder().encode(msg)));
  assert.equal(decrypt(body, b), msg);
});

test("each message uses a fresh key and salt", async () => {
  const b = fakeBrowser();
  const one = Buffer.from(await encryptPayload(b.target, new TextEncoder().encode("x")));
  const two = Buffer.from(await encryptPayload(b.target, new TextEncoder().encode("x")));
  assert.notDeepEqual(one.subarray(0, 86), two.subarray(0, 86));
});

test("VAPID header is a valid ES256 JWT for the push service origin", async () => {
  const v = fakeVapid();
  const now = Date.UTC(2026, 10, 5, 12, 0, 0);
  const h = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/xyz", v, now);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m, h);
  const [, head, claims, sig, k] = m;
  assert.equal(k, v.publicKey);
  assert.deepEqual(JSON.parse(Buffer.from(unb64u(head)).toString()), { typ: "JWT", alg: "ES256" });
  const c = JSON.parse(Buffer.from(unb64u(claims)).toString());
  assert.equal(c.aud, "https://fcm.googleapis.com");
  assert.equal(c.sub, "mailto:test@example.com");
  assert.equal(c.exp, now / 1000 + 12 * 3600);
  const pub = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(unb64u(v.publicKey).slice(1, 33)), y: b64u(unb64u(v.publicKey).slice(33)) }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(`${head}.${claims}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(unb64u(sig))));
});

test("sendPush posts the right headers and reports gone subscriptions", async () => {
  const b = fakeBrowser();
  const calls = [];
  const fake = async (url, init) => { calls.push({ url, init }); return { status: calls.length === 1 ? 201 : 410 }; };
  const ok = await sendPush(b.target, { title: "t" }, fakeVapid(), { urgency: "high", topic: "signal-a:b" }, fake);
  const gone = await sendPush(b.target, { title: "t" }, fakeVapid(), {}, fake);
  assert.deepEqual([ok.status, ok.gone, gone.status, gone.gone], [201, false, 410, true]);
  const h = calls[0].init.headers;
  assert.equal(h["Content-Encoding"], "aes128gcm");
  assert.equal(h.Urgency, "high");
  assert.equal(h.Topic, "signal-ab");
  assert.equal(JSON.parse(decrypt(Buffer.from(calls[0].init.body), b)).title, "t");
});

const NOW = Date.UTC(2026, 10, 5, 12);
function fakeDb(over = {}) {
  return {
    name: async (id) => ({ a: "林舟", b: "Mia", c: "小周" })[id] || null,
    session: async (id) => (id === "s1" ? { user_id: "b", task: "LeetCode" } : null),
    commenters: async () => ["a", "c", "b"],
    status: async () => null,
    ...over,
  };
}

test("poke, cheer and invite go to the recipient", async () => {
  const poke = await notesFor({ type: "signals", record: { from_user: "a", to_user: "b", kind: "poke", payload: {} } }, fakeDb(), NOW);
  assert.deepEqual(poke.map((n) => [n.to, n.title, n.body]), [["b", "林舟 戳了戳你", "该回来学习啦"]]);
  const inv = await notesFor({ type: "signals", record: { from_user: "a", to_user: "b", kind: "invite", payload: { mode: "pomodoro", minutes: 25, task: "线代" } } }, fakeDb(), NOW);
  assert.equal(inv[0].body, "25 分钟番茄钟 · 线代");
  assert.equal(inv[0].url, "/focus?mode=pomodoro&min=25&task=%E7%BA%BF%E4%BB%A3&with=a");
  const cheer = await notesFor({ type: "signals", record: { from_user: "a", to_user: "b", kind: "cheer", payload: { text: "冲" } } }, fakeDb(), NOW);
  assert.deepEqual([cheer[0].title, cheer[0].body], ["林舟", "冲"]);
});

test("someone whose status is 睡觉了 is not poked", async () => {
  const asleep = fakeDb({ status: async () => ({ emoji: "😴", until: NOW + 3600_000 }) });
  assert.equal((await notesFor({ type: "signals", record: { from_user: "a", to_user: "b", kind: "poke" } }, asleep, NOW)).length, 0);
  const woke = fakeDb({ status: async () => ({ emoji: "😴", until: NOW - 1 }) });
  assert.equal((await notesFor({ type: "signals", record: { from_user: "a", to_user: "b", kind: "poke" } }, woke, NOW)).length, 1);
});

test("kudos go to the record's owner, never for your own record", async () => {
  const k = await notesFor({ type: "kudos", record: { session_id: "s1", from_user: "a", emoji: "🔥" } }, fakeDb(), NOW);
  assert.deepEqual(k.map((n) => [n.to, n.title, n.body]), [["b", "林舟 给你的专注点了 🔥", "LeetCode"]]);
  assert.equal((await notesFor({ type: "kudos", record: { session_id: "s1", from_user: "b", emoji: "🔥" } }, fakeDb(), NOW)).length, 0);
});

test("comments: to the owner, or the owner's answer to everyone in the thread", async () => {
  const c = await notesFor({ type: "session_comments", record: { session_id: "s1", owner_id: "b", author_id: "a", text: "加油" } }, fakeDb(), NOW);
  assert.deepEqual(c.map((n) => [n.to, n.title]), [["b", "林舟 评论了你的记录"]]);
  const r = await notesFor({ type: "session_comments", record: { session_id: "s1", owner_id: "b", author_id: "b", text: "谢谢" } }, fakeDb(), NOW);
  assert.deepEqual(r.map((n) => [n.to, n.title]), [["a", "Mia 回复了你"], ["c", "Mia 回复了你"]]);
});

test("guestbook: notes to the owner, replies also to the person answered", async () => {
  const note = await notesFor({ type: "guestbook", record: { owner_id: "b", author_id: "a", text: "", sticker: "cat" } }, fakeDb(), NOW);
  assert.deepEqual(note.map((n) => [n.to, n.title, n.url]), [["b", "林舟 在你的留言板贴了一张贴纸", "/u/b"]]);
  assert.equal((await notesFor({ type: "guestbook", record: { owner_id: "b", author_id: "b", text: "memo" } }, fakeDb(), NOW)).length, 0);
  const reply = await notesFor({ type: "guestbook", record: { owner_id: "b", author_id: "a", parent_id: "n1", reply_to: "c", text: "同意" } }, fakeDb(), NOW);
  assert.deepEqual(reply.map((n) => [n.to, n.title]), [["b", "林舟 在你的留言板回复了小周"], ["c", "林舟 在 Mia 的留言板回复了你"]]);
  const ownerReply = await notesFor({ type: "guestbook", record: { owner_id: "b", author_id: "b", parent_id: "n1", reply_to: "a", text: "好" } }, fakeDb(), NOW);
  assert.deepEqual(ownerReply.map((n) => [n.to, n.title]), [["a", "Mia 在TA 的留言板回复了你"]]);
});

test("unknown events produce nothing", async () => {
  assert.deepEqual(await notesFor({ type: "profiles", record: {} }, fakeDb(), NOW), []);
});
