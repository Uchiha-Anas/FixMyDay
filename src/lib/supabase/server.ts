import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

export async function createServerSupabase(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a context that can't set cookies; the proxy refreshes sessions instead.
        }
      },
    },
  });
}

export class UnauthorizedError extends Error {
  constructor() {
    super("You need to sign in to do that.");
    this.name = "UnauthorizedError";
  }
}

/**
 * Resolve the signed-in user from the session cookie, verified with the
 * Supabase Auth server (getUser, not getSession). Never trust a user id sent
 * by the browser.
 */
export async function requireUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new UnauthorizedError();
  return { supabase, user: data.user };
}
