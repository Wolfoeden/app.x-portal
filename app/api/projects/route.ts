import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { presentProject, type ProjectRow } from "@/lib/data/projects";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json({ projects: [] });
    }

    // Admin access is intentionally constrained again by owner_user_id in the
    // server route. The browser has read-only RLS access to the same records.
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("projects")
      .select("*")
      .eq("owner_user_id", user.id)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    return NextResponse.json(
      { projects: (data as ProjectRow[]).map(presentProject) },
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
