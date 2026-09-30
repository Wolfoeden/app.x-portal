import "server-only";

import type { ConversationItem } from "@/components/chat-contract";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { readAnswerToken, type AnswerRole } from "./answer-token";
import { recordRoleAnswer } from "./engagements";
import { roleQuestionDue, type PlacementOutcome } from "./follow-up-rules";
import { clientContact, INTRODUCED_STATUSES } from "./requests";

type Admin = ReturnType<typeof createAdminSupabaseClient>;

/**
 * „Gespräche“: was aus einer Anfrage geworden ist, für beide Seiten.
 *
 * Der Kunde sieht jede eigene Anfrage vom Absenden an. Der Freelancer sieht
 * eine Anfrage erst, wenn XPORTAL ihn vorgestellt hat; vorher prüft der
 * Betreiber noch. Ab 14 Tagen nach der Vorstellung fragt XPORTAL hier jede
 * Seite für sich, ob es zur Beauftragung kam (siehe `roleQuestionDue`).
 */

const INTRODUCED = new Set<string>(INTRODUCED_STATUSES);
const MAX_ITEMS = 50;

type Row = {
  id: string;
  status: string;
  requested_at: string;
  confirmed_at: string | null;
  project_id: string;
  owner_user_id: string;
  freelancer_profile_id: string;
  contact_email: string | null;
  contact_name: string | null;
  contact_company: string | null;
  client_outcome: PlacementOutcome | null;
  client_outcome_at: string | null;
  freelancer_outcome: PlacementOutcome | null;
  freelancer_outcome_at: string | null;
};

const COLUMNS =
  "id,status,requested_at,confirmed_at,project_id,owner_user_id,freelancer_profile_id,contact_email,contact_name,contact_company,client_outcome,client_outcome_at,freelancer_outcome,freelancer_outcome_at";

type Profile = { id: string; display_name: string; role_title: string; booking_url: string | null };

function stageOf(status: string): ConversationItem["stage"] {
  if (status === "cancelled") return "declined";
  return INTRODUCED.has(status) ? "introduced" : "requested";
}

async function context(admin: Admin, rows: Row[]) {
  if (!rows.length) {
    return { titles: new Map<string, string | null>(), profiles: new Map<string, Profile>(), engaged: new Set<string>() };
  }
  const [projects, profiles, engagements] = await Promise.all([
    admin.from("projects").select("id,title").in("id", [...new Set(rows.map((row) => row.project_id))]),
    admin
      .from("freelancer_profiles")
      .select("id,display_name,role_title,booking_url")
      .in("id", [...new Set(rows.map((row) => row.freelancer_profile_id))]),
    admin.from("engagements").select("intro_booking_id").in("intro_booking_id", rows.map((row) => row.id)),
  ]);
  if (projects.error) throw projects.error;
  if (profiles.error) throw profiles.error;
  if (engagements.error) throw engagements.error;
  return {
    titles: new Map(((projects.data ?? []) as { id: string; title: string | null }[]).map((row) => [row.id, row.title])),
    profiles: new Map(((profiles.data ?? []) as Profile[]).map((row) => [row.id, row])),
    engaged: new Set(
      ((engagements.data ?? []) as { intro_booking_id: string | null }[]).flatMap((row) =>
        row.intro_booking_id ? [row.intro_booking_id] : [],
      ),
    ),
  };
}

function item(
  row: Row,
  role: AnswerRole,
  ctx: Awaited<ReturnType<typeof context>>,
  counterpart: { name: string; detail: string | null },
  now: Date,
): ConversationItem {
  const profile = ctx.profiles.get(row.freelancer_profile_id);
  const answer = role === "client" ? row.client_outcome : row.freelancer_outcome;
  const answeredAt = role === "client" ? row.client_outcome_at : row.freelancer_outcome_at;
  const engagementRecorded = ctx.engaged.has(row.id);
  return {
    id: row.id,
    role,
    projectTitle: ctx.titles.get(row.project_id) ?? null,
    counterpartName: counterpart.name,
    counterpartDetail: counterpart.detail,
    profileId: row.freelancer_profile_id,
    stage: stageOf(row.status),
    requestedAt: row.requested_at,
    introducedAt: row.confirmed_at,
    answer,
    answeredAt,
    engagementRecorded,
    question: roleQuestionDue(
      { status: row.status, confirmedAt: row.confirmed_at, answer, answeredAt, hasEngagement: engagementRecorded },
      now,
    ),
    hasCalendar: role === "client" && Boolean(profile?.booking_url?.startsWith("https://")),
  };
}

