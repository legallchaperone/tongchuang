"use client";
/**
 * Ambient mixer built on real field recordings (public/sounds, see CREDITS.md there).
 * Each sound plays through two <audio> elements that cross-fade at the loop point, so there is no gap,
 * and every volume goes through Web Audio gain nodes (iOS ignores HTMLMediaElement.volume).
 */

export type SoundId = "rain" | "coffee-shop" | "fireplace" | "stream" | "summer-night" | "waves" | "birds";

export const SOUNDS: { id: SoundId; name: string; credit: string; license: string; url: string }[] = [
  { id: "rain", name: "雨声", credit: "alex36917（Porrumentzio 剪辑）", license: "CC BY 4.0", url: "https://freesound.org/people/alex36917/sounds/524605/" },
  { id: "coffee-shop", name: "咖啡馆", credit: "stephan", license: "公有领域", url: "https://soundbible.com/1664-Restaurant-Ambiance.html" },
  { id: "fireplace", name: "壁炉", credit: "ezwa", license: "公有领域", url: "https://soundbible.com/1543-Fireplace.html" },
  { id: "stream", name: "溪流", credit: "gluckose", license: "CC0", url: "https://freesound.org/people/gluckose/sounds/333987/" },
  { id: "summer-night", name: "夏夜虫鸣", credit: "Lisa Redfern", license: "公有领域", url: "https://soundbible.com/2083-Crickets-Chirping-At-Night.html" },
  { id: "waves", name: "海浪", credit: "Luftrum（Porrumentzio 剪辑）", license: "CC BY 4.0", url: "https://freesound.org/people/Luftrum/sounds/48412/" },
  { id: "birds", name: "鸟鸣", credit: "kvgarlic（Porrumentzio 剪辑）", license: "CC0", url: "https://freesound.org/people/kvgarlic/sounds/156826/" },
];

export interface MixState { master: number; muted: boolean; levels: Partial<Record<SoundId, number>> }
const KEY = "tc-mix-v1";
export const DEFAULT_MIX: MixState = { master: 0.7, muted: false, levels: {} };
export function loadMix(): MixState {
  try { return { ...DEFAULT_MIX, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULT_MIX; }
}
export function saveMix(m: MixState) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage unavailable */ } }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** AAC for Safari/Chrome/Edge, Opus for browsers without AAC (e.g. Firefox and Chromium on Linux) */
let ext: string | null = null;
function fileExt() {
  if (ext) return ext;
  const a = document.createElement("audio");
  ext = a.canPlayType('audio/mp4; codecs="mp4a.40.2"') ? "m4a" : "ogg";
  return ext;
}

const FADE = 2.5; // seconds of cross-fade at the loop point

class Channel {
  private els: HTMLAudioElement[] = [];
  private gains: GainNode[] = [];
  private out: GainNode;
  private active = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  playing = false;

  constructor(id: SoundId) {
    const a = ac();
    this.out = a.createGain();
    this.out.gain.value = 0;
    this.out.connect(master!);
    for (let i = 0; i < 2; i++) {
      const el = new Audio(`/sounds/${id}.${fileExt()}`);
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      const g = a.createGain();
      g.gain.value = i === 0 ? 1 : 0;
      a.createMediaElementSource(el).connect(g).connect(this.out);
      this.els.push(el); this.gains.push(g);
    }
  }

  setLevel(v: number) {
    const a = ac();
    this.out.gain.cancelScheduledValues(a.currentTime);
    this.out.gain.setTargetAtTime(v * v, a.currentTime, 0.15); // squared: sliders feel linear to the ear
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    const el = this.els[this.active];
    el.play().catch(() => { this.playing = false; });
    this.timer = setInterval(() => this.tick(), 200);
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.els.forEach((e) => e.pause());
  }

  private tick() {
    const cur = this.els[this.active];
    if (!cur.duration || !isFinite(cur.duration)) return;
    if (cur.duration - cur.currentTime > FADE) return;
    const a = ac(), t = a.currentTime;
    const nextI = 1 - this.active, next = this.els[nextI];
    next.currentTime = 0;
    next.play().catch(() => {});
    this.gains[nextI].gain.cancelScheduledValues(t);
    this.gains[nextI].gain.setValueAtTime(0, t);
    this.gains[nextI].gain.linearRampToValueAtTime(1, t + FADE);
    this.gains[this.active].gain.cancelScheduledValues(t);
    this.gains[this.active].gain.setValueAtTime(1, t);
    this.gains[this.active].gain.linearRampToValueAtTime(0, t + FADE);
    const old = cur;
    setTimeout(() => { if (this.playing) old.pause(); }, FADE * 1000 + 200);
    this.active = nextI;
  }
}

const channels = new Map<SoundId, Channel>();

/** apply a whole mix: starts what is turned up, stops what is at zero. Call from a click the first time (autoplay rules). */
export function applyMix(m: MixState) {
  const a = ac();
  master!.gain.setTargetAtTime(m.muted ? 0 : m.master * m.master, a.currentTime, 0.1);
  for (const s of SOUNDS) {
    const lvl = m.levels[s.id] || 0;
    let ch = channels.get(s.id);
    if (lvl > 0) {
      if (!ch) { ch = new Channel(s.id); channels.set(s.id, ch); }
      ch.setLevel(lvl);
      ch.start();
    } else if (ch?.playing) {
      ch.setLevel(0);
      const c = ch;
      setTimeout(() => { if (!(m.levels[s.id] || 0)) c.stop(); }, 500);
    }
  }
}

export function stopAll() {
  channels.forEach((c) => c.stop());
}

/** soft chime for the end of a pomodoro or a break */
export function chime(kind: "done" | "break" = "done") {
  try {
    const a = ac();
    const notes = kind === "done" ? [659.25, 783.99, 1046.5] : [523.25, 659.25];
    notes.forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = f;
      const t = a.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g).connect(a.destination);
      o.start(t); o.stop(t + 1.7);
    });
  } catch { /* audio unavailable */ }
}
