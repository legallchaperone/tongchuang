// Web Push with nothing but Web Crypto: message encryption (RFC 8291, aes128gcm) and VAPID (RFC 8292).
// Runs on Supabase Edge Functions (Deno) and on Node 20+ (used by the tests in supabase/tests/webpush.test.mjs).

const enc = new TextEncoder();

export function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64u(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

export interface PushTarget {
  endpoint: string;
  /** the browser's public key (base64url, uncompressed P-256 point) */
  p256dh: string;
  /** the browser's auth secret (base64url, 16 bytes) */
  auth: string;
}

/** encrypt one payload for one subscription (a single aes128gcm record) */
export async function encryptPayload(target: Pick<PushTarget, "p256dh" | "auth">, payload: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array> {
  const uaPublic = unb64u(target.p256dh);
  const authSecret = unb64u(target.auth);
  const eph = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));

  // RFC 8291 §3.4: mix the auth secret and both public keys into the input key material
  const prkKey = await hmac(authSecret, ecdhSecret);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  // RFC 8188: content encryption key and nonce
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(payload, new Uint8Array([2])); // 0x02 = last (and only) record, no padding
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export interface Vapid {
  /** base64url, uncompressed P-256 point (65 bytes) — the same value the browser subscribes with */
  publicKey: string;
  /** base64url, the 32-byte private scalar */
  privateKey: string;
  /** "mailto:you@example.com" or an https URL */
  subject: string;
}

/** `Authorization` header value for one push service origin */
export async function vapidAuthorization(endpoint: string, v: Vapid, now = Date.now()): Promise<string> {
  const pub = unb64u(v.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID public key must be an uncompressed P-256 point");
  const jwk = { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: v.privateKey, ext: true };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: v.subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${v.publicKey}`;
}

export interface SendResult {
  endpoint: string;
  status: number;
  /** the push service says this subscription is gone: delete it */
  gone: boolean;
}

/** send one notification; never throws for HTTP errors, only reports them */
export async function sendPush(target: PushTarget, message: unknown, v: Vapid, opts: { ttl?: number; urgency?: "normal" | "high"; topic?: string } = {}, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const body = await encryptPayload(target, enc.encode(JSON.stringify(message)));
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    TTL: String(opts.ttl ?? 24 * 3600),
    Urgency: opts.urgency ?? "normal",
    Authorization: await vapidAuthorization(target.endpoint, v),
  };
  // Topic replaces an undelivered message with the same topic (≤ 32 URL-safe characters)
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  try {
    const res = await fetchImpl(target.endpoint, { method: "POST", headers, body });
    return { endpoint: target.endpoint, status: res.status, gone: res.status === 404 || res.status === 410 };
  } catch {
    return { endpoint: target.endpoint, status: 0, gone: false };
  }
}
