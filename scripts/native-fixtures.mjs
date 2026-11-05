// Golden fixtures for the native Mac app, generated from the web app's TypeScript (the source of truth).
//
//   node scripts/native-fixtures.mjs          -> rewrite design/fixtures/** and design/pixel/*.json
//   node scripts/native-fixtures.mjs --check  -> fail if the committed files are out of date
//
// Logic fixtures run lib/time.ts, lib/stats.ts and lib/review.ts in Node (full ICU time zone data).
// Pixel fixtures render lib/pixel.ts drawScene() into a real <canvas> in headless Chromium (Playwright)
// and store the RGBA bytes; the same scenes are also drawn with scripts/native-fixtures/buf-ctx.mjs,
// the integer blending model the Swift port implements, and the script stops if the two disagree.
// lib/*.ts are read but never changed.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadLib, ROOT, transpile } from "./native-fixtures/load-lib.mjs";
import { BufCtx } from "./native-fixtures/buf-ctx.mjs";

const CHECK = process.argv.includes("--check");
const out = new Map(); // relative path -> text

const { modules, cleanup } = await loadLib(["time", "stats", "review", "pixel"]);
const T = modules.time, S = modules.stats, R = modules.review, P = modules.pixel;

/* ───────────────────────── logic ───────────────────────── */
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const utc = (s) => Date.parse(s); // ISO with Z or offset

const ZONES = [
  "America/New_York", "Asia/Shanghai", "Europe/London", "UTC", "Asia/Kolkata", "Australia/Lord_Howe",
  "Pacific/Chatham", "America/St_Johns", "Pacific/Auckland", "America/Santiago", "Not/AZone",
];
const INSTANTS = [
  // America/New_York spring forward 2026-03-08 07:00Z (02:00 -> 03:00), fall back 2026-11-01 06:00Z (02:00 -> 01:00)
  "2026-03-08T06:59:59Z", "2026-03-08T07:00:00Z", "2026-03-08T07:30:00Z", "2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z",
  // Europe/London 2026-03-29 01:00Z, 2026-10-25 01:00Z
  "2026-03-29T00:59:00Z", "2026-03-29T01:00:00Z", "2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z",
  // Shanghai midnight and the 05:00 rollover
  "2026-11-04T15:59:59Z", "2026-11-04T16:00:00Z", "2026-11-04T20:59:00Z", "2026-11-04T21:00:00Z",
  // Santiago skips 00:00 on 2026-09-06 (04:00Z); Lord Howe shifts by 30 minutes
  "2026-09-06T03:59:00Z", "2026-09-06T04:00:00Z", "2026-10-03T15:00:00Z", "2026-10-03T15:30:00Z",
  // leap day, new year, odd milliseconds
  "2028-02-29T12:00:00.999Z", "2026-12-31T23:59:59.500Z", "2027-01-01T00:00:00Z", "2026-11-05T09:41:07.123Z",
].map(utc);

const offsetMin = [], dayKey = [], startOfDay = [], partsIn = [], workDay = [], hhmm = [];
for (const tz of ZONES) for (const ms of INSTANTS) {
  offsetMin.push({ tz, ms, expected: T.offsetMin(tz, ms) });
  dayKey.push({ tz, ms, expected: T.dayKey(ms, tz) });
  startOfDay.push({ tz, ms, expected: T.startOfDay(ms, tz) });
  partsIn.push({ tz, ms, expected: T.partsIn(ms, tz) });
  workDay.push({ tz, ms, expected: R.workDay(ms, tz) });
  hhmm.push({ tz, ms, expected: T.hhmm(ms, tz) });
}
// the 05:00 rollover, minute by minute around it, in several zones
for (const tz of ["Asia/Shanghai", "America/New_York", "Europe/London", "Asia/Kolkata"]) {
  for (const [h, mi] of [[0, 0], [0, 1], [4, 59], [5, 0], [5, 1], [23, 59]]) {
    const ms = T.zonedToUtc(2026, 11, 5, h, mi, tz) + 30_000;
    workDay.push({ tz, ms, expected: R.workDay(ms, tz) });
  }
}

