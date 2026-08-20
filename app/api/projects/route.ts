import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { loadOwnedProjects } from "@/lib/data/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return NextResponse.json(
      { projects: await loadOwnedProjects(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Projekte konnten nicht geladen werden." },
      { status: 503 },
    );
  }
}
