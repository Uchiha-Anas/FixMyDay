import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured, safeNextPath } from "@/lib/supabase/config";

/** Handles email confirmation and password-recovery links (PKCE code exchange). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!isSupabaseConfigured || !code) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=link", origin));
  return NextResponse.redirect(new URL(next, origin));
}