const WALL = [
  [2026, 3, 8, 1, 59], [2026, 3, 8, 2, 30], [2026, 3, 8, 3, 0], [2026, 11, 1, 0, 59], [2026, 11, 1, 1, 30], [2026, 11, 1, 2, 0],
  [2026, 3, 29, 0, 30], [2026, 3, 29, 1, 30], [2026, 10, 25, 1, 30], [2026, 9, 6, 0, 0], [2026, 9, 6, 0, 30],
  [2026, 11, 5, 0, 0], [2026, 11, 5, 5, 0], [2026, 12, 31, 23, 59], [2027, 1, 1, 0, 0], [2028, 2, 29, 12, 0],
  // out-of-range fields roll over like Date.UTC
  [2026, 13, 1, 0, 0], [2026, 2, 30, 0, 0], [2026, 1, 0, 0, 0], [2026, 11, 5, 24, 0], [2026, 11, 5, 10, 75],
];
const zonedToUtc = [];
for (const tz of ZONES) for (const [y, mo, d, h, mi] of WALL) zonedToUtc.push({ tz, y, mo, d, h, mi, expected: T.zonedToUtc(y, mo, d, h, mi, tz) });

const addDaysKey = [];
for (const [k, n] of [["2026-11-05", 1], ["2026-11-05", -5], ["2026-12-31", 1], ["2027-01-01", -1], ["2028-02-28", 1], ["2028-02-29", 1], ["2026-02-28", 1], ["2026-03-01", -1], ["2026-11-05", 400], ["2026-11-05", 0]]) {
  addDaysKey.push({ key: k, n, expected: T.addDaysKey(k, n) });
}
const weekdayOfKey = ["2026-11-05", "2026-11-08", "2027-01-01", "2028-02-29"].map((key) => ({ key, expected: T.weekdayOfKey(key) }));
const lastDays = [];
for (const tz of ["Asia/Shanghai", "America/New_York", "Pacific/Auckland"]) for (const ms of [utc("2026-11-05T03:00:00Z"), utc("2026-03-01T12:00:00Z")]) {
  lastDays.push({ tz, now: ms, n: 7, expected: T.lastDays(7, tz, ms) });
}
const phaseAt = [0, 4, 4.99, 5, 7.99, 8, 12, 16.99, 17, 19.99, 20, 23.5].map((hour) => ({ hour, expected: T.phaseAt(hour) }));

