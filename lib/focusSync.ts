/**
 * v1.11 R-006 跨设备计时: keeps this device's timer in step with public.focus_state.
 *
 * Every write carries the version it was based on (compare-and-set in focus_write()). When another device
 * wrote first, the write is refused and this device takes the server's state instead, so two devices never
 * both count the same focus or both save the same record. Saving a reflection writes the record and clears
 * the pending entry in one transaction; if the network is down it waits in an outbox (kept in localStorage)
 * and is retried, so a record is never lost and never saved twice.
 *
 * No React in here: lib/focus.tsx drives it, and lib/focusSync.test.mjs tests it against a fake server.
 */
import type { Session } from "./types";
import { noteServerTime } from "./clock";

export interface FocusRow<S = unknown, P = unknown> {
  version: number;
  holder: string;
  holderLabel: string;
  state: S | null;
  pending: P | null;
  /** when the server's current block is due (epoch ms), and what the “time's up” push says */
  dueAt: number | null;
  dueInfo: Record<string, unknown> | null;
  /** reflections already saved (their pending.startedAt); the server refuses to save one of these again */
  savedKeys: number[];
}

export interface FocusWrite<S = unknown, P = unknown> {
  expected: number;
  device: string;
  label: string;
  state: S | null;
  pending: P | null;
  dueAt: number | null;
  dueInfo: Record<string, unknown> | null;
  session?: Omit<Session, "id" | "userId"> | null;
  /** which reflection `session` answers */
  pendingKey?: number | null;
}

export interface FocusApi {
  focusGet(): Promise<{ row: FocusRow; now: number }>;
  focusWrite(w: FocusWrite): Promise<{ ok: boolean; row: FocusRow; now: number; session: Session | null }>;
}

export interface Snapshot<S = unknown, P = unknown> {
  state: S | null;
  pending: P | null;
  dueAt: number | null;
  dueInfo: Record<string, unknown> | null;
}

export type SyncStatus = "synced" | "offline";

/** a saved reflection that has not reached the server yet */
interface OutboxItem<S, P> {
  /** identifies which pending entry it answers (its startedAt) */
  pendingKey: number;
  session: Omit<Session, "id" | "userId">;
  /** what to show after saving (the R-004 next step) */
  next: Snapshot<S, P>;
}

export interface Storage { get(k: string): string | null; set(k: string, v: string | null): void }

const OUTBOX = "tc-focus-outbox-v1";
const isNetwork = (e: unknown) => /fetch|network|Failed to fetch|Load failed|timeout|offline/i.test(String((e as Error)?.message || e));

export class FocusSync<S extends object = object, P extends { startedAt: number } = { startedAt: number }> {
  version = 0;
  holder = "";
  holderLabel = "";
  status: SyncStatus = "synced";
  private busy = false;
  /** latest local snapshot not yet written */
  private queued: Snapshot<S, P> | null = null;
  private outbox: OutboxItem<S, P>[];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 2000;
  private closed = false;
  private waiters: (() => void)[] = [];
  /** bumped by commit(): a state write that was in flight before it must not be retried after it */
  private gen = 0;

  private api: FocusApi;
  readonly device: string;
  private label: string;
  private hooks: {
    /** take the server's state (another device acted, or a write of ours was refused) */
    adopt(row: FocusRow<S, P>): void;
    /** a queued reflection was saved */
    saved?(s: Session): void;
    /** a queued reflection turned out to be saved or dropped on another device */
    skipped?(): void;
    status?(s: SyncStatus): void;
  };
  private store: Storage;

  constructor(api: FocusApi, device: string, label: string, hooks: FocusSync<S, P>["hooks"], store: Storage) {
    this.api = api; this.device = device; this.label = label; this.hooks = hooks; this.store = store;
    this.outbox = this.readStored();
  }

  private setStatus(s: SyncStatus) { if (this.status !== s) { this.status = s; this.hooks.status?.(s); } }
  /**
   * the outbox in storage is shared by every tab of this browser: merge by pendingKey so one tab never wipes
   * another's waiting record (a record two tabs both try is still saved once: the server checks saved keys)
   */
  private readStored(): OutboxItem<S, P>[] { try { return JSON.parse(this.store.get(OUTBOX) || "[]"); } catch { return []; } }
  private saveOutbox(removed?: number) {
    const mine = new Set(this.outbox.map((x) => x.pendingKey));
    const others = this.readStored().filter((x) => !mine.has(x.pendingKey) && x.pendingKey !== removed);
    const all = [...others, ...this.outbox];
    this.store.set(OUTBOX, all.length ? JSON.stringify(all) : null);
  }

  private async call<T extends { now: number }>(f: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    const r = await f();
    noteServerTime(t0, Date.now(), r.now);
    return r;
  }

  private take(row: FocusRow<S, P>) {
    this.version = row.version;
    this.holder = row.holder;
    this.holderLabel = row.holderLabel;
  }

  /**
   * first contact. Returns the server's row when this device should show it, or null to keep the local
   * state (which is then uploaded: the migration path for timers running from before v1.11).
   */
  async init(local: Snapshot<S, P>): Promise<FocusRow<S, P> | null> {
    const { row } = await this.call(() => this.api.focusGet()) as { row: FocusRow<S, P>; now: number };
    this.take(row);
    this.setStatus("synced");
    let out: FocusRow<S, P> | null = null;
    if (row.state != null || row.pending != null) out = row;
    else if (local.state != null || local.pending != null) this.push(local);
    if (this.outbox.length) this.kick();
    return out;
  }

