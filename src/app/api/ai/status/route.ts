import { NextResponse } from "next/server";
import { connection } from "next/server";
import { describeAIProvider } from "@/lib/ai/provider";

/** Reports whether an AI provider is configured (never exposes keys). */
export async function GET() {
  await connection();
  const provider = describeAIProvider();
  return NextResponse.json(
    { configured: provider !== null, provider: provider?.name ?? null, model: provider?.model ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
