import "server-only";

import { contactInbox } from "@/lib/contact/messages";
import { deliverEmail } from "@/lib/email/deliver";
import { logEvent } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  answerTokensConfigured,
  conversationUrl,
  mintAnswerToken,
  readAnswerToken,
  type AnswerRole,
} from "./answer-token";
import { PLACEMENT_TERMS, placementFeeCents } from "./config";
import {
  followUpDue,
  outcomeReplaces,
  roleQuestionDue,
  type PlacementOutcome,
} from "./follow-up-rules";
import {
  engagementReportedNotice,
  followUpForClient,
  followUpForFreelancer,
} from "./messages";
import { clientContact, freelancerContactEmail, INTRODUCED_STATUSES } from "./requests";

type Admin = ReturnType<typeof createAdminSupabaseClient>;

/**
 * Was nach der Vorstellung passiert: Beauftragung erfassen, Honorar
 * abrechnen, nachfragen, Antworten speichern.
 *
 * Die Beauftragung liegt in `engagements`, je Vorstellung höchstens eine. Das
 * Honorar steht dort in Cent, zusammen mit der Fassung der Bedingungen, aus
 * der es sich ergibt.
 */

type IntroRow = {
  id: string;
  status: string;
  project_id: string;
  owner_user_id: string;
  freelancer_profile_id: string;
  confirmed_at: string | null;
  outcome: PlacementOutcome | null;
  follow_up_count: number;
  contact_email?: string | null;
  contact_name?: string | null;
  contact_company?: string | null;
  client_outcome?: PlacementOutcome | null;
  client_outcome_at?: string | null;
  freelancer_outcome?: PlacementOutcome | null;
  freelancer_outcome_at?: string | null;
};

const INTRO_COLUMNS =
  "id,status,project_id,owner_user_id,freelancer_profile_id,confirmed_at,outcome,follow_up_count,contact_email,contact_name,contact_company,client_outcome,client_outcome_at,freelancer_outcome,freelancer_outcome_at";

/** Was diese Seite zuletzt gesagt hat, und wann. */
function answerOf(row: IntroRow, role: AnswerRole) {
  return role === "client"
    ? { answer: row.client_outcome ?? null, answeredAt: row.client_outcome_at ?? null }
    : { answer: row.freelancer_outcome ?? null, answeredAt: row.freelancer_outcome_at ?? null };
}

