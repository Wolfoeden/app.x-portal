import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { updateAdminProfile } from "@/lib/admin/profile-admin";
import { requireAdminUser } from "@/lib/auth/current-user";
import { isMissingSchema } from "@/lib/data/freelancer-projects";
import { ProfileLinksSchema } from "@/lib/profile/project-schema";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const IdSchema = z.string().uuid();

const PatchSchema = z
  .object({
    referencesSummary: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .optional()
      .transform((value) => (value === undefined ? undefined : value || null)),
    links: ProfileLinksSchema.optional(),
    status: z.enum(["active", "paused"]).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), "Nichts zu ändern.");

/** Referenznotiz, Links und Sichtbarkeit eines veröffentlichten Profils. Nur Admins. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const id = IdSchema.parse((await context.params).id);
    const patch = PatchSchema.parse(await readJsonWithLimit(request, 12_000));
    const updated = await updateAdminProfile(id, patch, admin.id);
    if (!updated) {
      return NextResponse.json({ error: "Profil nicht gefunden.", traceId }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ updated: true, traceId }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Die Angaben sind ungültig.", traceId },
        { status: 400, headers: NO_STORE },
      );
    }
    if (isMissingSchema(error)) {
      return NextResponse.json(
        { error: "Die Migration für Projekte und Links ist noch nicht eingespielt.", traceId },
        { status: 409, headers: NO_STORE },
      );
    }
    console.error("admin profile update failed", traceId, error);
    return NextResponse.json({ error: "Das Profil konnte nicht gespeichert werden.", traceId }, { status: 500, headers: NO_STORE });
  }
}
