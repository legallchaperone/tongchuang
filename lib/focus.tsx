"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useApp } from "./store";
import type { FocusMode, LiveStatus, UserId } from "./types";
import { browserTz, MIN } from "./time";
import { chime } from "./sound";

export interface FocusState {
  phase: "focus" | "break" | "breakDone";
  mode: FocusMode;
  /** planned length of the current phase in ms (pomodoro focus or break); 0 = open-ended */
  plannedMs: number;
  task: string;
  subjectId: string | null;
  startedAt: number;
  accumulatedMs: number;
  runningSince: number | null;
  pomosDone: number;
  withUser: UserId | null;
}

export interface PendingReflection {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  mode: FocusMode;
  task: string;
  subjectId: string | null;
  completedPomodoro: boolean;
}

interface FocusCtx {
  state: FocusState | null;
  pending: PendingReflection | null;
  elapsed: number;
  start(o: { mode: FocusMode; minutes?: number; task: string; subjectId: string | null; withUser?: UserId | null }): void;
  pause(): void;
  resume(): void;
  finish(): void;
  discard(): void;
  startBreak(): void;
  skipBreak(): void;
  nextPomodoro(): void;
  saveReflection(r: { rating: number | null; note: string; task: string; subjectId: string | null; durationMs?: number }): Promise<void>;
  dropReflection(): void;
  setTask(task: string, subjectId: string | null): void;
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

export function elapsedOf(s: FocusState | null, now = Date.now()) {
  if (!s) return 0;
  return s.accumulatedMs + (s.runningSince ? Math.max(0, now - s.runningSince) : 0);
}

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [state, setState] = useState<FocusState | null>(null);
  const [pending, setPending] = useState<PendingReflection | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    setState(read<FocusState>(KEY));
    setPending(read<PendingReflection>(PKEY));
    loaded.current = true;
  }, []);
  useEffect(() => { if (loaded.current) write(KEY, state); }, [state]);
  useEffect(() => { if (loaded.current) write(PKEY, pending); }, [pending]);

  // mirror to live status
  const meId = app.me?.id;
  const subj = state?.subjectId ? app.subjects.find((s) => s.id === state.subjectId) : null;
  const liveKey = JSON.stringify([state?.phase, state?.runningSince, state?.accumulatedMs, state?.task, state?.subjectId, state?.plannedMs, state?.startedAt, subj?.name]);
  useEffect(() => {
    if (!meId || app.status !== "ready" || !loaded.current) return;
    const s = state;
    const l: LiveStatus = !s || s.phase === "breakDone"
      ? { userId: meId, state: "idle", task: "", subjectName: "", subjectColor: null, mode: "stopwatch", startedAt: null, plannedEnd: null, accumulatedMs: 0, runningSince: null, updatedAt: Date.now() }
      : {
          userId: meId,
          state: s.phase === "break" ? "break" : s.runningSince ? "focus" : "paused",
          task: s.task, subjectName: subj?.name || "", subjectColor: subj?.color ?? null, mode: s.mode,
          startedAt: s.startedAt,
          plannedEnd: s.plannedMs && s.runningSince ? s.runningSince + (s.plannedMs - s.accumulatedMs) : null,
          accumulatedMs: s.accumulatedMs, runningSince: s.runningSince, updatedAt: Date.now(),
        };
    const cur = app.live[meId];
    if (cur && cur.state === l.state && cur.runningSince === l.runningSince && cur.accumulatedMs === l.accumulatedMs && cur.task === l.task && cur.subjectName === l.subjectName && cur.startedAt === l.startedAt) return;
    app.setLive(l).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, meId, app.status]);

  const elapsed = elapsedOf(state, app.now);
  const prof = app.myProfile;

  const toPending = useCallback((s: FocusState, completed: boolean): PendingReflection => {
    const now = Date.now();
    const d = completed && s.plannedMs ? s.plannedMs : elapsedOf(s, now);
    return { startedAt: s.startedAt, endedAt: now, durationMs: d, mode: s.mode, task: s.task, subjectId: s.subjectId, completedPomodoro: completed };
  }, []);

  // phase completion
  useEffect(() => {
    if (!state || !state.plannedMs || !state.runningSince) return;
    if (elapsed < state.plannedMs) return;
    if (state.phase === "focus") {
      chime("done");
      setPending(toPending(state, true));
      const now = Date.now();
      // roll straight into the break; the reflection sheet sits on top of it
      setState({ ...state, phase: "break", plannedMs: (prof?.breakMin || 5) * MIN, startedAt: now, accumulatedMs: 0, runningSince: now, pomosDone: state.pomosDone + 1 });
    } else if (state.phase === "break") {
      chime("break");
      setState({ ...state, phase: "breakDone", runningSince: null, accumulatedMs: state.plannedMs });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, state, toPending]);

  // keep the tab title informative
  useEffect(() => {
    if (!state || state.phase === "breakDone") { document.title = "同窗"; return; }
    const left = state.plannedMs ? state.plannedMs - elapsed : elapsed;
    const s = Math.max(0, Math.floor(left / 1000));
    const t = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    document.title = `${state.phase === "break" ? "休息" : state.runningSince ? "专注" : "暂停"} ${t} · 同窗`;
  }, [state, elapsed]);

  const value: FocusCtx = {
    state, pending, elapsed,
    start({ mode, minutes, task, subjectId, withUser }) {
      const now = Date.now();
      const m = mode === "pomodoro" ? minutes || prof?.pomodoroMin || 25 : 0;
      setState({ phase: "focus", mode, plannedMs: m * MIN, task, subjectId, startedAt: now, accumulatedMs: 0, runningSince: now, pomosDone: state?.pomosDone || 0, withUser: withUser || null });
    },
    pause() { if (state?.runningSince) setState({ ...state, accumulatedMs: elapsedOf(state), runningSince: null }); },
    resume() { if (state && !state.runningSince && state.phase !== "breakDone") setState({ ...state, runningSince: Date.now() }); },
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
      const now = Date.now();
      setState((s) => s && { ...s, phase: "break", plannedMs: (prof?.breakMin || 5) * MIN, startedAt: now, accumulatedMs: 0, runningSince: now });
    },
    skipBreak() { setState((s) => s && { ...s, phase: "breakDone", runningSince: null }); },
    nextPomodoro() {
      const now = Date.now();
      setState((s) => s && { ...s, phase: "focus", plannedMs: (prof?.pomodoroMin || 25) * MIN, startedAt: now, accumulatedMs: 0, runningSince: now });
    },
    async saveReflection({ rating, note, task, subjectId, durationMs }) {
      if (!pending || !app.me) return;
      const p = pending;
      // you can record less than the timer measured (forgot to stop it), never more
      const d = Math.max(MIN, Math.min(p.durationMs, durationMs ?? p.durationMs));
      setPending(null);
      await app.addSession({ userId: app.me.id, subjectId, task, startedAt: p.startedAt, endedAt: p.endedAt - (p.durationMs - d), durationMs: d, mode: p.mode, rating, note, tz: prof?.tz || browserTz() });
    },
    dropReflection() { setPending(null); },
    setTask(task, subjectId) { setState((s) => s && { ...s, task, subjectId }); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
