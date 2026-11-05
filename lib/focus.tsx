"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { resolveSubject, useApp } from "./store";
import type { FocusMode, LiveStatus, Profile, UserId } from "./types";
import { browserTz, MIN } from "./time";
import { chime } from "./sound";
import { normMode, prefsOf, rememberCountdownMin, suggestBreakMin } from "./focusModes";
import { serverNow } from "./clock";
import { FocusSync, type FocusRow, type Snapshot, type SyncStatus } from "./focusSync";
import { FOCUS_LOCAL } from "./backend/types";

export interface FocusState {
  phase: "focus" | "break" | "breakDone";
  /** pomodoro 番茄钟 / stopwatch 心流 / countdown 倒计时 */
  mode: FocusMode;
  /** planned length of the current phase in ms (pomodoro / countdown focus, or break); 0 = open-ended (flow) */
  plannedMs: number;
  task: string;
  subjectId: string | null;
  startedAt: number;
  accumulatedMs: number;
  runningSince: number | null;
  pomosDone: number;
  withUser: UserId | null;
  /** planned focus minutes of this mode, reused by "再来一轮" (absent in old saved states) */
  focusMin?: number;
  /** pomodoro with 加时 on: time is up but the clock keeps running */
  overtime?: boolean;
  /** R-025: started from this to-do */
  todoId?: string | null;
}

export interface PendingReflection {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  mode: FocusMode;
  task: string;
  subjectId: string | null;
  completedPomodoro: boolean;
  /** suggested break (R-004 "休息（建议 N 分钟）") */
  breakMin?: number;
  /** planned focus minutes, for "再来一轮" */
  focusMin?: number;
  pomosDone?: number;
  /** R-025 */
  todoId?: string | null;
}

/** what to do after the reflection (R-004) */
export type NextStep = "break" | "again" | "switch";

interface FocusCtx {
  state: FocusState | null;
  pending: PendingReflection | null;
  elapsed: number;
  start(o: { mode: FocusMode; minutes?: number; task: string; subjectId: string | null; withUser?: UserId | null; todoId?: string | null }): void;
  pause(): void;
  resume(): void;
  finish(): void;
  discard(): void;
  startBreak(): void;
  skipBreak(): void;
  /** start another focus block of the same mode (after a break) */
  nextPomodoro(): void;
  /** R-003: change the planned length of a running pomodoro / countdown */
  adjust(deltaMin: number): void;
  setMinutes(min: number): void;
  saveReflection(r: { rating: number | null; note: string; task: string; subjectId: string | null; durationMs?: number; then?: NextStep }): Promise<void>;
  dropReflection(): void;
  setTask(task: string, subjectId: string | null): void;
  /** R-006: "local" = this device only (demo, or before the migration); elsewhere = the device that started what is shown */
  sync: { status: "local" | SyncStatus; elsewhere: string | null };
}

const KEY = "tc-focus-v1";
const PKEY = "tc-focus-pending-v1";
const Ctx = createContext<FocusCtx | null>(null);
export const useFocus = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFocus outside provider");
  return c;
};

const read = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const write = (k: string, v: unknown) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

export function elapsedOf(s: FocusState | null, now = serverNow()) {
  if (!s) return 0;
  return s.accumulatedMs + (s.runningSince ? Math.max(0, now - s.runningSince) : 0);
}

/** saved states from older versions: unknown modes become flow, flow has no planned end */
function migrate(s: FocusState | null): FocusState | null {
  if (!s || typeof s !== "object" || !s.phase) return null;
  const mode = normMode(s.mode);
  return { ...s, mode, plannedMs: mode === "stopwatch" && s.phase === "focus" ? 0 : s.plannedMs || 0, pomosDone: s.pomosDone || 0 };
}

/** a stable id for this browser, and what to call it on other devices ("正在 iPhone 上专注") */
function thisDevice(): { id: string; label: string } {
  let id = "";
  try { id = localStorage.getItem("tc-device-id") || ""; if (!id) { id = Math.random().toString(36).slice(2, 14); localStorage.setItem("tc-device-id", id); } } catch { id = "tab-" + Math.random().toString(36).slice(2, 10); }
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const label = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "iPad"
    : /Android/.test(ua) ? "安卓手机" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows 电脑" : "另一台设备";
  return { id, label };
}

