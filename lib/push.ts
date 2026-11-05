"use client";
/**
 * v1.11 Web Push on this device: the service worker (public/sw.js) shows notifications that the
 * Edge Function `webpush` sends, so classmates' pokes, kudos and comments arrive even when the page is closed.
 * On iPhone this only works after “添加到主屏幕” (iOS 16.4+). Setup on the server: docs/web-push.md.
 */
import type { Backend } from "./backend/types";

/** public VAPID key, set at build time; empty = push is not configured for this deployment */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

/** this device's endpoint while push is on here (also tells the page not to show its own system notifications) */
const KEY = "tc-push-endpoint";

export type PushSupport =
  | "ok"
  /** iPhone / iPad Safari: has to be added to the home screen first */
  | "needs-home-screen"
  | "unsupported"
  /** the deployment has no VAPID key */
  | "not-configured";

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !isStandalone()) return "needs-home-screen";
  return has ? "ok" : "unsupported";
}

export function pushOnHere(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

function keyBytes(b64u: string) {
  const t = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function b64u(buf: ArrayBuffer | null) {
  if (!buf) return "";
  let s = "";
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); } catch { return null; }
}

/** ask for permission (must run from a tap) and register this device with the server */
export async function enablePush(backend: Backend): Promise<void> {
  const support = pushSupport();
  if (support === "needs-home-screen") throw new Error("iPhone 上要先把同窗添加到主屏幕，再从主屏幕打开，才能开启推送");
  if (support !== "ok") throw new Error("这个浏览器不支持推送通知");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "通知权限被拒绝了，请在系统或浏览器的设置里允许同窗发通知" : "没有获得通知权限");
  const reg = (await registerServiceWorker()) || (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  await backend.savePushSubscription({
    endpoint: sub.endpoint, p256dh: b64u(sub.getKey("p256dh")), auth: b64u(sub.getKey("auth")), ua: navigator.userAgent.slice(0, 200),
  });
  try { localStorage.setItem(KEY, sub.endpoint); } catch { /* */ }
}

/** stop pushes to this device (also used on sign-out, while still signed in) */
export async function disablePush(backend: Backend): Promise<void> {
  let endpoint: string | null = null;
  try { endpoint = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch { /* */ }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { endpoint = endpoint || sub.endpoint; await sub.unsubscribe(); }
  } catch { /* */ }
  if (endpoint) await backend.deletePushSubscription(endpoint).catch(() => { /* row may already be gone */ });
}

/** after an update or on a new page load: re-send the subscription in case the browser rotated its keys */
export async function refreshPush(backend: Backend): Promise<void> {
  if (!pushOnHere() || pushSupport() !== "ok" || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) { localStorage.removeItem(KEY); return; }
    await backend.savePushSubscription({ endpoint: sub.endpoint, p256dh: b64u(sub.getKey("p256dh")), auth: b64u(sub.getKey("auth")), ua: navigator.userAgent.slice(0, 200) });
    localStorage.setItem(KEY, sub.endpoint);
  } catch { /* try again next time */ }
}
