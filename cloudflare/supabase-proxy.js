/**
 * Cloudflare Worker: forwards everything (REST, Auth, Realtime WebSocket) to your Supabase project,
 * so the site only ever talks to your own domain (e.g. https://api.cwx.world).
 *
 * Setup: Cloudflare dashboard → Workers & Pages → Create → Hello World → Edit code,
 * paste this file, change SUPABASE below to your project URL, Deploy,
 * then Settings → Domains & Routes → Add custom domain → api.cwx.world.
 */
const SUPABASE = "https://YOUR-PROJECT-ID.supabase.co";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, SUPABASE);
    // Copying the request keeps method, headers and body; WebSocket upgrades pass through the same way.
    return fetch(new Request(target, request));
  },
};