function freelancerCounterpart(row: Row, ctx: Awaited<ReturnType<typeof context>>) {
  const profile = ctx.profiles.get(row.freelancer_profile_id);
  return { name: profile?.display_name ?? "Freelancer", detail: profile?.role_title ?? null };
}

async function clientCounterpart(admin: Admin, row: Row) {
  const client = await clientContact(admin, row);
  return {
    name: client.company ?? client.name ?? "Kunde über XPORTAL",
    detail: client.company && client.name ? client.name : null,
  };
}

/** Offene Fragen zuerst, danach die neuesten. */
function ordered(items: ConversationItem[]): ConversationItem[] {
  return items.sort(
    (left, right) =>
      Number(Boolean(right.question)) - Number(Boolean(left.question)) ||
      right.requestedAt.localeCompare(left.requestedAt),
  );
}

/** Alle Gespräche eines Nutzers: als Kunde und, mit Freelancer-Profil, als Freelancer. */
export async function listConversations(userId: string, now = new Date()): Promise<ConversationItem[]> {
  const admin = createAdminSupabaseClient();
  const [asClient, ownProfiles] = await Promise.all([
    admin
      .from("intro_bookings")
      .select(COLUMNS)
      .eq("owner_user_id", userId)
      .order("requested_at", { ascending: false })
      .limit(MAX_ITEMS),
    admin.from("freelancer_profiles").select("id").eq("owner_user_id", userId),
  ]);
  if (asClient.error) throw asClient.error;
  if (ownProfiles.error) throw ownProfiles.error;
  const profileIds = ((ownProfiles.data ?? []) as { id: string }[]).map((row) => row.id);

  let asFreelancer: Row[] = [];
  if (profileIds.length) {
    const { data, error } = await admin
      .from("intro_bookings")
      .select(COLUMNS)
      .in("freelancer_profile_id", profileIds)
      .in("status", [...INTRODUCED_STATUSES])
      .order("requested_at", { ascending: false })
      .limit(MAX_ITEMS);
    if (error) throw error;
    // Eine eigene Anfrage an das eigene Profil steht schon auf der Kundenseite.
    asFreelancer = ((data ?? []) as Row[]).filter((row) => row.owner_user_id !== userId);
  }

  const clientRows = (asClient.data ?? []) as Row[];
  const ctx = await context(admin, [...clientRows, ...asFreelancer]);
  const items = [
    ...clientRows.map((row) => item(row, "client", ctx, freelancerCounterpart(row, ctx), now)),
    ...(await Promise.all(
      asFreelancer.map(async (row) => item(row, "freelancer", ctx, await clientCounterpart(admin, row), now)),
    )),
  ];
  return ordered(items);
}

/** Das eine Gespräch hinter dem Link aus dem Mail-Hinweis, ohne Anmeldung. */
export async function conversationForToken(token: string, now = new Date()): Promise<ConversationItem | null> {
  const parsed = readAnswerToken(token);
  if (!parsed) return null;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("intro_bookings").select(COLUMNS).eq("id", parsed.requestId).maybeSingle();
  if (error) throw error;
  const row = data as Row | null;
  if (!row) return null;
  const ctx = await context(admin, [row]);
  const counterpart = parsed.role === "client" ? freelancerCounterpart(row, ctx) : await clientCounterpart(admin, row);
  return item(row, parsed.role, ctx, counterpart, now);
}

/** Auf welcher Seite dieser Nutzer bei dieser Anfrage steht, oder keiner. */
export async function conversationRole(userId: string, requestId: string): Promise<AnswerRole | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("intro_bookings")
    .select("owner_user_id,freelancer_profile_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { owner_user_id: string; freelancer_profile_id: string } | null;
  if (!row) return null;
  if (row.owner_user_id === userId) return "client";
  const { data: profile, error: profileError } = await admin
    .from("freelancer_profiles")
    .select("owner_user_id")
    .eq("id", row.freelancer_profile_id)
    .maybeSingle();
  if (profileError) throw profileError;
  return (profile as { owner_user_id: string | null } | null)?.owner_user_id === userId ? "freelancer" : null;
}

export async function answerConversation(
  requestId: string,
  role: AnswerRole,
  answer: PlacementOutcome,
  siteUrl: string,
) {
  return recordRoleAnswer(requestId, role, answer, siteUrl);
}
