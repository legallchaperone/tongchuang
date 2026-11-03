import type { Backend } from "./types";
import { createDemoBackend } from "./demo";
import { createSupabaseBackend } from "./supabase";

let instance: Backend | null = null;

export function getBackend(): Backend {
  if (instance) return instance;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  instance = url && key ? createSupabaseBackend(url, key) : createDemoBackend();
  return instance;
}
