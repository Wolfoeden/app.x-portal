import { NextResponse } from "next/server";

import { getAiCreditSnapshot } from "@/lib/ai/quota";
import { requireCurrentUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function presentCredits(credits: Awaited<ReturnType<typeof getAiCreditSnapshot>>) {
  return {
    ...credits,
    exhausted: credits.remaining <= 0,
    low:
      credits.remaining > 0 &&
      credits.remaining <= Math.max(1, Math.ceil(credits.total * 0.2)),
  };
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const credits = await getAiCreditSnapshot({
      userId: user.id,
      isAnonymous: user.isAnonymous,
    });
    return NextResponse.json(
      { credits: presentCredits(credits) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Das AI-Credit-Konto ist vorübergehend nicht verfügbar." },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