/* sessions */
let sid = 0;
const ses = (userId, startIso, endIso, durationMs, extra = {}) => ({
  id: `s${++sid}`, userId, subjectId: extra.subjectId ?? null, task: extra.task ?? "", startedAt: utc(startIso), endedAt: utc(endIso),
  durationMs, mode: extra.mode ?? "pomodoro", rating: extra.rating ?? null, note: "", tz: extra.tz ?? "UTC",
});
const SESSIONS = [
  ses("u1", "2026-11-04T01:00:00Z", "2026-11-04T01:25:00Z", 25 * MIN, { rating: 4, subjectId: "math" }),
  // crosses Shanghai midnight (16:00Z) with a pause
  ses("u1", "2026-11-04T15:30:00Z", "2026-11-04T16:45:00Z", 60 * MIN, { rating: 5, subjectId: "eng" }),
  // crosses New York midnight on the spring-forward day and the next
  ses("u1", "2026-03-08T04:30:00Z", "2026-03-08T05:20:00Z", 50 * MIN, { subjectId: "math" }),
  ses("u1", "2026-03-09T03:40:00Z", "2026-03-09T04:10:00Z", 30 * MIN),
  // fall-back day (25 hours long in New York)
  ses("u1", "2026-11-01T03:50:00Z", "2026-11-01T04:20:00Z", 29 * MIN, { rating: 3 }),
  ses("u1", "2026-11-02T04:30:00Z", "2026-11-02T05:30:00Z", 55 * MIN),
  // London spring forward night
  ses("u1", "2026-03-28T23:30:00Z", "2026-03-29T01:30:00Z", 100 * MIN, { rating: 2 }),
  // three days long (spans two midnights everywhere)
  ses("u1", "2026-10-20T10:00:00Z", "2026-10-22T14:00:00Z", 30 * HOUR),
  // zero length and backwards
  ses("u1", "2026-11-03T12:00:00Z", "2026-11-03T12:00:00Z", 0),
  ses("u1", "2026-11-03T13:00:00Z", "2026-11-03T12:30:00Z", 10 * MIN),
  // Santiago skipped midnight
  ses("u1", "2026-09-06T03:30:00Z", "2026-09-06T04:30:00Z", 60 * MIN),
  // consecutive days for streaks
  ses("u1", "2026-10-28T02:00:00Z", "2026-10-28T02:20:00Z", 20 * MIN),
  ses("u1", "2026-10-29T02:00:00Z", "2026-10-29T02:30:00Z", 30 * MIN),
  ses("u1", "2026-10-30T02:00:00Z", "2026-10-30T02:10:00Z", 10 * MIN),
  ses("u1", "2026-10-31T02:00:00Z", "2026-10-31T03:00:00Z", 60 * MIN, { rating: 1 }),
  ses("u1", "2026-11-05T00:30:00Z", "2026-11-05T01:30:00Z", 45 * MIN, { rating: 4 }),
  ses("u2", "2026-11-05T00:00:00Z", "2026-11-05T02:00:00Z", 120 * MIN),
];
const LOGIC_TZS = ["Asia/Shanghai", "America/New_York", "Europe/London", "UTC", "America/Santiago", "Asia/Kolkata"];

const dayShares = [];
for (const tz of LOGIC_TZS) SESSIONS.forEach((s, session) => { if (s.userId === "u1") dayShares.push({ tz, session, expected: S.dayShares(s, tz) }); });

const pairs = (m) => Array.from(m.entries());
const u1 = SESSIONS.filter((s) => s.userId === "u1");
// byDay over the sessions of user u1
const byDay = LOGIC_TZS.map((tz) => ({ tz, expected: pairs(S.byDay(u1, tz)) }));

const NOWS = ["2026-11-05T03:00:00Z", "2026-11-05T20:30:00Z", "2026-11-01T12:00:00Z", "2026-10-31T23:00:00Z"].map(utc);
const streaks = [];
for (const tz of LOGIC_TZS) for (const now of NOWS) for (const minMs of [15 * MIN, 30 * MIN, 1]) {
  const daily = pairs(S.byDay(u1, tz));
  streaks.push({ tz, now, minMs, daily, expected: S.streaks(new Map(daily), tz, now, minMs) });
}

