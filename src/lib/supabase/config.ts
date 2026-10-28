// NEXT_PUBLIC_* values are inlined at build time, so these are safe in client code.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Cloud mode (real auth + Postgres) is on only when both values are present. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/tasks",
  "/planner",
  "/calendar",
  "/focus",
  "/analytics",
  "/goals",
  "/settings",
  "/onboarding",
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Only allow same-site relative redirects (prevents open redirects via ?next=).
 * The value is parsed exactly as a browser would (which strips tabs/newlines and
 * treats "\" like "/"), and must resolve to our own origin.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "https://fixmyday.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
