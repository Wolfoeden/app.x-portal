import { NextResponse } from "next/server";

import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { resolveOpenAiConnection } from "@/lib/openai/provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const traceId = crypto.randomUUID();
  const deep = new URL(request.url).searchParams.get("deep") === "1";

  try {
    const { url, publishableKey } = getSupabasePublicEnv();
    const openAi = resolveOpenAiConnection();
    if (deep) {
      const upstream = await fetch(`${url}/auth/v1/health`, {
        cache: "no-store",
        headers: { apikey: publishableKey },
        signal: AbortSignal.timeout(3_000),
      });
      if (!upstream.ok) throw new Error("Supabase Auth health check failed");
    }

    return NextResponse.json(
      {
        status: "ok",
        traceId,
        checks: {
          application: true,
          supabaseConfigured: true,
          supabaseReachable: deep ? true : null,
          openAiConfigured: openAi.configured,
          openAiTransport: openAi.transport,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", traceId },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