const LIVES = {
  none: undefined,
  focus: { userId: "u1", state: "focus", task: "背单词", subjectName: "", subjectColor: null, mode: "stopwatch", startedAt: utc("2026-11-04T20:10:00Z"), plannedEnd: null, accumulatedMs: 15 * MIN, runningSince: utc("2026-11-04T20:40:00Z"), updatedAt: utc("2026-11-04T20:40:00Z") },
  paused: { userId: "u1", state: "paused", task: "", subjectName: "", subjectColor: null, mode: "pomodoro", startedAt: utc("2026-11-04T20:10:00Z"), plannedEnd: null, accumulatedMs: 12 * MIN, runningSince: null, updatedAt: utc("2026-11-04T20:22:00Z") },
  breakLive: { userId: "u1", state: "break", task: "", subjectName: "", subjectColor: null, mode: "pomodoro", startedAt: utc("2026-11-04T20:10:00Z"), plannedEnd: utc("2026-11-04T20:40:00Z"), accumulatedMs: 25 * MIN, runningSince: null, updatedAt: utc("2026-11-04T20:35:00Z") },
  // running since before "now" -> clamps at zero
  future: { userId: "u1", state: "focus", task: "", subjectName: "", subjectColor: null, mode: "pomodoro", startedAt: utc("2026-11-04T21:10:00Z"), plannedEnd: null, accumulatedMs: 0, runningSince: utc("2026-11-04T21:10:00Z"), updatedAt: utc("2026-11-04T21:10:00Z") },
};
const LIVE_NOWS = ["2026-11-04T21:00:00Z", "2026-11-04T16:30:00Z", "2026-11-05T09:30:00Z"].map(utc);
const liveFocusMs = [], workDayMs = [], todayMs = [];
for (const [name, live] of Object.entries(LIVES)) for (const now of LIVE_NOWS) {
  liveFocusMs.push({ live: name, now, expected: S.liveFocusMs(live, now) });
  for (const tz of ["Asia/Shanghai", "America/New_York", "Europe/London"]) {
    workDayMs.push({ live: name, tz, now, userId: "u1", expected: R.workDayMs(SESSIONS, "u1", live, tz, now) });
    todayMs.push({ live: name, tz, now, userId: "u1", expected: S.todayMs(SESSIONS, "u1", live, tz, now) });
  }
}

const summarize = [];
for (const tz of LOGIC_TZS) for (const now of NOWS.slice(0, 2)) for (const n of [7, 30]) {
  const keys = T.lastDays(n, tz, now);
  // sessions = withLive(all sessions, "u1", lives.focus, tz, now)
  const withLiveSessions = S.withLive(SESSIONS, "u1", LIVES.focus, tz, now);
  summarize.push({ tz, now, live: "focus", userId: "u1", keys, goalMs: 30 * MIN, expected: S.summarize(withLiveSessions, tz, keys, 30 * MIN) });
}

const logic = {
  note: "Generated by scripts/native-fixtures.mjs from lib/time.ts, lib/stats.ts and lib/review.ts. Do not edit by hand.",
  icu: process.versions.icu, tzdata: process.versions.tz,
  sessions: SESSIONS, lives: Object.fromEntries(Object.entries(LIVES).filter(([, v]) => v)),
  offsetMin, zonedToUtc, dayKey, startOfDay, partsIn, workDay, hhmm, addDaysKey, weekdayOfKey, lastDays, phaseAt,
  dayShares, byDay, streaks, liveFocusMs, todayMs, workDayMs, summarize,
};
out.set("design/fixtures/logic.json", compact(logic));

