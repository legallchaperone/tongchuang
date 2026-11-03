import changelog from "./changelog.json";

export interface ChangelogEntry { version: string; date: string; title: string; items: string[]; migration?: boolean }
export const CHANGELOG = changelog as ChangelogEntry[];
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || CHANGELOG[0].version;
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

/** -1 / 0 / 1 for semantic versions like 1.2.3 */
export function cmpVersion(a: string, b: string) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

const SEEN_KEY = "tc-seen-version";
export function lastSeenVersion(): string | null { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } }
export function markVersionSeen(v = APP_VERSION) { try { localStorage.setItem(SEEN_KEY, v); } catch { /* storage unavailable */ } }
