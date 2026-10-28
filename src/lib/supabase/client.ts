"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
