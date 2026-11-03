"use client";
/** Small Web Audio toolkit: a soft chime and generated ambient beds (no audio files). */

let ctx: AudioContext | null = null;
function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

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

export type Ambient = "off" | "rain" | "brown" | "waves";
export const ambientLabel: Record<Ambient, string> = { off: "静音", rain: "雨声", brown: "棕噪音", waves: "海浪" };

let bed: { stop: () => void; gain: GainNode } | null = null;

function noiseBuffer(a: AudioContext, brown: boolean) {
  const len = a.sampleRate * 4;
  const buf = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
  }
  return buf;
}

export function setAmbient(kind: Ambient, volume = 0.5) {
  if (bed) { bed.stop(); bed = null; }
  if (kind === "off") return;
  try {
    const a = ac();
    const master = a.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(volume, a.currentTime + 1.5);
    master.connect(a.destination);
    const src = a.createBufferSource();
    src.buffer = noiseBuffer(a, kind !== "rain");
    src.loop = true;
    const stops: (() => void)[] = [];
    if (kind === "rain") {
      const hp = a.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
      const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7000;
      const g = a.createGain(); g.gain.value = 0.35;
      src.connect(hp).connect(lp).connect(g).connect(master);
      // droplets
      const t = setInterval(() => {
        const o = a.createOscillator(), dg = a.createGain();
        o.frequency.value = 1800 + Math.random() * 2600; o.type = "sine";
        const s = a.currentTime;
        dg.gain.setValueAtTime(0.025 * Math.random(), s);
        dg.gain.exponentialRampToValueAtTime(0.0001, s + 0.05);
        o.connect(dg).connect(master); o.start(s); o.stop(s + 0.06);
      }, 70);
      stops.push(() => clearInterval(t));
    } else if (kind === "brown") {
      const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
      src.connect(lp).connect(master);
    } else {
      const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100;
      const swell = a.createGain(); swell.gain.value = 0.5;
      const lfo = a.createOscillator(); lfo.frequency.value = 0.09;
      const lfoAmt = a.createGain(); lfoAmt.gain.value = 0.45;
      lfo.connect(lfoAmt).connect(swell.gain);
      src.connect(lp).connect(swell).connect(master);
      lfo.start();
      stops.push(() => lfo.stop());
    }
    src.start();
    bed = {
      gain: master,
      stop: () => {
        const now = a.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + 0.4);
        setTimeout(() => { try { src.stop(); } catch { /* */ } stops.forEach((f) => f()); master.disconnect(); }, 500);
      },
    };
  } catch { /* audio unavailable */ }
}

export function setAmbientVolume(v: number) {
  if (bed) bed.gain.gain.setTargetAtTime(v, ac().currentTime, 0.1);
}
