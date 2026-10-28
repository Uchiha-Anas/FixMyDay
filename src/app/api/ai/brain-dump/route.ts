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

const MAX_BODY_BYTES = MAX_BRAIN_DUMP_CHARS * 4 + 1000;

/** Read the body but stop as soon as it exceeds the limit (Content-Length can be absent or wrong). */
async function readJsonLimited(request: NextRequest): Promise<unknown | "too_large"> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return "too_large";
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Client IP for anonymous rate limiting. Vercel overwrites x-forwarded-for and sets
 * x-real-ip itself; behind other proxies make sure they do the same, since a client
 * can otherwise send its own header to dodge the limit.
 */
function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

export async function POST(request: NextRequest) {
  const body = await readJsonLimited(request);
  if (body === "too_large") {
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
    rateKey = `ip:${clientIp(request)}`;
  }

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
