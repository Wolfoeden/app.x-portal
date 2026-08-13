import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  presentProjectCollection,
  type ProjectCollectionRow,
} from "@/lib/data/projects";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CreateCollectionSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("project_collections")
      .select("*")
      .eq("owner_user_id", user.id)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json(
      { collections: (data as ProjectCollectionRow[]).map(presentProjectCollection) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Projekte konnten nicht geladen werden." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const input = CreateCollectionSchema.parse(await readJsonWithLimit(request, 2_000));
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("project_collections")
      .insert({ owner_user_id: user.id, name: input.name })
      .select("*")
      .single();
    if (error) throw error;
    const collection = presentProjectCollection(data as ProjectCollectionRow);
    await writeAuditEvent({
      actorUserId: user.id,
      action: "project_collection_created",
      targetType: "project_collection",
      targetId: collection.id,
      outcome: "success",
    });
    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Der Projektname ist ungültig." }, { status: 400 });
    }
    return NextResponse.json({ error: "Projekt konnte nicht erstellt werden." }, { status: 503 });
  }
}
