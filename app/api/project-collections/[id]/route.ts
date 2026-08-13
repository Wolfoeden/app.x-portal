import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { presentProjectCollection, type ProjectCollectionRow } from "@/lib/data/projects";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UpdateCollectionSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const [{ id }, user, input] = await Promise.all([
      context.params,
      requireCurrentUser(),
      readJsonWithLimit(request, 2_000).then((value) => UpdateCollectionSchema.parse(value)),
    ]);
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("project_collections")
      .update({ name: input.name, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .is("archived_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });
    return NextResponse.json({ collection: presentProjectCollection(data as ProjectCollectionRow) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Der Projektname ist ungültig." }, { status: 400 });
    return NextResponse.json({ error: "Projekt konnte nicht aktualisiert werden." }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const [{ id }, user] = await Promise.all([context.params, requireCurrentUser()]);
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("project_collections")
      .delete()
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });
    await writeAuditEvent({ actorUserId: user.id, action: "project_collection_deleted", targetType: "project_collection", targetId: id, outcome: "success" });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Projekt konnte nicht gelöscht werden." }, { status: 503 });
  }
}
