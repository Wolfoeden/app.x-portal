import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { diagnoseOpenAiProvider } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only, non-generative provider check. It retrieves model metadata and
 * returns a redacted status; no prompt is sent and no model tokens are used.
 */
export async function GET() {
  try {
    const user = await requireAdminUser();
    const diagnostic = await diagnoseOpenAiProvider();

    await writeAuditEvent({
      actorUserId: user.id,
      action: "ai_provider_diagnostic_viewed",
      targetType: "ai_provider",
      outcome: diagnostic.status === "reachable" ? "success" : "failed",
      metadata: {
        transport: diagnostic.transport,
        status: diagnostic.status,
        requestedModel: diagnostic.requestedModel,
        httpStatus: diagnostic.httpStatus ?? null,
      },
      required: true,
    });

    return NextResponse.json(diagnostic, {
      status: diagnostic.status === "reachable" ? 200 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { status: "provider_error" },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
