import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { isMissingSchema } from "@/lib/data/freelancer-projects";
import { ProjectLimitError, saveOwnedProjects } from "@/lib/freelancer/owner-projects";
import { ProjectListSchema } from "@/lib/profile/project-schema";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const BodySchema = z.object({ projects: ProjectListSchema }).strict();

/** Der Freelancer speichert die Referenzprojekte seines eigenen Profils. */
export async function PUT(request: Request) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json({ error: "Ein dauerhaftes Konto ist erforderlich.", traceId }, { status: 403, headers: NO_STORE });
    }
    const limit = await consumeRateLimit(`freelancer-projects:${user.id}`, 30, 60 * 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Zu viele Änderungen in kurzer Zeit. Bitte gleich noch einmal.", traceId },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    const { projects } = BodySchema.parse(await readJsonWithLimit(request, 48_000));
    const saved = await saveOwnedProjects(user.id, projects);
    if (!saved) {
      return NextResponse.json({ error: "Zu diesem Konto gibt es noch kein freigegebenes Profil.", traceId }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ projects: saved, traceId }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const where = issue?.path[0] === "projects" && typeof issue.path[1] === "number" ? `Projekt ${issue.path[1] + 1}: ` : "";
      return NextResponse.json({ error: `${where}${issue?.message ?? "Die Angaben sind ungültig."}`, traceId }, { status: 400, headers: NO_STORE });
    }
    if (error instanceof ProjectLimitError) {
      return NextResponse.json(
        { error: "Höchstens acht Projekte. XPORTAL hat noch Vorschläge offen; bitte eines weniger eintragen.", traceId },
        { status: 400, headers: NO_STORE },
      );
    }
    if (isMissingSchema(error)) {
      return NextResponse.json({ error: "Projekte lassen sich gerade noch nicht speichern.", traceId }, { status: 409, headers: NO_STORE });
    }
    console.error("owner project save failed", traceId, error);
    return NextResponse.json({ error: "Die Projekte konnten nicht gespeichert werden.", traceId }, { status: 500, headers: NO_STORE });
  }
}
