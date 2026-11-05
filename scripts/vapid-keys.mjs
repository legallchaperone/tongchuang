// Generates the keys Web Push needs (see docs/web-push.md). Run once: node scripts/vapid-keys.mjs
// Prints a public key (goes to Vercel), a private key and a shared secret (go to Supabase). Keep the last two secret.
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
const secret = b64u(crypto.getRandomValues(new Uint8Array(24)));
console.log(`# Vercel → Settings → Environment Variables
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${b64u(pub)}

# Supabase → Edge Functions → Secrets
VAPID_PUBLIC_KEY=${b64u(pub)}
VAPID_PRIVATE_KEY=${d}
VAPID_SUBJECT=mailto:你的邮箱
PUSH_SECRET=${secret}

# Supabase → SQL Editor（把 <project-ref> 换成你的项目编号）
insert into public.push_config(function_url, secret)
values ('https://<project-ref>.supabase.co/functions/v1/webpush', '${secret}')
on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;`);