/** one top-level key per line group, one array element per line: small diffs, still valid JSON */
function compact(o) {
  const parts = Object.entries(o).map(([k, v]) => Array.isArray(v)
    ? `  ${JSON.stringify(k)}: [\n${v.map((x) => "    " + JSON.stringify(x)).join(",\n")}\n  ]`
    : `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return "{\n" + parts.join(",\n") + "\n}\n";
}

/* ───────────────────────── pixel data ───────────────────────── */
const json = (v) => JSON.stringify(v, null, 2) + "\n";
const pixelNote = "Generated by scripts/native-fixtures.mjs from lib/pixel.ts. Do not edit by hand.";
out.set("design/pixel/palettes.json", json({
  note: pixelNote, SKINS: P.SKINS, HAIR_COLORS: P.HAIR_COLORS, HAIR_NAMES: P.HAIR_NAMES, SHIRTS: P.SHIRTS, OUTLINE: P.OUTLINE,
}));
out.set("design/pixel/sprites.json", json({
  note: pixelNote, HEAD: P.HEAD, TORSO_SIT: P.TORSO_SIT, BODY_STAND: P.BODY_STAND, HAIR_STYLES: P.HAIR_STYLES,
}));
out.set("design/pixel/scene.json", json({
  note: pixelNote, SCENE_W: P.SCENE_W, SCENE_H: P.SCENE_H, C: P.C, FLOW_STARS: P.FLOW_STARS, FLOW_STAR_MS: P.FLOW_STAR_MS,
}));

// the same data as Swift source for TCPixel (a test checks it against design/pixel/*.json)
{
  const sArr = (a) => "[" + a.map((x) => JSON.stringify(x)).join(", ") + "]";
  const sRows = (rows, ind = "        ") => "[\n" + rows.map((r) => `${ind}${JSON.stringify(r)},`).join("\n") + `\n${ind.slice(4)}]`;
  const swift = [
    "// Generated by scripts/native-fixtures.mjs from lib/pixel.ts. Do not edit by hand.",
    "// The same values are in design/pixel/*.json; PixelDataTests checks that the two agree.",
    "",
    "enum PixelData {",
    `    static let skins: [String] = ${sArr(P.SKINS)}`,
    `    static let hairColors: [String] = ${sArr(P.HAIR_COLORS)}`,
    `    static let hairNames: [String] = ${sArr(P.HAIR_NAMES)}`,
    `    static let shirts: [String] = ${sArr(P.SHIRTS)}`,
    `    static let outline: String = ${JSON.stringify(P.OUTLINE)}`,
    `    static let head: [String] = ${sRows(P.HEAD)}`,
    `    static let torsoSit: [String] = ${sRows(P.TORSO_SIT)}`,
    `    static let bodyStand: [String] = ${sRows(P.BODY_STAND)}`,
    "    static let hairStyles: [[String]] = [",
    ...P.HAIR_STYLES.map((s) => `        ${sRows(s, "            ")},`),
    "    ]",
    `    static let sceneW = ${P.SCENE_W}`,
    `    static let sceneH = ${P.SCENE_H}`,
    "    /// scene palette (`C` in lib/pixel.ts)",
    "    static let scene: [String: String] = [",
    ...Object.entries(P.C).map(([k, v]) => `        ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
    "    ]",
    `    static let flowStars: [(Int, Int)] = [${P.FLOW_STARS.map(([x, y]) => `(${x}, ${y})`).join(", ")}]`,
    `    static let flowStarMs: Double = ${P.FLOW_STAR_MS}`,
    "}",
    "",
  ].join("\n");
  out.set("native/Packages/TongchuangKit/Sources/TCPixel/PixelData.swift", swift);
}

/* ───────────────────────── pixel fixtures ───────────────────────── */
// components/Pixel.tsx seedOf() (not exported there): the per-person seed the desks use
function seedOf(id) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

const gridHex = (g) => g.map((row) => row.map((c) => c ?? null));
const looks = [
  { skin: 0, hair: 0, hairColor: 0 }, { skin: 1, hair: 1, hairColor: 3 }, { skin: 2, hair: 2, hairColor: 5 },
  { skin: 3, hair: 3, hairColor: 6 }, { skin: 4, hair: 4, hairColor: 7 }, { skin: -1, hair: 7, hairColor: 9.6 },
];
const characters = [];
for (const look of looks) for (const pose of ["sit", "stand"]) for (const blink of [false, true]) {
  const shirt = P.SHIRTS[characters.length % P.SHIRTS.length];
  characters.push({ look, shirt, pose, blink, expected: gridHex(P.character({ look, shirt, pose, blink })) });
}
const portraits = looks.map((look, i) => ({ look, shirt: P.SHIRTS[(i * 3) % 8], expected: gridHex(P.portrait(look, P.SHIRTS[(i * 3) % 8])) }));
const shade = [];
for (const hex of ["#2a78d6", "#f7d7b5", "#000000", "#ffffff", "#8a5228"]) for (const amt of [-0.35, -0.22, -0.18, -0.06, 0, 0.1, 0.18, 0.25]) shade.push({ hex, amt, expected: P.shade(hex, amt) });
const mix = [["#f7d7b5", "#f08a8a", 0.35], ["#6e4430", "#f08a8a", 0.35], ["#000000", "#ffffff", 0.5]].map(([a, b, t]) => ({ a, b, t, expected: P.mix(a, b, t) }));
const defaultLook = ["u1", "林舟", "a1b2c3d4-0000-4000-8000-000000000000", "", "x"].map((id) => ({ id, expected: P.defaultLook(id), seed: seedOf(id) }));
const rngSeq = [0, 1, 3, 7 * 123456 + 3, 4294967295, seedOf("林舟") * 7 + 3].map((seed) => { const r = P.rng(seed); return { seed, expected: Array.from({ length: 8 }, () => r()) }; });
out.set("design/fixtures/pixel-misc.json", compact({ note: pixelNote, characters, portraits, shade, mix, defaultLook, rng: rngSeq }));

