import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { presentProject, type ProjectRow } from "@/lib/data/projects";
import {
  FreelancerProfileSchema,
  type ShortlistMatch,
} from "@/lib/domain";
import { presentBrief, presentMatch } from "@/lib/presentation/chat";
import { ProjectBriefSchema } from "@/lib/domain";
import { writeAuditEvent } from "@/lib/audit/write";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type StoredMatchRow = {
  id: string;
  position: number;
  match_reasons: string[];
  known_gaps: string[];
  verified_facts_snapshot: string[];
  self_reported_facts_snapshot: string[];
  profile_snapshot: unknown;
  matching_rule_version: string;
  profile_data_version: number;
};

function restoreMatch(row: StoredMatchRow): ShortlistMatch | null {
  const profile = FreelancerProfileSchema.safeParse(row.profile_snapshot);
  if (!profile.success) return null;
  return {
    profile: profile.data,
    matchReasons: row.match_reasons,
    knownGaps: row.known_gaps,
    verifiedFacts: row.verified_facts_snapshot,
    selfReportedFacts: row.self_reported_facts_snapshot,
    availabilityStatus: "available",
    availabilityCheckedAt: profile.data.availability.checkedAt,
    profileDataVersion: `profile-v${row.profile_data_version}`,
    orderingEvidence: {
      optionalSkillMatchCount: 0,
      verifiedRequiredSkillMatchCount: 0,
      availableFrom: profile.data.availability.availableFrom,
    },
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw new Response("Serverkonfiguration unvollständig.", { status: 503 });
    }
    const admin = createAdminSupabaseClient();
    const { data: projectData, error: projectError } = await admin
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!projectData) throw new Response("Projekt nicht gefunden.", { status: 404 });
    const project = projectData as ProjectRow;

    const { data: messages, error: messagesError } = await admin
      .from("messages")
      .select("id,role,content,created_at")
      .eq("project_id", project.id)
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (messagesError) throw messagesError;

    const { data: shortlist, error: shortlistError } = await admin
      .from("shortlists")
      .select("id")
      .eq("project_id", project.id)
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (shortlistError) throw shortlistError;

    let profiles: ReturnType<typeof presentMatch>[] = [];
    if (shortlist) {
      const { data: rows, error } = await admin
        .from("matches")
        .select(
          "id,position,match_reasons,known_gaps,verified_facts_snapshot,self_reported_facts_snapshot,profile_snapshot,matching_rule_version,profile_data_version",
        )
        .eq("shortlist_id", shortlist.id)
        .eq("owner_user_id", user.id)
        .order("position", { ascending: true });
      if (error) throw error;
      profiles = (rows as StoredMatchRow[])
        .map(restoreMatch)
        .filter((match): match is ShortlistMatch => match !== null)
        .map(presentMatch);
    }

    const brief = ProjectBriefSchema.safeParse(project.structured_brief);
    await writeAuditEvent({
      actorUserId: user.id,
      action: "project_accessed",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
    });

    return NextResponse.json(
      {
        project: presentProject(project),
        messages: (messages ?? []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at,
        })),
        brief: brief.success ? presentBrief(brief.data) : null,
        profiles,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Projekt konnte nicht geladen werden." },
      { status: 503 },
    );
  }
}
