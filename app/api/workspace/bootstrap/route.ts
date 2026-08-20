import { NextResponse } from "next/server";

import { loadWorkspaceBootstrap } from "@/lib/data/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One request for everything the workspace needs to open.
 *
 * Replaces a four-step client waterfall — session, credits, projects, folders
 * — where every step waited for the one before it and repeated the same
 * session check. The individual endpoints stay: they are what the app calls
 * when a single section changes, for example the credit snapshot after a
 * chat message.
 */
export async function GET() {
  try {
    return NextResponse.json(await loadWorkspaceBootstrap(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Der Arbeitsbereich konnte nicht geladen werden." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
