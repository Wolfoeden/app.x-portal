import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw new Response("Serverkonfiguration unvollständig.", { status: 503 });
    }
    const admin = createAdminSupabaseClient();
    const owned = <T>(table: string, columns = "*") =>
      admin.from(table).select(columns).eq("owner_user_id", user.id) as unknown as Promise<{
        data: T[] | null;
        error: unknown;
      }>;

    const [
      userProfile,
      projects,
      messages,
      shortlists,
      matches,
      introductions,
      engagements,
      engagementStatusEvents,
      auditEvents,
    ] = await Promise.all([
        admin.from("user_profiles").select("*").eq("id", user.id).maybeSingle(),
        owned("projects"),
        owned("messages"),
        owned("shortlists"),
        owned("matches"),
        owned("intro_bookings"),
        owned("engagements"),
        owned("engagement_status_events"),
        admin
          .from("audit_events")
          .select(
            "action,target_type,target_id,occurred_at,outcome,trace_id,metadata",
          )
          .eq("actor_user_id", user.id),
      ]);
    const failed = [
      userProfile,
      projects,
      messages,
      shortlists,
      matches,
      introductions,
      engagements,
      engagementStatusEvents,
      auditEvents,
    ].find((result) => result.error);
    if (failed?.error) throw failed.error;

    await writeAuditEvent({
      actorUserId: user.id,
      action: "user_data_exported",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
    });

    return NextResponse.json(
      {
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        userProfile: userProfile.data ?? null,
        projects: projects.data ?? [],
        messages: messages.data ?? [],
        shortlists: shortlists.data ?? [],
        matches: matches.data ?? [],
        introductions: introductions.data ?? [],
        engagements: engagements.data ?? [],
        engagementStatusEvents: engagementStatusEvents.data ?? [],
        auditEvents: auditEvents.data ?? [],
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": 'attachment; filename="x-portal-export.json"',
        },
      },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Der Datenexport konnte nicht erstellt werden." },
      { status: 503 },
    );
  }
}
