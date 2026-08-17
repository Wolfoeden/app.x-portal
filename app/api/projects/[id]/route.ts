import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  fetchActiveBookableRealProfiles,
  fetchRealProfilesByIds,
} from "@/lib/data/freelancers";
import { presentProject, type ProjectRow } from "@/lib/data/projects";
import {
  buildShortlist,
  FreelancerProfileSchema,
  MatchingDecisionSnapshotSchema,
  MatchingEvaluationSnapshotSchema,
  ProjectBriefSchema,
  type FreelancerProfile,
  type ShortlistMatch,
} from "@/lib/domain";
import { presentBrief, presentMatch } from "@/lib/presentation/chat";
import { writeAuditEvent } from "@/lib/audit/write";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UpdateChatSchema = z
  .object({
    collectionId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1).max(180).optional(),
  })
  .strict()
  .refine((value) => value.collectionId !== undefined || value.title !== undefined);

type StoredMatchRow = {
  id: string;
  freelancer_profile_id: string;
  position: number;
  match_reasons: string[];
  known_gaps: string[];
  verified_facts_snapshot: string[];
  self_reported_facts_snapshot: string[];
  profile_snapshot: unknown;
  matching_rule_version: string;
  profile_data_version: number;
  evaluation_snapshot: unknown | null;
};

type StoredShortlistRow = {
  id: string;
  result_count: number;
  result_status:
    | "ranked"
    | "needs_clarification"
    | "no_reliable_match"
    | null;
  decision_snapshot: unknown | null;
  matching_rule_version: string;
};

function availabilityPriority(
  status: FreelancerProfile["availability"]["status"],
): 0 | 1 | 2 | 3 {
  if (status === "available") return 0;
  if (status === "limited") return 1;
  if (status === "unknown") return 2;
  return 3;
}

function withoutStatusAvailabilityCopy(values: readonly string[]): string[] {
  return values.filter(
    (value) =>
      !/^(?:Availability is currently confirmed\.|Project availability is (?:limited|not confirmed);|Projektverfügbarkeit ist (?:aktuell bestätigt\.|begrenzt;|nicht bestätigt;)|Verfügbarkeit ist im angegebenen Startfenster (?:bestätigt|nicht bestätigt)\.|Das gewünschte Startfenster ist im Profil nicht separat bestätigt\.)/u.test(
        value,
      ),
  );
}

function currentBookingUrl(profile: FreelancerProfile): string | null {
  const bookingUrl = profile.introPolicy.bookingUrl;
  if (
    profile.profileStatus !== "active" ||
    profile.availability.status === "unavailable" ||
    !bookingUrl
  ) {
    return null;
  }
  try {
    return new URL(bookingUrl).protocol === "https:" ? bookingUrl : null;
  } catch {
    return null;
  }
}

