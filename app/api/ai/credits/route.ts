import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { loadWorkspaceUsage } from "@/lib/data/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return NextResponse.json(await loadWorkspaceUsage(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Das Nutzungskontingent ist vorübergehend nicht verfügbar." },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