async function loadIntroduced(admin: Admin, id: string): Promise<IntroRow> {
  const { data, error } = await admin.from("intro_bookings").select(INTRO_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  const row = data as IntroRow | null;
  if (!row) throw new Response("Anfrage nicht gefunden.", { status: 404 });
  if (!(INTRODUCED_STATUSES as readonly string[]).includes(row.status)) {
    throw new Response("Diese Anfrage ist noch nicht vorgestellt.", { status: 409 });
  }
  return row;
}

async function engagementFor(admin: Admin, introId: string) {
  const { data, error } = await admin
    .from("engagements")
    .select("id,fee_status,fee_minor")
    .eq("intro_booking_id", introId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; fee_status: string | null; fee_minor: number | null } | null;
}

/** Die Bedingungen, denen der Kunde bei dieser Anfrage zugestimmt hat. */
async function acceptedTerms(admin: Admin, introId: string) {
  const { data } = await admin
    .from("audit_events")
    .select("metadata")
    .eq("action", "placement_terms_accepted")
    .eq("target_id", introId)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const metadata = (data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
  const number = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  return {
    version: typeof metadata.version === "string" ? metadata.version : PLACEMENT_TERMS.version,
    feePercent: number(metadata.feePercent, PLACEMENT_TERMS.feePercent),
    maxFeeDays: number(metadata.maxFeeDays, PLACEMENT_TERMS.maxFeeDays),
  };
}

/**
 * Die Beauftragung erfassen. Tagessatz in Cent, Projekttage der ersten drei
 * Monate, Start. Daraus das Honorar nach der zugestimmten Fassung.
 */
export async function recordEngagement(
  introId: string,
  input: { dayRateMinor: number; projectDays: number; startsOn: string },
) {
  const admin = createAdminSupabaseClient();
  const intro = await loadIntroduced(admin, introId);
  if (await engagementFor(admin, introId)) {
    throw new Response("Die Beauftragung ist schon erfasst.", { status: 409 });
  }
  const terms = await acceptedTerms(admin, introId);
  const feeMinor = placementFeeCents(input.dayRateMinor, input.projectDays, terms);
  const now = new Date().toISOString();

  const { error } = await admin.from("engagements").insert({
    project_id: intro.project_id,
    owner_user_id: intro.owner_user_id,
    freelancer_profile_id: intro.freelancer_profile_id,
    intro_booking_id: intro.id,
    status: "active",
    contract_value_minor: input.dayRateMinor * input.projectDays,
    currency: "EUR",
    confirmation_source: "operator",
    confirmed_at: now,
    day_rate_minor: input.dayRateMinor,
    project_days: input.projectDays,
    starts_on: input.startsOn,
    fee_minor: feeMinor,
    fee_status: "open",
    terms_version: terms.version,
  });
  if (error) throw error;

  // Hat Kunde oder Freelancer die Beauftragung schon gemeldet, bleibt diese
  // Quelle stehen; sonst hat der Betreiber sie festgestellt.
  const outcome =
    intro.outcome === "engaged"
      ? { outcome: "engaged" }
      : { outcome: "engaged", outcome_source: "operator", outcome_reported_at: now };
  const { error: introError } = await admin
    .from("intro_bookings")
    .update(outcome)
    .eq("id", intro.id);
  if (introError) throw introError;

  return { feeMinor, termsVersion: terms.version, clientUserId: intro.owner_user_id };
}

/** Der Betreiber hält fest: kein Auftrag. */
export async function recordNoEngagement(introId: string) {
  const admin = createAdminSupabaseClient();
  const intro = await loadIntroduced(admin, introId);
  if (await engagementFor(admin, introId)) {
    throw new Response("Die Beauftragung ist schon erfasst.", { status: 409 });
  }
  const { error } = await admin
    .from("intro_bookings")
    .update({ outcome: "no_engagement", outcome_source: "operator", outcome_reported_at: new Date().toISOString() })
    .eq("id", intro.id);
  if (error) throw error;
  return { clientUserId: intro.owner_user_id };
}

/**
 * Rechnungsstand. `invoiced` braucht die Rechnungsnummer, `paid` geht aus
 * `open` oder `invoiced`. Rückwärts geht nichts; ein Fehler wird von Hand in
 * der Datenbank korrigiert und steht dann im Protokoll.
 */
export async function recordFeeStatus(
  introId: string,
  next: { status: "invoiced"; reference: string } | { status: "paid" },
) {
  const admin = createAdminSupabaseClient();
  const intro = await loadIntroduced(admin, introId);
  const engagement = await engagementFor(admin, introId);
  if (!engagement) throw new Response("Erst die Beauftragung erfassen.", { status: 409 });
  const allowedFrom = next.status === "invoiced" ? ["open"] : ["open", "invoiced"];
  if (!allowedFrom.includes(engagement.fee_status ?? "")) {
    throw new Response("Dieser Schritt passt nicht zum Rechnungsstand.", { status: 409 });
  }
  const now = new Date().toISOString();
  const values =
    next.status === "invoiced"
      ? { fee_status: "invoiced", invoice_reference: next.reference, invoiced_at: now }
      : { fee_status: "paid", paid_at: now };
  const { data, error } = await admin
    .from("engagements")
    .update(values)
    .eq("id", engagement.id)
    .eq("fee_status", engagement.fee_status ?? "")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Response("Der Rechnungsstand hat sich inzwischen geändert.", { status: 409 });
  return { feeMinor: engagement.fee_minor ?? 0, clientUserId: intro.owner_user_id };
}

function hintLink(siteUrl: string, requestId: string, role: AnswerRole): string | null {
  const token = mintAnswerToken(requestId, role);
  return token ? conversationUrl(siteUrl, token) : null;
}

type FollowUpRow = IntroRow & { hasEngagement: boolean };

async function followUpCandidates(admin: Admin): Promise<FollowUpRow[]> {
  const { data, error } = await admin
    .from("intro_bookings")
    .select(INTRO_COLUMNS)
    .in("status", [...INTRODUCED_STATUSES])
    .lt("follow_up_count", 2)
    .order("confirmed_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as IntroRow[];
  if (!rows.length) return [];
  const { data: engaged, error: engagedError } = await admin
    .from("engagements")
    .select("intro_booking_id")
    .in("intro_booking_id", rows.map((row) => row.id));
  if (engagedError) throw engagedError;
  const withEngagement = new Set(
    ((engaged ?? []) as { intro_booking_id: string | null }[]).map((row) => row.intro_booking_id),
  );
  return rows.map((row) => ({ ...row, hasEngagement: withEngagement.has(row.id) }));
}

/** Wie viele Nachfragen heute fällig sind. Für die Admin-Seite. */
export async function countDueFollowUps(now = new Date()): Promise<number> {
  const rows = await followUpCandidates(createAdminSupabaseClient());
  return rows.filter((row) => followUpDue(candidateOf(row), now)).length;
}

function candidateOf(row: FollowUpRow) {
  return {
    status: row.status,
    confirmedAt: row.confirmed_at,
    outcome: row.outcome,
    followUpCount: row.follow_up_count,
    hasEngagement: row.hasEngagement,
    clientAnswer: row.client_outcome ?? null,
    freelancerAnswer: row.freelancer_outcome ?? null,
  };
}

/** Ob die Frage an diese Seite gerade offen ist. */
function questionOpen(row: FollowUpRow, role: AnswerRole, now: Date): boolean {
  return (
    roleQuestionDue(
      { status: row.status, confirmedAt: row.confirmed_at, hasEngagement: row.hasEngagement, ...answerOf(row, role) },
      now,
    ) !== null
  );
}

/**
 * Alle fälligen Hinweise verschicken, einmal am Tag über den Zeitplan und bei
 * Bedarf von Hand aus dem Admin.
 *
 * Die Frage selbst steht in „Gespräche“; die Mail weist nur darauf hin. Jede
 * Seite bekommt den Hinweis nur, solange ihre eigene Frage offen ist. Der
 * Zähler steigt nur, wenn er noch auf dem alten Wert steht: Laufen zwei
 * Durchgänge gleichzeitig, verschickt nur einer.
 */
export async function sendDueFollowUps(siteUrl: string, now = new Date()) {
  if (!answerTokensConfigured()) {
    throw new Response("Die Antwortlinks sind nicht eingerichtet (EMAIL_UNSUBSCRIBE_SECRET).", { status: 503 });
  }
  const admin = createAdminSupabaseClient();
  const rows = await followUpCandidates(admin);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const round = followUpDue(candidateOf(row), now);
    if (!round) continue;

    const { data: claimed, error } = await admin
      .from("intro_bookings")
      .update({ follow_up_count: row.follow_up_count + 1, last_follow_up_at: now.toISOString() })
      .eq("id", row.id)
      .eq("follow_up_count", row.follow_up_count)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!claimed) continue;

    const [client, profile, project] = await Promise.all([
      clientContact(admin, row),
      admin
        .from("freelancer_profiles")
        .select("display_name,role_title,owner_user_id")
        .eq("id", row.freelancer_profile_id)
        .maybeSingle(),
      admin.from("projects").select("title").eq("id", row.project_id).maybeSingle(),
    ]);
    const profileRow = profile.data as { display_name: string; role_title: string; owner_user_id: string | null } | null;
    if (!profileRow || !client.email) {
      failed += 1;
      continue;
    }
    const parties = {
      siteUrl,
      clientName: client.name ?? client.company,
      clientEmail: client.email,
      freelancerName: profileRow.display_name,
      freelancerRole: profileRow.role_title,
      projectTitle: (project.data as { title: string | null } | null)?.title ?? null,
    };

    const clientLink = questionOpen(row, "client", now) ? hintLink(siteUrl, row.id, "client") : null;
    if (clientLink) {
      const result = await deliverEmail({
        to: client.email,
        ...followUpForClient({ ...parties, round, link: clientLink }),
        kind: "transactional",
      });
      if (result.delivered) sent += 1;
      else {
        failed += 1;
        logEvent("placement_follow_up_failed", { requestId: row.id, role: "client", reason: result.reason });
      }
    }

    const freelancerLink = questionOpen(row, "freelancer", now) ? hintLink(siteUrl, row.id, "freelancer") : null;
    const freelancerEmail = freelancerLink
      ? await freelancerContactEmail(admin, row.freelancer_profile_id, profileRow.owner_user_id).catch(() => null)
      : null;
    if (freelancerEmail && freelancerLink) {
      const result = await deliverEmail({
        to: freelancerEmail,
        ...followUpForFreelancer({ ...parties, round, link: freelancerLink }),
        kind: "transactional",
      });
      if (result.delivered) sent += 1;
      else logEvent("placement_follow_up_failed", { requestId: row.id, role: "freelancer", reason: result.reason });
    }
  }
  return { sent, failed };
}

/** Was die Antwortseite zeigt, bevor jemand klickt. */
export async function describeAnswerRequest(token: string) {
  const parsed = readAnswerToken(token);
  if (!parsed) return null;
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("intro_bookings")
    .select("id,status,project_id,freelancer_profile_id,outcome")
    .eq("id", parsed.requestId)
    .maybeSingle();
  const row = data as { id: string; status: string; project_id: string; freelancer_profile_id: string; outcome: PlacementOutcome | null } | null;
  if (!row) return null;
  const [profile, project] = await Promise.all([
    admin.from("freelancer_profiles").select("display_name").eq("id", row.freelancer_profile_id).maybeSingle(),
    admin.from("projects").select("title").eq("id", row.project_id).maybeSingle(),
  ]);
  return {
    role: parsed.role,
    freelancerName: (profile.data as { display_name?: string } | null)?.display_name ?? "den Freelancer",
    projectTitle: (project.data as { title?: string | null } | null)?.title ?? null,
    outcome: row.outcome,
  };
}

/**
 * Eine Antwort speichern, aus „Gespräche“ oder über den Link aus der Mail.
 *
 * Die Antwort dieser Seite steht immer für sich (`client_outcome` bzw.
 * `freelancer_outcome`). Der zusammengefasste Stand `outcome` ändert sich nur
 * nach `outcomeReplaces`. Meldet jemand „beauftragt“, geht eine Mail an den
 * Betreiber: Er erfragt dann Tagessatz, Tage und Start und erfasst die
 * Beauftragung.
 */
export async function recordRoleAnswer(
  requestId: string,
  role: AnswerRole,
  answer: PlacementOutcome,
  siteUrl: string,
) {
  const admin = createAdminSupabaseClient();
  const intro = await loadIntroduced(admin, requestId);
  const hasEngagement = Boolean(await engagementFor(admin, intro.id));
  if (hasEngagement) {
    return { recorded: false, requestId: intro.id, clientUserId: intro.owner_user_id, role };
  }
  const now = new Date().toISOString();
  const previous = answerOf(intro, role).answer;
  const replaces = outcomeReplaces(intro.outcome, answer, hasEngagement);
  const values: Record<string, unknown> =
    role === "client"
      ? { client_outcome: answer, client_outcome_at: now }
      : { freelancer_outcome: answer, freelancer_outcome_at: now };
  if (replaces) Object.assign(values, { outcome: answer, outcome_source: role, outcome_reported_at: now });

  const { error } = await admin.from("intro_bookings").update(values).eq("id", intro.id);
  if (error) throw error;

  if (answer === "engaged" && previous !== "engaged") {
    const [client, profile, project] = await Promise.all([
      clientContact(admin, intro),
      admin.from("freelancer_profiles").select("display_name").eq("id", intro.freelancer_profile_id).maybeSingle(),
      admin.from("projects").select("title").eq("id", intro.project_id).maybeSingle(),
    ]);
    const notice = engagementReportedNotice({
      siteUrl,
      role,
      clientEmail: client.email,
      freelancerName: (profile.data as { display_name?: string } | null)?.display_name ?? "Unbekanntes Profil",
      projectTitle: (project.data as { title?: string | null } | null)?.title ?? null,
    });
    const result = await deliverEmail({ to: contactInbox(), ...notice, kind: "transactional" });
    if (!result.delivered) logEvent("placement_outcome_notice_failed", { requestId: intro.id, reason: result.reason });
  }
  return { recorded: true, requestId: intro.id, clientUserId: intro.owner_user_id, role };
}

/** Die Antwort über den Link aus der Mail: Vorgang und Seite stehen im Token. */
export async function recordAnswer(token: string, answer: PlacementOutcome, siteUrl: string) {
  const parsed = readAnswerToken(token);
  if (!parsed) throw new Response("Dieser Link ist ungültig.", { status: 404 });
  return recordRoleAnswer(parsed.requestId, parsed.role, answer, siteUrl);
}