  /** a realtime update from another device (or the echo of our own write) */
  receive(row: FocusRow<S, P>) {
    if (this.closed || row.version <= this.version) return;
    if (this.busy) return; // the write in flight will reconcile with the server
    this.take(row);
    this.queued = null;
    this.hooks.adopt(row);
  }

  /** upload the latest local state; rapid changes collapse into one write */
  push(s: Snapshot<S, P>) {
    if (this.closed) return;
    this.queued = s;
    this.kick();
  }

  /**
   * save a reflection: write the record and `next` together. Resolves with the saved record, null when
   * another device already saved (or dropped) this one, or "queued" when offline (it is sent later).
   */
  async commit(pendingKey: number, session: Omit<Session, "id" | "userId">, next: Snapshot<S, P>): Promise<Session | null | "queued"> {
    this.outbox.push({ pendingKey, session, next });
    this.saveOutbox();
    this.queued = null; // `next` supersedes any state not yet written
    this.gen++;
    const item = this.outbox[this.outbox.length - 1];
    return new Promise((resolve) => {
      this.resolvers.set(item, resolve);
      this.kick();
    });
  }
  private resolvers = new Map<OutboxItem<S, P>, (r: Session | null | "queued") => void>();

  /** wait until nothing is queued or in flight (tests, and before signing out) */
  idle(): Promise<void> {
    if (!this.busy && !this.queued && !this.outbox.length) return Promise.resolve();
    return new Promise((r) => this.waiters.push(r));
  }

  retryNow() {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.retryDelay = 2000;
    this.kick();
  }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  private kick() {
    if (this.busy || this.closed || this.retryTimer) return;
    this.busy = true;
    this.loop().finally(() => {
      this.busy = false;
      if (!this.queued && !this.outbox.length) { const w = this.waiters; this.waiters = []; w.forEach((f) => f()); }
    });
  }

  private offline() {
    this.setStatus("offline");
    // let the UI know a reflection is waiting rather than leaving the sheet hanging
    for (const item of this.outbox) { const r = this.resolvers.get(item); if (r) { this.resolvers.delete(item); r("queued"); } }
    if (this.closed) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.kick(); }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
  }

  private async loop() {
    for (;;) {
      if (this.closed) return;
      try {
        if (this.outbox.length) { await this.sendCommit(this.outbox[0]); continue; }
        if (this.queued) { await this.sendState(); continue; }
        return;
      } catch (e) {
        if (isNetwork(e)) { this.offline(); return; }
        // anything else (a bad record, a constraint): report it on the commit and drop it, or drop the state write
        if (this.outbox.length) {
          const item = this.outbox.shift()!;
          this.saveOutbox(item.pendingKey);
          const r = this.resolvers.get(item);
          this.resolvers.delete(item);
          if (r) { r(null); }
          console.error("同窗：保存专注记录失败", e);
        } else {
          this.queued = null;
          console.error("同窗：同步计时失败", e);
        }
      }
    }
  }

  private async sendState() {
    const s = this.queued!;
    this.queued = null;
    const gen = this.gen;
    let res: { ok: boolean; row: FocusRow<S, P>; now: number };
    try {
      res = await this.call(() => this.api.focusWrite({ expected: this.version, device: this.device, label: this.label, ...s, session: null })) as typeof res;
    } catch (e) {
      // not sent: keep it for the retry unless something newer is already waiting (or a commit replaced it)
      if (!this.queued && gen === this.gen) this.queued = s;
      throw e;
    }
    this.setStatus("synced");
    this.retryDelay = 2000;
    this.take(res.row);
    // refused: another device got there first. Its state wins; a newer local change (queued meanwhile) is dropped too
    if (!res.ok) { this.queued = null; this.hooks.adopt(res.row); }
  }

  private async sendCommit(item: OutboxItem<S, P>) {
    for (;;) {
      const res = await this.call(() => this.api.focusWrite({
        expected: this.version, device: this.device, label: this.label, ...item.next, session: item.session, pendingKey: item.pendingKey,
      })) as { ok: boolean; row: FocusRow<S, P>; now: number; session: Session | null };
      this.setStatus("synced");
      this.retryDelay = 2000;
      this.take(res.row);
      if (res.ok) { this.finish(item, res.session); return; }
      // refused because another device already saved this reflection
      if ((res.row.savedKeys || []).includes(item.pendingKey)) {
        this.hooks.adopt(res.row);
        this.finish(item, null);
        return;
      }
      // refused because the server moved on (another device acted): save on top of what is there now,
      // keeping its timer and any other reflection; only our own pending entry is ours to clear
      const p = res.row.pending as P | null;
      item.next = {
        state: res.row.state, pending: p && p.startedAt !== item.pendingKey ? p : null,
        dueAt: res.row.dueAt, dueInfo: res.row.dueInfo,
      };
    }
  }

  private finish(item: OutboxItem<S, P>, s: Session | null) {
    this.outbox = this.outbox.filter((x) => x !== item);
    this.saveOutbox(item.pendingKey);
    const r = this.resolvers.get(item);
    this.resolvers.delete(item);
    if (r) r(s);
    else if (s) this.hooks.saved?.(s); // a reflection queued before a reload, saved now
    else this.hooks.skipped?.();
  }
}
