import { NextResponse, type NextRequest } from "next/server";
import { getAIProvider } from "@/lib/ai/provider";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { MAX_BRAIN_DUMP_CHARS, brainDumpRequestSchema } from "@/lib/brain-dump/schema";
import { runBrainDump } from "@/lib/brain-dump/service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/server";

const perMinute = createRateLimiter({ limit: 6, windowMs: 60_000 });
const perDay = createRateLimiter({ limit: 100, windowMs: 86_400_000 });

/** In demo mode (no auth) AI calls are only allowed locally unless explicitly enabled. */
function anonymousAIAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AI_ALLOW_ANONYMOUS === "true";
}

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BRAIN_DUMP_CHARS * 4 + 1000) {
    return NextResponse.json({ error: "That brain dump is too long." }, { status: 413 });
  }

  let rateKey: string;
  if (isSupabaseConfigured) {
    try {
      const { user } = await requireUser();
      rateKey = `user:${user.id}`;
    } catch {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }
  } else {
    rateKey = `ip:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"}`;
  }

  const body = await request.json().catch(() => null);
  const parsed = brainDumpRequestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message ?? "Invalid request." }, { status: 400 });
  }

  let provider = getAIProvider();
  if (provider && !isSupabaseConfigured && !anonymousAIAllowed()) provider = null;

  if (provider) {
    for (const limiter of [perMinute, perDay]) {
      const verdict = limiter.check(rateKey);
      if (!verdict.ok) {
        return NextResponse.json(
          { error: `You're sending brain dumps quickly. Try again in ${verdict.retryAfterSec}s.` },
          { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } },
        );
      }
    }
  }

  const result = await runBrainDump(parsed.data, provider);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