const base = { look: looks[0], shirt: P.SHIRTS[0], state: "idle", hour: 10.5, minute: 30, phase: "day", frame: 0, seed: seedOf("u1"), present: true };
const sc = (name, o) => ({ name, opts: { ...base, ...o } });
const SCENES = [
  sc("day-focus", { state: "focus", frame: 3 }),
  sc("day-focus-frame5", { state: "focus", frame: 5, look: looks[1], shirt: P.SHIRTS[1], seed: seedOf("林舟") }),
  sc("day-focus-blink", { state: "focus", frame: 23, hour: 13.75, minute: 45 }),
  sc("dawn-paused", { state: "paused", hour: 6 + 20 / 60, minute: 20, phase: "dawn", look: looks[2], shirt: P.SHIRTS[2], frame: 7 }),
  sc("dusk-break", { state: "break", hour: 18 + 40 / 60, minute: 40, phase: "dusk", look: looks[3], shirt: P.SHIRTS[3], frame: 2 }),
  sc("dusk-break-frame8", { state: "break", hour: 19.1, minute: 6, phase: "dusk", look: looks[4], shirt: P.SHIRTS[4], frame: 8 }),
  sc("day-idle-present", { state: "idle", hour: 9, minute: 0 }),
  sc("night-idle-absent", { state: "idle", hour: 23 + 10 / 60, minute: 10, phase: "night", present: false, frame: 4 }),
  sc("night-idle-absent-frame6", { state: "idle", hour: 2.5, minute: 30, phase: "night", present: false, frame: 6, seed: 4294967295 }),
  sc("night-idle-present", { state: "idle", hour: 22, minute: 0, phase: "night", present: true, frame: 9, look: looks[5], shirt: P.SHIRTS[5] }),
  sc("night-focus", { state: "focus", hour: 23 + 10 / 60, minute: 10, phase: "night", frame: 1, look: looks[1], shirt: P.SHIRTS[6] }),
  sc("night-flow-2stars", { state: "focus", hour: 23.5, minute: 30, phase: "night", frame: 2, flowMs: 60 * MIN, look: looks[2], shirt: P.SHIRTS[7] }),
  sc("night-flow-8stars", { state: "focus", hour: 1.25, minute: 15, phase: "night", frame: 12, flowMs: 200 * MIN, look: looks[3], shirt: P.SHIRTS[0] }),
  sc("day-flow-boost", { state: "focus", hour: 15, minute: 0, phase: "day", frame: 15, flowMs: 90 * MIN, seed: seedOf("林舟") }),
  sc("day-sleeping", { state: "idle", sleeping: true, hour: 14, minute: 5, frame: 3, look: looks[4], shirt: P.SHIRTS[4] }),
  sc("night-sleeping", { state: "idle", sleeping: true, hour: 3, minute: 0, phase: "night", frame: 10, present: false }),
  sc("night-closed", { state: "idle", closed: true, hour: 23.9, minute: 54, phase: "night", frame: 0, look: looks[1], shirt: P.SHIRTS[1] }),
  sc("day-closed", { state: "idle", closed: true, hour: 11, minute: 0, phase: "day" }),
  sc("dusk-closed-sleeping", { state: "idle", closed: true, sleeping: true, hour: 19.5, minute: 30, phase: "dusk", frame: 5 }),
  sc("day-rain-focus", { state: "focus", rain: true, hour: 12, minute: 0, frame: 17, look: looks[2], shirt: P.SHIRTS[2] }),
  sc("night-rain-idle", { state: "idle", rain: true, hour: 21, minute: 15, phase: "night", present: false, frame: 31 }),
  sc("dawn-focus-bigframe", { state: "focus", hour: 5.1, minute: 6, phase: "dawn", frame: 100003, seed: 0, look: looks[5], shirt: P.SHIRTS[6] }),
];

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch { playwright = require("/opt/node-tools/node_modules/playwright"); }
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body></body></html>");
await page.addScriptTag({ type: "module", content: transpile("pixel") + "\nwindow.PX = { drawScene, SCENE_W, SCENE_H };\n" });
await page.waitForFunction(() => !!window.PX);
const browserVersion = browser.version();

