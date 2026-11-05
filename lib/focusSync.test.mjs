// R-006 sync engine against a fake server that behaves like focus_write() in supabase/schema.sql.
// Run: node --import ./scripts/test-ts-hooks.mjs --test lib/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { FocusSync } from "./focusSync.ts";
import { serverNow, resetClock } from "./clock.ts";

class FakeServer {
  constructor() { this.row = { version: 0, holder: "", holderLabel: "", state: null, pending: null, dueAt: null, dueInfo: null, savedKeys: [] }; this.sessions = []; this.down = false; this.writes = 0; this.skew = 0; this.listeners = []; }
  now() { return Date.now() + this.skew; }
  async tick() { await new Promise((r) => setTimeout(r, 1)); if (this.down) throw new Error("TypeError: Failed to fetch"); }
  api() {
    return {
      focusGet: async () => { await this.tick(); return { row: { ...this.row }, now: this.now() }; },
      focusWrite: async (w) => {
        await this.tick();
        this.writes++;
        if (w.session && w.pendingKey != null && this.row.savedKeys.includes(w.pendingKey)) return { ok: false, row: { ...this.row }, now: this.now(), session: null };
        if (w.expected !== this.row.version) return { ok: false, row: { ...this.row }, now: this.now(), session: null };
        let session = null;
        if (w.session) { session = { id: "s" + (this.sessions.length + 1), userId: "me", ...w.session }; this.sessions.push(session); }
        const savedKeys = w.session && w.pendingKey != null ? [...this.row.savedKeys, w.pendingKey].slice(-20) : this.row.savedKeys;
        this.row = { version: this.row.version + 1, holder: w.device, holderLabel: w.label, state: w.state, pending: w.pending, dueAt: w.dueAt, dueInfo: w.dueInfo, savedKeys };
        this.listeners.forEach((f) => f({ ...this.row }));
        return { ok: true, row: { ...this.row }, now: this.now(), session };
      },
    };
  }
}
const memStore = () => { const m = new Map(); return { m, get: (k) => m.get(k) ?? null, set: (k, v) => (v == null ? m.delete(k) : m.set(k, v)) }; };
function device(server, name, store = memStore(), extra = {}) {
  const seen = [];
  const sync = new FocusSync(server.api(), name, name, { adopt: (row) => seen.push(row), ...extra }, store);
  return { sync, seen, store };
}
const snap = (state, pending = null) => ({ state, pending, dueAt: null, dueInfo: null });
const record = (startedAt) => ({ task: "线代", startedAt, endedAt: startedAt + 25 * 60_000, durationMs: 25 * 60_000, mode: "pomodoro", rating: 4, note: "", tz: "Asia/Shanghai", subjectId: null });

test("a timer running from before the update is uploaded on first contact", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone");
  const adopt = await a.sync.init(snap({ phase: "focus", task: "旧计时" }));
  assert.equal(adopt, null, "keeps the local timer");
  await a.sync.idle();
  assert.equal(srv.row.state.task, "旧计时");
  assert.equal(srv.row.version, 1);
});

test("a device that opens later shows the timer from the server", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone");
  await a.sync.init(snap(null));
  a.sync.push(snap({ phase: "focus", task: "线代" }));
  await a.sync.idle();
  const b = device(srv, "laptop");
  const row = await b.sync.init(snap({ phase: "focus", task: "这台电脑上的旧状态" }));
  assert.equal(row.state.task, "线代", "server wins over a stale local state");
  assert.equal(row.holderLabel, "phone");
});

test("rapid changes collapse into few writes", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone");
  await a.sync.init(snap(null));
  for (let i = 0; i < 10; i++) a.sync.push(snap({ phase: "focus", n: i }));
  await a.sync.idle();
  assert.ok(srv.writes <= 2, `wrote ${srv.writes} times`);
  assert.equal(srv.row.state.n, 9, "the last change wins");
});

test("when another device wrote first, this one takes the server's state", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone"), b = device(srv, "laptop");
  await a.sync.init(snap(null)); await b.sync.init(snap(null));
  a.sync.push(snap({ phase: "focus", by: "phone" }));
  await a.sync.idle();
  b.sync.push(snap({ phase: "break", by: "laptop" })); // based on version 0
  await b.sync.idle();
  assert.equal(srv.row.state.by, "phone", "the stale write did not land");
  assert.equal(b.seen.at(-1).state.by, "phone", "laptop adopted the phone's state");
  assert.equal(b.sync.version, srv.row.version);
  // and now it can write
  b.sync.push(snap({ phase: "focus", by: "laptop" }));
  await b.sync.idle();
  assert.equal(srv.row.state.by, "laptop");
});

test("two devices saving the same reflection make one record", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone"), b = device(srv, "laptop");
  await a.sync.init(snap(null));
  a.sync.push(snap({ phase: "break" }, { startedAt: 1000 }));
  await a.sync.idle();
  await b.sync.init(snap(null));
  const [ra, rb] = await Promise.all([
    a.sync.commit(1000, record(1000), snap({ phase: "break" })),
    b.sync.commit(1000, record(1000), snap(null)),
  ]);
  assert.equal(srv.sessions.length, 1, "exactly one record");
  assert.equal([ra, rb].filter((r) => r && r !== "queued").length, 1, "one device saved it");
  assert.equal([ra, rb].filter((r) => r === null).length, 1, "the other was told it was saved elsewhere");
  assert.equal(srv.row.pending, null);
});

