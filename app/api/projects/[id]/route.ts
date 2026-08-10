import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { fetchRealProfilesByIds } from "@/lib/data/freelancers";
import { presentProject, type ProjectRow } from "@/lib/data/projects";
import {
  FreelancerProfileSchema,
  type FreelancerProfile,
  type ShortlistMatch,
} from "@/lib/domain";
import { presentBrief, presentMatch } from "@/lib/presentation/chat";
import { ProjectBriefSchema } from "@/lib/domain";
import { writeAuditEvent } from "@/lib/audit/write";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
  const matchReasons = withoutStatusAvailabilityCopy(row.match_reasons).filter(
    (value) =>
      profile.profileStatus === "active" ||
      value !== "Profil ist im kuratierten Verzeichnis aktiv.",
  );
  const knownGaps = withoutStatusAvailabilityCopy(row.known_gaps);
  if (profile.availability.status === "available") {
    matchReasons.splice(1, 0, "Projektverfügbarkeit ist aktuell bestätigt.");
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
  return {
    profile,
    matchReasons,
    knownGaps,
    verifiedFacts: row.verified_facts_snapshot,
    selfReportedFacts: row.self_reported_facts_snapshot,
    availabilityStatus: profile.availability.status,
    availabilityCheckedAt: profile.availability.checkedAt,
    profileDataVersion: `profile-v${row.profile_data_version}`,
    orderingEvidence: {
      optionalSkillMatchCount: 0,
      exactRequiredSkillMatchCount: 0,
      verifiedRequiredSkillMatchCount: 0,
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
          "id,freelancer_profile_id,position,match_reasons,known_gaps,verified_facts_snapshot,self_reported_facts_snapshot,profile_snapshot,matching_rule_version,profile_data_version",
        )
        .eq("shortlist_id", shortlist.id)
        .eq("owner_user_id", user.id)
        .order("position", { ascending: true });
      if (error) throw error;
      const storedRows = rows as StoredMatchRow[];
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
        analysisMode:
          project.brief_status === "ready"
            ? "ai"
            : project.brief_status === "manual" ||
                project.brief_status === "failed"
              ? "fallback"
              : undefined,
        analysisNotice:
          project.brief_status === "manual" || project.brief_status === "failed"
            ? "Diese gespeicherte Projektanalyse wurde mit der sicheren Basislogik erstellt; es liegt keine bestätigte KI-Auswertung für diesen Stand vor."
            : undefined,
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