/** what goes to the server: the timer, the open reflection, and when the current block is due (for the “time's up” push) */
function buildSnapshot(st: FocusState | null, pd: PendingReflection | null, prof: Profile | null): Snapshot<FocusState, PendingReflection> {
  let dueAt: number | null = null;
  let dueInfo: Record<string, unknown> | null = null;
  if (st && st.runningSince && st.plannedMs && !st.overtime && (st.phase === "focus" || st.phase === "break")) {
    dueAt = st.runningSince + st.plannedMs - st.accumulatedMs;
    const autoBreak = st.phase === "focus" && st.mode === "pomodoro" && !prefsOf(prof).pomoOvertime;
    dueInfo = { phase: st.phase, task: st.task, ...(autoBreak ? { break_min: prof?.breakMin || 5 } : {}) };
  }
  return { state: st, pending: pd, dueAt, dueInfo };
}

const storage = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* */ } },
};

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [state, setState] = useState<FocusState | null>(null);
  const [pending, setPending] = useState<PendingReflection | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    setState(migrate(read<FocusState>(KEY)));
    const p = read<PendingReflection>(PKEY);
    setPending(p ? { ...p, mode: normMode(p.mode) } : null);
    loaded.current = true;
  }, []);
  useEffect(() => { if (loaded.current) write(KEY, state); }, [state]);
  useEffect(() => { if (loaded.current) write(PKEY, pending); }, [pending]);

  /* ─────────── R-006: keep every device on the same timer ─────────── */
  const dev = useMemo(() => (typeof window === "undefined" ? { id: "", label: "" } : thisDevice()), []);
  const syncRef = useRef<FocusSync<FocusState, PendingReflection> | null>(null);
  const [syncStatus, setSyncStatus] = useState<"local" | SyncStatus>("local");
  /** what the server last handed us (and who wrote it): changes that come from there are not written back */
  const remoteRef = useRef<{ state: FocusState | null; pending: PendingReflection | null; holder: string; label: string } | null>(null);
  /** a change already written by commit() (saving a reflection), so the writer below skips it */
  const committedRef = useRef<{ state: FocusState | null; pending: PendingReflection | null } | null>(null);
  const stateRef = useRef(state); stateRef.current = state;
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const appRef = useRef(app); appRef.current = app;
  const snapshotOf = (st: FocusState | null, pd: PendingReflection | null) => buildSnapshot(st, pd, appRef.current.myProfile);
  const [, bump] = useState(0);

  const adoptRow = useCallback((row: FocusRow<FocusState, PendingReflection>) => {
    const st = migrate(row.state);
    const pd = row.pending ? { ...row.pending, mode: normMode(row.pending.mode) } : null;
    remoteRef.current = { state: st, pending: pd, holder: row.holder, label: row.holderLabel };
    setState(st);
    setPending(pd);
    bump((n) => n + 1);
  }, []);

  const backend = app.backend;
  const ready = app.status === "ready";
  const meIdForSync = app.me?.id;
  useEffect(() => {
    if (!ready || !meIdForSync || !loaded.current) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const sync = new FocusSync<FocusState, PendingReflection>(backend, dev.id, dev.label, {
      adopt: (row) => { if (alive) adoptRow(row); },
      saved: (s) => { appRef.current.noteSession(s); appRef.current.pushToast({ title: "离线时写的复盘已保存", body: s.task || undefined, ttl: 4000 }); },
      skipped: () => appRef.current.pushToast({ title: "这段专注已经在另一台设备上处理过了", ttl: 4000 }),
      status: (st) => { if (alive) setSyncStatus(st); },
    }, storage);
    // what this device had before syncing (read from storage: the first render may not have applied it yet)
    const snap = () => {
      const p = read<PendingReflection>(PKEY);
      return snapshotOf(migrate(read<FocusState>(KEY)), p ? { ...p, mode: normMode(p.mode) } : null);
    };
    const start = (delay: number) => {
      sync.init(snap()).then((row) => {
        if (!alive) return;
        syncRef.current = sync;
        setSyncStatus(sync.status);
        if (row) adoptRow(row);
        // keeping the local timer: send what it is now (it may have moved on, e.g. finished, while we waited)
        else sync.push(snapshotOf(stateRef.current, pendingRef.current));
      }).catch((e) => {
        if (!alive) return;
        if ((e as Error).message === FOCUS_LOCAL) { setSyncStatus("local"); return; }
        // offline at start-up: keep the local timer and try again
        setSyncStatus("offline");
        retry = setTimeout(() => start(Math.min(delay * 2, 60_000)), delay);
      });
    };
    start(5000);
    const off = backend.subscribeFocus(meIdForSync, (row) => sync.receive(row as FocusRow<FocusState, PendingReflection>));
    // back online / back to the page: send what is waiting, and catch up on anything realtime missed
    const wake = () => {
      if (!syncRef.current) return;
      sync.retryNow();
      backend.focusGet().then(({ row }) => sync.receive(row as FocusRow<FocusState, PendingReflection>)).catch(() => {});
    };
    const onVis = () => { if (document.visibilityState === "visible") wake(); };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      off(); sync.close();
      if (syncRef.current === sync) syncRef.current = null;
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, meIdForSync, backend, dev.id]);

  // every local change goes to the server (changes that came from it, or were already committed, do not)
  useEffect(() => {
    const sync = syncRef.current;
    if (!sync || !loaded.current) return;
    const r = remoteRef.current;
    if (r && r.state === state && r.pending === pending) return;
    const c = committedRef.current;
    committedRef.current = null;
    if (c && c.state === state && c.pending === pending) return;
    remoteRef.current = null;
    sync.push(snapshotOf(state, pending));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pending]);

  // R-019: the running focus follows its subject when it is merged (or drops it when deleted)
  useEffect(() => {
    const to = resolveSubject(state?.subjectId ?? null, app.subjectRedirects);
    if (state && to !== state.subjectId) setState((s) => s && { ...s, subjectId: to });
  }, [state, app.subjectRedirects]);

  // mirror to live status
  const meId = app.me?.id;
  const subj = state?.subjectId ? app.subjects.find((s) => s.id === state.subjectId) : null;
  const liveKey = JSON.stringify([state?.phase, state?.mode, state?.overtime, state?.runningSince, state?.accumulatedMs, state?.task, state?.subjectId, state?.plannedMs, state?.startedAt, subj?.name, subj?.color]);
  useEffect(() => {
    if (!meId || app.status !== "ready" || !loaded.current) return;
    // R-006: the device that made the change keeps live_status up to date, not every device showing it
    const r = remoteRef.current;
    if (r && r.state === state && r.holder && r.holder !== dev.id) return;
    const s = state;
    const l: LiveStatus = !s || s.phase === "breakDone"
      ? { userId: meId, state: "idle", task: "", subjectName: "", subjectColor: null, mode: "stopwatch", startedAt: null, plannedEnd: null, accumulatedMs: 0, runningSince: null, updatedAt: serverNow() }
      : {
          userId: meId,
          state: s.phase === "break" ? "break" : s.runningSince ? "focus" : "paused",
          task: s.task, subjectName: subj?.name || "", subjectColor: subj?.color ?? null, mode: s.mode,
          startedAt: s.startedAt,
          plannedEnd: s.plannedMs && s.runningSince && !s.overtime ? s.runningSince + (s.plannedMs - s.accumulatedMs) : null,
          accumulatedMs: s.accumulatedMs, runningSince: s.runningSince, updatedAt: serverNow(),
        };
    const cur = app.live[meId];
    if (cur && cur.state === l.state && cur.mode === l.mode && cur.plannedEnd === l.plannedEnd && cur.runningSince === l.runningSince && cur.accumulatedMs === l.accumulatedMs && cur.task === l.task && cur.subjectName === l.subjectName && cur.subjectColor === l.subjectColor && cur.startedAt === l.startedAt) return;
    app.setLive(l).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, meId, app.status]);

  const elapsed = elapsedOf(state, app.now);
  const prof = app.myProfile;
  const prefs = useMemo(() => prefsOf(prof), [prof]);
  const pomoMin = prof?.pomodoroMin || 25;
  const breakMin = prof?.breakMin || 5;

  const toPending = useCallback((s: FocusState, completed: boolean): PendingReflection => {
    const now = serverNow();
    const el = elapsedOf(s, now);
    // a finished timer records exactly its planned length; overtime and stopped-early record what was measured
    const d = completed && s.plannedMs && !s.overtime ? s.plannedMs : el;
    const pomo = s.mode === "pomodoro";
    return {
      startedAt: s.startedAt, endedAt: now, durationMs: d, mode: s.mode, task: s.task, subjectId: s.subjectId,
      completedPomodoro: pomo && (completed || !!s.overtime),
      breakMin: pomo ? breakMin : suggestBreakMin(d, prefs),
      focusMin: s.focusMin || (s.plannedMs ? Math.round(s.plannedMs / MIN) : pomo ? pomoMin : undefined),
      pomosDone: s.pomosDone + (pomo && (completed || s.overtime) ? 1 : 0),
      todoId: s.todoId || null,
    };
  }, [breakMin, pomoMin, prefs]);

  // phase completion
  useEffect(() => {
    if (!state || !state.plannedMs || !state.runningSince) return;
    // wait for the profile: 加时 and the break length live there
    if (!prof) return;
    if (elapsed < state.plannedMs) return;
    if (state.phase === "focus") {
      if (state.overtime) return;
      chime("done");
      if (state.mode === "pomodoro" && prefs.pomoOvertime) {
        // 加时：只提醒，计时继续，由你自己点结束
        setState({ ...state, overtime: true });
        return;
      }
      setPending(toPending(state, true));
      if (state.mode === "countdown") { setState(null); return; }
      const now = serverNow();
      // roll straight into the break; the reflection sheet sits on top of it
      setState({ ...state, phase: "break", plannedMs: breakMin * MIN, startedAt: now, accumulatedMs: 0, runningSince: now, pomosDone: state.pomosDone + 1 });
    } else if (state.phase === "break") {
      chime("break");
      setState({ ...state, phase: "breakDone", runningSince: null, accumulatedMs: state.plannedMs });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, state, toPending]);

  // keep the tab title informative
  useEffect(() => {
    if (!state || state.phase === "breakDone") { document.title = "同窗"; return; }
    const over = state.plannedMs && elapsed > state.plannedMs;
    const left = state.plannedMs ? Math.abs(state.plannedMs - elapsed) : elapsed;
    const s = Math.max(0, Math.floor(left / 1000));
    const t = `${over ? "+" : ""}${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    const what = state.phase === "break" ? "休息" : !state.runningSince ? "暂停" : state.mode === "stopwatch" ? "心流" : over ? "加时" : "专注";
    document.title = `${what} ${t} · 同窗`;
  }, [state, elapsed]);

  /** a fresh focus block */
  const focusBlock = (o: { mode: FocusMode; minutes?: number; task: string; subjectId: string | null; withUser?: UserId | null; pomosDone?: number; todoId?: string | null }): FocusState => {
    const now = serverNow();
    const m = o.mode === "stopwatch" ? 0 : Math.round(o.minutes || (o.mode === "pomodoro" ? pomoMin : 30));
    if (o.mode === "countdown") rememberCountdownMin(m);
    return { phase: "focus", mode: o.mode, plannedMs: m * MIN, focusMin: m || undefined, task: o.task, subjectId: o.subjectId, startedAt: now, accumulatedMs: 0, runningSince: now, pomosDone: o.pomosDone || 0, withUser: o.withUser || null, todoId: o.todoId || null };
  };

  function replan(min: number) {
    setState((s) => {
      if (!s || s.phase !== "focus" || s.mode === "stopwatch") return s;
      const m = Math.max(1, Math.min(300, Math.round(min)));
      const el = elapsedOf(s);
      // moving the end past "now" again leaves overtime, so the chime can ring once more
      return { ...s, plannedMs: m * MIN, focusMin: m, overtime: s.overtime && m * MIN <= el };
    });
  }

  const value: FocusCtx = {
    state, pending, elapsed,
    start({ mode, minutes, task, subjectId, withUser, todoId }) {
      setState(focusBlock({ mode: normMode(mode), minutes, task, subjectId, withUser, todoId, pomosDone: state?.pomosDone || 0 }));
    },
    pause() { if (state?.runningSince) setState({ ...state, accumulatedMs: elapsedOf(state), runningSince: null }); },
    resume() { if (state && !state.runningSince && state.phase !== "breakDone") setState({ ...state, runningSince: serverNow() }); },
    finish() {
      if (!state) return;
      if (state.phase === "focus") {
        const p = toPending(state, false);
        if (p.durationMs >= MIN) setPending(p);
        else app.pushToast({ title: "不足 1 分钟，未记录" });
      }
      setState(null);
    },
    discard() { setState(null); },
    startBreak() {
      const now = serverNow();
      setState((s) => s && { ...s, phase: "break", plannedMs: breakMin * MIN, startedAt: now, accumulatedMs: 0, runningSince: now });
    },
    skipBreak() { setState((s) => s && { ...s, phase: "breakDone", runningSince: null }); },
    nextPomodoro() {
      setState((s) => s && focusBlock({ mode: s.mode, minutes: s.focusMin || (s.mode === "pomodoro" ? pomoMin : undefined), task: s.task, subjectId: s.subjectId, withUser: s.withUser, pomosDone: s.pomosDone, todoId: s.todoId }));
    },
    adjust(deltaMin) {
      if (!state || state.phase !== "focus" || state.mode === "stopwatch") return;
      replan(Math.round(state.plannedMs / MIN) + deltaMin);
    },
    setMinutes(min) { replan(min); },
    async saveReflection({ rating, note, task, subjectId, durationMs, then }) {
      if (!pending || !app.me) return;
      const p = pending;
      // you can record less than the timer measured (forgot to stop it), never more
      const d = Math.max(MIN, Math.min(p.durationMs, durationMs ?? p.durationMs));
      // R-004: what's next
      const now = serverNow();
      let next: FocusState | null = state;
      if (then === "break") {
        // a finished pomodoro is already on its break; anything else starts one now
        if (state?.phase !== "break") {
          next = { phase: "break", mode: p.mode, plannedMs: (p.mode === "pomodoro" ? p.breakMin || breakMin : suggestBreakMin(d, prefs)) * MIN, focusMin: p.focusMin, task, subjectId, startedAt: now, accumulatedMs: 0, runningSince: now, pomosDone: p.pomosDone || 0, withUser: null, todoId: p.todoId || null };
        }
      } else if (then === "again") {
        next = focusBlock({ mode: p.mode, minutes: p.focusMin, task, subjectId, pomosDone: p.pomosDone, todoId: p.todoId });
      } else if (then === "switch") {
        next = null;
      }
      const rec = { subjectId, task, startedAt: p.startedAt, endedAt: p.endedAt - (p.durationMs - d), durationMs: d, mode: p.mode, rating, note, tz: prof?.tz || browserTz(), todoId: p.todoId || null };
      const sync = syncRef.current;
      // R-006: the record and the cleared reflection are saved together (commit below), so the writer skips this change
      if (sync) committedRef.current = { state: next, pending: null };
      setPending(null);
      setState(next);
      if (!sync) {
        await app.addSession({ userId: app.me.id, ...rec });
        return;
      }
      const sid = resolveSubject(subjectId, app.subjectRedirects);
      const res = await sync.commit(p.startedAt, { ...rec, subjectId: sid && app.subjects.some((x) => x.id === sid) ? sid : null }, snapshotOf(next, null));
      if (res === "queued") app.pushToast({ title: "离线中：这条记录会在联网后保存", ttl: 5000 });
      else if (res) app.noteSession(res);
      else app.pushToast({ title: "这段专注已经在另一台设备上处理过了", ttl: 4000 });
    },
    dropReflection() { setPending(null); },
    // a different task is no longer the to-do it was started from
    setTask(task, subjectId) { setState((s) => s && { ...s, task, subjectId, todoId: task === s.task ? s.todoId : null }); },
    sync: {
      status: syncStatus,
      elsewhere: (() => {
        const r = remoteRef.current;
        return r && state && r.state === state && r.holder && r.holder !== dev.id ? r.label || "另一台设备" : null;
      })(),
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