test("saving a reflection keeps the timer another device started meanwhile", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone"), b = device(srv, "laptop");
  await a.sync.init(snap(null));
  a.sync.push(snap(null, { startedAt: 2000 }));
  await a.sync.idle();
  await b.sync.init(snap(null));
  b.sync.push(snap({ phase: "focus", task: "下一轮" }, { startedAt: 2000 })); // laptop starts a new block, reflection still open
  await b.sync.idle();
  const r = await a.sync.commit(2000, record(2000), snap(null)); // phone is a version behind
  assert.ok(r && r !== "queued");
  assert.equal(srv.sessions.length, 1);
  assert.equal(srv.row.state.task, "下一轮", "the laptop's timer survives");
  assert.equal(srv.row.pending, null);
});

test("offline: the reflection waits, survives a reload, and is saved once", async () => {
  const srv = new FakeServer();
  const store = memStore();
  const a = device(srv, "phone", store);
  await a.sync.init(snap(null));
  a.sync.push(snap(null, { startedAt: 3000 }));
  await a.sync.idle();
  srv.down = true;
  const r = await a.sync.commit(3000, record(3000), snap(null));
  assert.equal(r, "queued");
  assert.equal(a.sync.status, "offline");
  assert.ok(store.get("tc-focus-outbox-v1"), "kept in storage");
  a.sync.close();
  // the page is reloaded while still offline, then the network comes back
  const saved = [];
  srv.down = false;
  const again = device(srv, "phone", store, { saved: (s) => saved.push(s) });
  await again.sync.init(snap(null));
  await again.sync.idle();
  assert.equal(srv.sessions.length, 1);
  assert.equal(saved.length, 1, "the app hears about the saved record");
  assert.equal(store.get("tc-focus-outbox-v1"), null, "outbox emptied");
});

test("offline state changes are retried when the network returns", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone");
  await a.sync.init(snap(null));
  srv.down = true;
  a.sync.push(snap({ phase: "focus", paused: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(a.sync.status, "offline");
  srv.down = false;
  a.sync.retryNow();
  await a.sync.idle();
  assert.equal(a.sync.status, "synced");
  assert.equal(srv.row.state.paused, true);
  a.sync.close();
});

test("realtime: echoes are ignored, newer rows are adopted", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone");
  await a.sync.init(snap(null));
  a.sync.push(snap({ phase: "focus" }));
  await a.sync.idle();
  a.sync.receive({ ...srv.row }); // our own write coming back
  assert.equal(a.seen.length, 0);
  a.sync.receive({ ...srv.row, version: srv.row.version + 1, state: { phase: "break" }, holder: "laptop" });
  assert.equal(a.seen.length, 1);
  assert.equal(a.sync.holder, "laptop");
});

test("the server's clock is used for timestamps", async () => {
  resetClock();
  const srv = new FakeServer();
  srv.skew = 5 * 60_000; // this device is 5 minutes slow
  const a = device(srv, "phone");
  await a.sync.init(snap(null));
  assert.ok(Math.abs(serverNow() - (Date.now() + srv.skew)) < 200, `off by ${serverNow() - Date.now() - srv.skew} ms`);
  resetClock();
});

test("a device that already heard about the save cannot save the same reflection again", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone"), b = device(srv, "laptop");
  await a.sync.init(snap(null));
  a.sync.push(snap(null, { startedAt: 4000 }));
  await a.sync.idle();
  await b.sync.init(snap(null));
  srv.listeners.push((row) => b.sync.receive(row)); // b follows realtime
  assert.ok(await a.sync.commit(4000, record(4000), snap(null)));
  assert.equal(b.sync.version, srv.row.version, "b is up to date");
  // b's sheet was still open (stale UI) and saves: right version, but this reflection is already saved
  assert.equal(await b.sync.commit(4000, record(4000), snap(null)), null);
  assert.equal(srv.sessions.length, 1);
});

test("a reflection written offline, never seen by the server, is still saved", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone");
  await a.sync.init(snap(null));
  srv.down = true;
  a.sync.push(snap(null, { startedAt: 5000 })); // the block ended while offline
  const r = await a.sync.commit(5000, record(5000), snap(null));
  assert.equal(r, "queued");
  srv.down = false;
  a.sync.retryNow();
  await a.sync.idle();
  assert.equal(srv.sessions.length, 1);
  a.sync.close();
});

test("saving keeps a different reflection another device left open", async () => {
  const srv = new FakeServer();
  const a = device(srv, "phone"), b = device(srv, "laptop");
  await a.sync.init(snap(null)); await b.sync.init(snap(null));
  srv.down = true;
  a.sync.push(snap(null, { startedAt: 6000 }));
  const queued = a.sync.commit(6000, record(6000), snap(null));
  assert.equal(await queued, "queued");
  srv.down = false;
  b.sync.push(snap(null, { startedAt: 7000 })); // laptop finished another block meanwhile
  await b.sync.idle();
  a.sync.retryNow();
  await a.sync.idle();
  assert.equal(srv.sessions.length, 1, "phone's record saved");
  assert.equal(srv.row.pending?.startedAt, 7000, "laptop's open reflection kept");
  a.sync.close();
});

test("tabs sharing one storage don't wipe each other's waiting records", async () => {
  const srv = new FakeServer();
  const shared = memStore();
  const a = device(srv, "tab1", shared), b = device(srv, "tab2", shared);
  await a.sync.init(snap(null)); await b.sync.init(snap(null));
  srv.down = true;
  assert.equal(await a.sync.commit(8000, record(8000), snap(null)), "queued");
  assert.equal(await b.sync.commit(9000, record(9000), snap(null)), "queued");
  assert.equal(JSON.parse(shared.get("tc-focus-outbox-v1")).length, 2, "both waiting");
  a.sync.close(); b.sync.close();
  srv.down = false;
  const c = device(srv, "tab1", shared); // a reload picks up both
  await c.sync.init(snap(null));
  await c.sync.idle();
  assert.equal(srv.sessions.length, 2);
  assert.equal(shared.get("tc-focus-outbox-v1"), null);
});