function restoreMatch(
  row: StoredMatchRow,
  currentProfile: FreelancerProfile | undefined,
): ShortlistMatch | null {
  const storedProfile = FreelancerProfileSchema.safeParse(row.profile_snapshot);
  if (!storedProfile.success || storedProfile.data.demoStatus !== "real") return null;
  const currentState = currentProfile ?? FreelancerProfileSchema.parse({
    ...storedProfile.data,
    profileStatus: "archived",
    availability: {
      ...storedProfile.data.availability,
      status: "unavailable",
    },
    introPolicy: {
      ...storedProfile.data.introPolicy,
      bookingUrl: null,
    },
  });
  const profile = FreelancerProfileSchema.parse({
    ...storedProfile.data,
    demoStatus: currentState.demoStatus,
    profileStatus: currentState.profileStatus,
    availability: currentState.availability,
    introPolicy: {
      ...storedProfile.data.introPolicy,
      bookingUrl: currentBookingUrl(currentState),
    },
  });
  // Shortlists stored before the reason was dropped still carry it, so this
  // filter is the migration path for historic rows, not dead code. It is
  // unconditional now: being active never explains why a profile fits.
  const matchReasons = withoutStatusAvailabilityCopy(row.match_reasons).filter(
    (value) => value !== "Profil ist im kuratierten Verzeichnis aktiv.",
  );
  const knownGaps = withoutStatusAvailabilityCopy(row.known_gaps);
  if (profile.availability.status === "available") {
    // Previously spliced behind the active-directory reason. With that reason
    // gone there is no fixed first element to sit behind, so availability leads.
    matchReasons.unshift("Projektverfügbarkeit ist aktuell bestätigt.");
  } else if (profile.availability.status === "limited") {
    knownGaps.unshift("Projektverfügbarkeit ist begrenzt; den genauen Zeitraum beim Termin abstimmen.");
  } else if (profile.availability.status === "unknown") {
    knownGaps.unshift("Projektverfügbarkeit ist nicht bestätigt; der Booking-Kalender ist verfügbar.");
  } else {
    knownGaps.unshift("Profil ist aktuell nicht verfügbar.");
  }
  if (!profile.introPolicy.bookingUrl) {
    knownGaps.unshift("Direkter Booking-Link ist aktuell nicht verfügbar.");
  }
  const evaluation = MatchingEvaluationSnapshotSchema.safeParse(
    row.evaluation_snapshot,
  );
  return {
    profile,
    matchReasons,
    knownGaps,
    verifiedFacts: row.verified_facts_snapshot,
    selfReportedFacts: row.self_reported_facts_snapshot,
    availabilityStatus: profile.availability.status,
    availabilityCheckedAt: profile.availability.checkedAt,
    profileDataVersion: `profile-v${row.profile_data_version}`,
    ...(evaluation.success
      ? {
          recommendationRole: evaluation.data.recommendationRole,
          fitScore: evaluation.data.fitScore,
          coreCoverage: evaluation.data.coreCoverage,
          requirementAssessments: evaluation.data.requirementAssessments,
          scoreBreakdown: evaluation.data.scoreBreakdown,
        }
      : {}),
    orderingEvidence: {
      ...(evaluation.success
        ? {
            optionalSkillMatchCount:
              evaluation.data.requirementAssessments.filter(
                (assessment) =>
                  assessment.category === "skill" &&
                  assessment.priority === "optional" &&
                  assessment.status === "satisfied",
              ).length,
            coreSkillMatchCount:
              evaluation.data.requirementAssessments.filter(
                (assessment) =>
                  assessment.category === "skill" &&
                  assessment.priority !== "optional" &&
                  assessment.status === "satisfied",
              ).length,
            fitScoreBasisPoints:
              evaluation.data.scoreBreakdown.fitScoreBasisPoints,
            coreCoverageBasisPoints:
              evaluation.data.scoreBreakdown.coreCoverageBasisPoints,
            evidenceConfidenceBasisPoints:
              evaluation.data.scoreBreakdown.evidenceConfidenceBasisPoints,
          }
        : {}),
      availabilityPriority: availabilityPriority(profile.availability.status),
      availableFrom: profile.availability.availableFrom,
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
      .select(
        "id,result_count,result_status,decision_snapshot,matching_rule_version",
      )
      .eq("project_id", project.id)
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (shortlistError) throw shortlistError;

    const brief = ProjectBriefSchema.safeParse(project.structured_brief);
    const storedShortlist = shortlist as StoredShortlistRow | null;
    let profiles: ReturnType<typeof presentMatch>[] = [];
    let usedDeterministicRecovery = false;
    let matchingStatus: StoredShortlistRow["result_status"] | undefined =
      storedShortlist?.result_status ??
      (storedShortlist && storedShortlist.result_count > 0 ? "ranked" : undefined);
    let matchingIntegrityNotice: string | undefined;
    // `status = matching` is also the completed zero-result business state.
    // Only brief_status=pending proves that the current analysis turn is live.
    const projectStillProcessing = project.brief_status === "pending";
    if (brief.success && projectStillProcessing) {
      // A previous shortlist can belong to an earlier turn. While this exact
      // brief is still processing, reconstruct from the current brief instead
      // of pairing a new user message with historical matches.
      const activeProfiles = await fetchActiveBookableRealProfiles(admin);
      const recoveredShortlist = buildShortlist(brief.data, activeProfiles);
      profiles = recoveredShortlist.matches.map(presentMatch);
      matchingStatus = recoveredShortlist.status;
      usedDeterministicRecovery = true;
    } else if (storedShortlist) {
      const decision = MatchingDecisionSnapshotSchema.safeParse(
        storedShortlist.decision_snapshot,
      );
      if (
        ["freelancer-match-v11", "freelancer-match-v12"].includes(
          storedShortlist.matching_rule_version,
        ) && !decision.success
      ) {
        matchingIntegrityNotice =
          "Die gespeicherte Matching-Entscheidung ist unvollständig; historische Scores werden nicht rekonstruiert.";
      }
      const { data: rows, error } = await admin
        .from("matches")
        .select(
          "id,freelancer_profile_id,position,match_reasons,known_gaps,verified_facts_snapshot,self_reported_facts_snapshot,profile_snapshot,matching_rule_version,profile_data_version,evaluation_snapshot",
        )
        .eq("shortlist_id", storedShortlist.id)
        .eq("owner_user_id", user.id)
        .order("position", { ascending: true });
      if (error) throw error;
      const storedRows = rows as StoredMatchRow[];
      if (storedRows.length !== storedShortlist.result_count) {
        matchingIntegrityNotice =
          "Die gespeicherte Trefferzahl und die vorhandenen Profilzeilen weichen voneinander ab; das Ergebnis wird nur eingeschränkt dargestellt.";
      }
      const currentProfiles = await fetchRealProfilesByIds(
        admin,
        storedRows.map((row) => row.freelancer_profile_id),
      );
      const currentProfilesById = new Map(
        currentProfiles.map((profile) => [profile.id, profile]),
      );
      profiles = storedRows
        .map((row) => restoreMatch(row, currentProfilesById.get(row.freelancer_profile_id)))
        .filter((match): match is ShortlistMatch => match !== null)
        .map(presentMatch);
    }

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
        matchingStatus,
        analysisMode:
          usedDeterministicRecovery
            ? "fallback"
            : project.brief_status === "ready"
            ? "ai"
            : project.brief_status === "manual" ||
                project.brief_status === "failed"
              ? "fallback"
              : undefined,
        analysisNotice:
          matchingIntegrityNotice ??
          (usedDeterministicRecovery
            ? "Für diesen noch laufenden Projektstand wurden bis zu drei aktuelle Profile deterministisch aus dem kuratierten Verzeichnis ermittelt. Eine ältere Shortlist wird nicht mit den neuen Angaben vermischt."
            : project.brief_status === "manual" || project.brief_status === "failed"
            ? "Diese gespeicherte Projektanalyse wurde mit der sicheren Basislogik erstellt; es liegt keine bestätigte KI-Auswertung für diesen Stand vor."
            : matchingStatus === undefined && storedShortlist?.result_count === 0
              ? "Für dieses historische Nullergebnis wurde noch keine Qualitätsklassifikation gespeichert."
              : undefined),
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const [{ id }, user, input] = await Promise.all([
      context.params,
      requireCurrentUser(),
      readJsonWithLimit(request, 3_000).then((value) => UpdateChatSchema.parse(value)),
    ]);
    const admin = createAdminSupabaseClient();
    if (input.collectionId) {
      const { data: collection, error } = await admin
        .from("project_collections")
        .select("id")
        .eq("id", input.collectionId)
        .eq("owner_user_id", user.id)
        .is("archived_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!collection) {
        return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });
      }
    }
    const updates = {
      ...(input.collectionId !== undefined ? { collection_id: input.collectionId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin
      .from("projects")
      .update(updates)
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Chat nicht gefunden." }, { status: 404 });
    await writeAuditEvent({
      actorUserId: user.id,
      action: input.collectionId === undefined ? "project_chat_renamed" : "project_chat_moved",
      targetType: "project",
      targetId: id,
      outcome: "success",
    });
    return NextResponse.json({ project: presentProject(data as ProjectRow) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Die Chat-Änderung ist ungültig." }, { status: 400 });
    }
    return NextResponse.json({ error: "Chat konnte nicht aktualisiert werden." }, { status: 503 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const [{ id }, user] = await Promise.all([context.params, requireCurrentUser()]);
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Chat nicht gefunden." }, { status: 404 });
    await writeAuditEvent({
      actorUserId: user.id,
      action: "project_chat_deleted",
      targetType: "project",
      targetId: id,
      outcome: "success",
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Chat konnte nicht gelöscht werden." }, { status: 503 });
  }
}
