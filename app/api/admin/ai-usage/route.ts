import { NextResponse } from "next/server";

import { getAdminUsageDashboard } from "@/lib/ai/admin-usage";
import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateParameter(value: string | null, endOfDay = false): string | undefined {
  if (!value) return undefined;
  const suffix = /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? endOfDay
      ? "T23:59:59.999Z"
      : "T00:00:00.000Z"
    : "";
  const date = new Date(`${value}${suffix}`);
  if (Number.isNaN(date.getTime())) {
    throw new Response("Invalid date range", { status: 400 });
  }
  return date.toISOString();
}

export async function GET(request: Request) {
  try {
    const user = await requireAdminUser();
    const url = new URL(request.url);
    const from = dateParameter(url.searchParams.get("from"));
    const to = dateParameter(url.searchParams.get("to"), true);
    if (from && to && from > to) {
      throw new Response("Invalid date range", { status: 400 });
    }
    const dashboard = await getAdminUsageDashboard({ from, to });
    await writeAuditEvent({
      actorUserId: user.id,
      action: "ai_usage_admin_viewed",
      targetType: "ai_usage",
      outcome: "success",
      metadata: { filtered: Boolean(from || to) },
      required: true,
    });
    return NextResponse.json(dashboard, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Die AI-Usage-Auswertung ist vorübergehend nicht verfügbar." },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
