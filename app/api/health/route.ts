import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { resolveOpenAiConnection } from "@/lib/openai/provider";

export const dynamic = "force-dynamic";

/**
 * Der Tiefen-Check löst einen Aufruf an Supabase aus und verrät in der
 * Antwort, wie der KI-Provider angebunden ist. Beides gehört nicht in eine
 * öffentliche Route: Das eine ist ein kostenloser Verstärker für Last, das
 * andere Aufklärung über die Infrastruktur.
 *
 * Ohne gesetztes `HEALTH_CHECK_TOKEN` bleibt der Tiefen-Check verschlossen —
 * fail closed statt „wenn kein Token konfiguriert ist, darf jeder“.
 */
function deepCheckAllowed(request: Request): boolean {
  const expected = process.env.HEALTH_CHECK_TOKEN?.trim();
  if (!expected || expected.length < 16) return false;

  const provided = request.headers.get("x-health-token")?.trim();
  if (!provided || provided.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function GET(request: Request) {
  const traceId = crypto.randomUUID();
  const deep =
    new URL(request.url).searchParams.get("deep") === "1" &&
    deepCheckAllowed(request);

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
          // Wie der Provider angebunden ist, sieht nur, wer den Tiefen-Check
          // aufrufen darf. Für einen Uptime-Monitor reicht `status`.
          openAiConfigured: deep ? openAi.configured : null,
          openAiTransport: deep ? openAi.transport : null,
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