let modelDiffs = 0, translucentTotal = 0;
const sceneFiles = [];
for (const [i, s] of SCENES.entries()) {
  const b64 = await page.evaluate((o) => {
    const c = document.createElement("canvas"); c.width = window.PX.SCENE_W; c.height = window.PX.SCENE_H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    window.PX.drawScene(ctx, o);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let bin = ""; for (let k = 0; k < d.length; k++) bin += String.fromCharCode(d[k]);
    return btoa(bin);
  }, s.opts);
  const chrome = Buffer.from(b64, "base64");
  const model = new BufCtx(P.SCENE_W, P.SCENE_H);
  P.drawScene(model, s.opts);
  let diff = 0;
  for (let k = 0; k < chrome.length; k++) if (chrome[k] !== model.data[k]) diff++;
  modelDiffs += diff;
  const translucent = model.mask.reduce((a, v) => a + v, 0);
  translucentTotal += translucent;
  const file = `design/fixtures/pixel/${String(i + 1).padStart(2, "0")}-${s.name}.json`;
  sceneFiles.push(file.split("/").pop());
  out.set(file, JSON.stringify({
    note: pixelNote, name: s.name, width: P.SCENE_W, height: P.SCENE_H, opts: s.opts,
    rgba: chrome.toString("base64"),
    // 1 bit per pixel, row-major, LSB first: the pixel's final value came from a translucent fill
    translucentMask: Buffer.from(packBits(model.mask)).toString("base64"),
  }) + "\n");
  if (diff) console.error(`  ${s.name}: model differs from Chromium in ${diff} bytes`);
}
await browser.close();
cleanup();
out.set("design/fixtures/pixel/index.json", json({ note: pixelNote, chromium: browserVersion, scenes: sceneFiles }));

function packBits(mask) {
  const bytes = new Uint8Array(Math.ceil(mask.length / 8));
  mask.forEach((v, i) => { if (v) bytes[i >> 3] |= 1 << (i & 7); });
  return bytes;
}

/* ───────────────────────── write / check ───────────────────────── */
if (modelDiffs) { console.error(`buffer model disagrees with Chromium (${modelDiffs} bytes); fix scripts/native-fixtures/buf-ctx.mjs first`); process.exit(1); }
let stale = 0;
if (CHECK) {
  // the Chromium version is informational only
  const norm = (p, t) => (p.endsWith("index.json") ? t.replace(/"chromium": "[^"]*"/, "") : t);
  for (const [p, text] of out) {
    let cur = ""; try { cur = readFileSync(new URL(p, ROOT), "utf8"); } catch {}
    if (norm(p, cur) !== norm(p, text)) { console.error(`out of date: ${p}`); stale++; }
  }
  process.exit(stale ? 1 : 0);
}
rmSync(new URL("design/fixtures/pixel/", ROOT), { recursive: true, force: true });
for (const [p, text] of out) {
  const url = new URL(p, ROOT);
  mkdirSync(new URL(".", url), { recursive: true });
  writeFileSync(url, text);
}
console.log(`wrote ${out.size} files; ${SCENES.length} scenes, Chromium ${browserVersion}; model matches Chromium byte for byte; ${translucentTotal} pixels come from translucent fills`);
