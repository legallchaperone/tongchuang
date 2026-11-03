import type { Backend } from "./types";
import { createDemoBackend } from "./demo";
import { createSupabaseBackend } from "./supabase";

let instance: Backend | null = null;

export function getBackend(): Backend {
  if (instance) return instance;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  instance = url && key ? createSupabaseBackend(url, key) : createDemoBackend();
  return instance;
}

/** which config pieces are present (for a clear message when the site falls back to the demo) */
export const configStatus = () => ({
  url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
});
