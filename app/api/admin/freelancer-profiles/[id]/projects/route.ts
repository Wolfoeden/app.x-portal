import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { saveAdminProjects } from "@/lib/admin/profile-admin";
import { requireAdminUser } from "@/lib/auth/current-user";
import { isMissingSchema } from "@/lib/data/freelancer-projects";
import { ProjectListSchema } from "@/lib/profile/project-schema";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const IdSchema = z.string().uuid();
const BodySchema = z.object({ projects: ProjectListSchema }).strict();

/**
 * Ersetzt die Projektliste eines Profils. Nur Admins; der Haken „geprüft“
 * gehört dem, der speichert. Recherchierte Vorschläge bleiben unsichtbar,
 * bis „öffentlich“ gesetzt ist.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const id = IdSchema.parse((await context.params).id);
    const { projects } = BodySchema.parse(await readJsonWithLimit(request, 48_000));
    const saved = await saveAdminProjects(id, projects, admin.id);
    return NextResponse.json({ saved, traceId }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const where = issue?.path[0] === "projects" && typeof issue.path[1] === "number" ? `Projekt ${issue.path[1] + 1}: ` : "";
      return NextResponse.json(
        { error: `${where}${issue?.message ?? "Die Angaben sind ungültig."}`, traceId },
        { status: 400, headers: NO_STORE },
      );
    }
    if (isMissingSchema(error)) {
      return NextResponse.json(
        { error: "Die Migration für Projekte ist noch nicht eingespielt.", traceId },
        { status: 409, headers: NO_STORE },
      );
    }
    if ((error as { code?: unknown } | null)?.code === "P0002") {
      return NextResponse.json({ error: "Profil nicht gefunden.", traceId }, { status: 404, headers: NO_STORE });
    }
    console.error("admin project save failed", traceId, error);
    return NextResponse.json({ error: "Die Projekte konnten nicht gespeichert werden.", traceId }, { status: 500, headers: NO_STORE });
  }
}
