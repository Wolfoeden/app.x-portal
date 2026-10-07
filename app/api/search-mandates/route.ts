import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { openMandateForProject } from "@/lib/placement/mandates";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** Historical search mandates stay readable; new work uses saved projects. */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("projectId"));
    return NextResponse.json({ mandate: await openMandateForProject(id, user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Projekt nicht abrufbar." }, { status: 400 });
  }
}
export async function POST() {
  return NextResponse.json({ error: "Neue Projekte werden direkt in Ihrem Arbeitsbereich bearbeitet. Bearbeiten Sie Kriterien oder starten Sie dort ausdrücklich eine weitere Recherche.", nextAction: "edit_criteria", href: "/chat" }, { status: 410 });
}
