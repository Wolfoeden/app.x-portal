import "server-only";

import { randomUUID } from "node:crypto";

import { writeAuditEvent } from "@/lib/audit/write";
import { contactInbox } from "@/lib/contact/messages";
import { fetchActiveBookableRealProfiles } from "@/lib/data/freelancers";
import { buildShortlist, ProjectBriefSchema, type FreelancerProfile } from "@/lib/domain";
import { deliverEmail } from "@/lib/email/deliver";
import { logEvent } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { PLACEMENT_TERMS } from "./config";
import { DAY_MS, GUEST_LIMIT_ERROR, jsonResponse } from "./guest-contact";
import {
  MANDATE_EXISTS,
  OPEN_MANDATE_STATUSES,
  briefLine,
  isMandateStatus,
  type Mandate,
  type MandateStatus,
} from "./mandate-model";
import { mandateNotice } from "./messages";

/**
 * Suchaufträge lesen und schreiben (public.search_mandates).
 *
 * Nur über den Dienstschlüssel. Ins Audit-Protokoll kommt, was getan wurde;
 * die Kontaktadresse steht nur dort, wo auch die Anfrage aus der Ergebnisliste
 * sie festhält — bei der Zustimmung zu den Vermittlungsbedingungen, als
 * Nachweis, wer zugestimmt hat.
 */

type Admin = ReturnType<typeof createAdminSupabaseClient>;
type Row = Record<string, unknown>;

const COLUMNS =
  "id,project_id,owner_user_id,contact_email,contact_company,contact_name,contact_phone,note,status,terms_version,created_at,handled_at,commercial_model";

/** Höchstens so viele Suchaufträge ohne Konto je Gast und Tag. */
const GUEST_MANDATES_PER_DAY = 3;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export type MandateContact = {
  email: string;
  company: string | null;
  name: string | null;
  phone: string | null;
};

export type CreateMandateResult =
  | { created: true; mandate: { id: string; status: MandateStatus } }
  | { created: false; mandate: { id: string; status: MandateStatus }; message: string };

/**
 * Legt einen Suchauftrag an. Der Aufrufer hat die Bedingungsfassung und — bei
 * Gästen — Honigtopf und Grenze je Adresse schon geprüft.
 *
 * Erst die Zustimmung ins Protokoll, dann der Auftrag: Es darf keinen Auftrag
 * geben, zu dem die Fassung der Bedingungen fehlt.
 */
export async function createMandate(input: {
  userId: string;
  isGuest: boolean;
  projectId: string;
  contact: MandateContact;
  note: string | null;
  siteUrl: string;
}): Promise<CreateMandateResult> {
  const admin = createAdminSupabaseClient();

  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id,title,structured_brief")
    .eq("id", input.projectId)
    .eq("owner_user_id", input.userId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw jsonResponse(404, "Projekt nicht gefunden.");

  const existing = await openMandateFor(admin, input.projectId);
  if (existing) return { created: false, mandate: existing, message: MANDATE_EXISTS };

  if (input.isGuest) {
    const { count, error } = await admin
      .from("search_mandates")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", input.userId)
      .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
    if (error) throw error;
    if ((count ?? 0) >= GUEST_MANDATES_PER_DAY) throw jsonResponse(429, GUEST_LIMIT_ERROR);
  }

  const id = randomUUID();
  const acceptedAt = new Date().toISOString();
  await writeAuditEvent({
    actorUserId: input.userId,
    action: "placement_terms_accepted",
    targetType: "search_mandate",
    targetId: id,
    outcome: "success",
    metadata: {
      version: PLACEMENT_TERMS.version,
      feePercent: PLACEMENT_TERMS.feePercent,
      feeMonths: PLACEMENT_TERMS.feeMonths,
      maxFeeDays: PLACEMENT_TERMS.maxFeeDays,
      protectionMonths: PLACEMENT_TERMS.protectionMonths,
      acceptedAt,
      mandate: true,
      ...(input.isGuest ? { guest: true, contactEmail: input.contact.email, company: input.contact.company } : {}),
    },
    required: true,
  });

  const { data: inserted, error: insertError } = await admin
    .from("search_mandates")
    .insert({
      id,
      project_id: input.projectId,
      owner_user_id: input.userId,
      contact_email: input.contact.email,
      contact_company: input.contact.company,
      contact_name: input.contact.name,
      contact_phone: input.contact.phone,
      note: input.note,
      terms_version: PLACEMENT_TERMS.version,
      created_at: acceptedAt,
      updated_at: acceptedAt,
    })
    .select("id,status")
    .single();
  if (insertError) {
    // Zwei Klicks gleichzeitig: Der zweite trifft den Index für offene Aufträge.
    if ((insertError as { code?: string }).code === "23505") {
      const raced = await openMandateFor(admin, input.projectId);
      if (raced) return { created: false, mandate: raced, message: MANDATE_EXISTS };
    }
    throw insertError;
  }

  await writeAuditEvent({
    actorUserId: input.userId,
    action: "search_mandate_created",
    targetType: "search_mandate",
    targetId: id,
    outcome: "success",
    metadata: { guest: input.isGuest, withNote: Boolean(input.note), withPhone: Boolean(input.contact.phone) },
  });

  const brief = ProjectBriefSchema.safeParse((project as Row).structured_brief);
  const notice = mandateNotice({
    siteUrl: input.siteUrl,
    contactEmail: input.contact.email,
    company: input.contact.company,
    name: input.contact.name,
    phone: input.contact.phone,
    note: input.note,
    guest: input.isGuest,
    projectTitle: text((project as Row).title),
    briefSummary: brief.success ? briefLine(brief.data) : null,
    mandateId: id,
  });
  const delivered = await deliverEmail({ to: contactInbox(), ...notice, kind: "transactional" });
  if (!delivered.delivered) logEvent("mandate_notification_failed", { mandateId: id, reason: delivered.reason });

  const row = inserted as { id: string; status: string };
  return { created: true, mandate: { id: row.id, status: isMandateStatus(row.status) ? row.status : "open" } };
}

async function openMandateFor(admin: Admin, projectId: string): Promise<{ id: string; status: MandateStatus } | null> {
  const { data, error } = await admin
    .from("search_mandates")
    .select("id,status")
    .eq("project_id", projectId)
    .in("status", [...OPEN_MANDATE_STATUSES])
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { id: string; status: string };
  return { id: row.id, status: isMandateStatus(row.status) ? row.status : "open" };
}

/** Der offene Auftrag zu einem Projekt, für die Anzeige im Chat. */
export async function openMandateForProject(projectId: string, userId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("search_mandates")
    .select("id,status")
    .eq("project_id", projectId)
    .eq("owner_user_id", userId)
    .in("status", [...OPEN_MANDATE_STATUSES])
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; status: MandateStatus } | null;
}

export type MandateCandidate = {
  profileId: string;
  displayName: string;
  role: string;
  /** Kernabdeckung laut Matching; `null` für einen Profilvorschlag ohne Abgleich. */
  coverage: number | null;
  partial: boolean;
};

export type MandateWithWork = Mandate & {
  candidates: MandateCandidate[];
  /** Anfragen, die aus diesem Auftrag schon entstanden sind. */
  requests: Array<{ id: string; status: string; freelancerName: string }>;
};

/**
 * Suchaufträge für den Admin, die offenen zuerst, mit Kandidaten aus dem
 * Matching: Treffer und Teiltreffer, höchstens fünf. Kein Modellaufruf —
 * der gespeicherte Brief wird gegen den aktuellen Bestand gerechnet.
 */
export type ProfileOption = { id: string; displayName: string; role: string };

export async function listMandates(
  limit = 50,
): Promise<{ mandates: MandateWithWork[]; profileOptions: ProfileOption[] }> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("search_mandates")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { mandates: [], profileOptions: [] };

  const projectIds = [...new Set(rows.map((row) => String(row.project_id)))];
  const ownerIds = [...new Set(rows.map((row) => String(row.owner_user_id)))];
  const [projects, bookings, profiles, owners] = await Promise.all([
    admin.from("projects").select("id,title,structured_brief").in("id", projectIds),
    admin
      .from("intro_bookings")
      .select("id,project_id,status,freelancer_profile_id,requested_at")
      .in("project_id", projectIds),
    fetchActiveBookableRealProfiles(admin),
    Promise.all(
      ownerIds.map(async (id) => {
        const { data: user } = await admin.auth.admin.getUserById(id);
        return [id, Boolean(user.user?.is_anonymous)] as const;
      }),
    ),
  ]);
  if (projects.error) throw projects.error;
  if (bookings.error) throw bookings.error;
  const guestById = new Map(owners);
  const projectById = new Map(((projects.data ?? []) as Row[]).map((row) => [String(row.id), row]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const bookingRows = (bookings.data ?? []) as Row[];

  const mandates = rows.map((row) => {
    const project = projectById.get(String(row.project_id));
    const parsed = ProjectBriefSchema.safeParse(project?.structured_brief);
    const status: MandateStatus = isMandateStatus(row.status) ? row.status : "open";
    const createdAt = String(row.created_at);
    const requests = bookingRows
      .filter((booking) => booking.project_id === row.project_id && String(booking.requested_at) >= createdAt)
      .map((booking) => ({
        id: String(booking.id),
        status: String(booking.status),
        freelancerName: profileById.get(String(booking.freelancer_profile_id))?.displayName ?? "Freelancer",
      }));
    const requested = new Set(bookingRows.filter((booking) => booking.project_id === row.project_id).map((booking) => String(booking.freelancer_profile_id)));
    const candidates =
      parsed.success && (OPEN_MANDATE_STATUSES as readonly string[]).includes(status)
        ? candidatesFor(parsed.data, profiles, requested)
        : [];
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      projectTitle: text(project?.title),
      briefSummary: parsed.success ? briefLine(parsed.data) : null,
      contactEmail: String(row.contact_email),
      contactCompany: text(row.contact_company),
      contactName: text(row.contact_name),
      contactPhone: text(row.contact_phone),
      note: text(row.note),
      guest: guestById.get(String(row.owner_user_id)) ?? false,
      status,
      termsVersion: String(row.terms_version),
      createdAt,
      handledAt: text(row.handled_at),
      candidates,
      requests,
    };
  });
  const profileOptions = profiles
    .map((profile) => ({ id: profile.id, displayName: profile.displayName, role: profile.role }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "de-DE"));
  return { mandates, profileOptions };
}

function candidatesFor(
  brief: Parameters<typeof buildShortlist>[0],
  profiles: readonly FreelancerProfile[],
  alreadyRequested: ReadonlySet<string>,
): MandateCandidate[] {
  try {
    const shortlist = buildShortlist(brief, [...profiles]);
    return [
      ...shortlist.matches.map((match) => ({ match, partial: false })),
      ...shortlist.partialMatches.map((match) => ({ match, partial: true })),
    ]
      .filter(({ match }) => !alreadyRequested.has(match.profile.id))
      .slice(0, 5)
      .map(({ match, partial }) => ({
        profileId: match.profile.id,
        displayName: match.profile.displayName,
        role: match.profile.role,
        coverage: typeof match.coreCoverage === "number" ? match.coreCoverage : null,
        partial,
      }));
  } catch (error) {
    logEvent("mandate_candidates_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return [];
  }
}

/** Offene Aufträge, für „Zu erledigen“ in der Übersicht. */
export async function countOpenMandates(): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin
    .from("search_mandates")
    .select("id", { count: "exact", head: true })
    .in("status", [...OPEN_MANDATE_STATUSES]);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Ordnet einem Auftrag einen Freelancer zu. Daraus wird eine gewöhnliche
 * Anfrage (`manual_review`), die der Betreiber unter „Vermittlungen“ wie jede
 * andere vorstellt — mit dem Zeitpunkt der Zustimmung aus dem Auftrag.
 */
export async function assignFreelancer(
  mandateId: string,
  profileId: string,
  adminId: string,
): Promise<{ requestId: string }> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("search_mandates").select(COLUMNS).eq("id", mandateId).maybeSingle();
  if (error) throw error;
  if (!data) throw jsonResponse(404, "Suchauftrag nicht gefunden.");
  const mandate = data as Row;
  if (!(OPEN_MANDATE_STATUSES as readonly string[]).includes(String(mandate.status))) {
    throw jsonResponse(409, "Dieser Suchauftrag ist schon abgeschlossen.");
  }

  const { data: profile, error: profileError } = await admin
    .from("freelancer_profiles")
    .select("id,profile_status,availability_status")
    .eq("id", profileId)
    .eq("profile_status", "active")
    .neq("availability_status", "unavailable")
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw jsonResponse(409, "Dieses Profil ist aktuell nicht verfügbar.");

  const { data: existing, error: existingError } = await admin
    .from("intro_bookings")
    .select("id")
    .eq("project_id", String(mandate.project_id))
    .eq("freelancer_profile_id", profileId)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) throw jsonResponse(409, "Dieser Freelancer ist für das Projekt schon angefragt.");

  const requestId = randomUUID();
  const { error: insertError } = await admin.from("intro_bookings").insert({
    id: requestId,
    commercial_model: "legacy_placement",
    legacy_mandate_id: mandateId,
    project_id: String(mandate.project_id),
    owner_user_id: String(mandate.owner_user_id),
    freelancer_profile_id: profileId,
    match_id: null,
    intro_policy_snapshot: "manual_approval",
    status: "manual_review",
    booking_provider: "manual",
    booking_url: null,
    idempotency_key: `mandate:${mandateId}:${profileId}`,
    // Zugestimmt hat der Kunde mit dem Suchauftrag, nicht mit der Zuordnung.
    explicit_confirmation_at: String(mandate.created_at),
    contact_email: String(mandate.contact_email),
    contact_company: text(mandate.contact_company),
    contact_name: text(mandate.contact_name),
  });
  if (insertError) throw insertError;

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("search_mandates")
    .update({ status: "in_progress", handled_by: adminId, handled_at: now, updated_at: now })
    .eq("id", mandateId);
  if (updateError) throw updateError;

  await writeAuditEvent({
    actorUserId: adminId,
    action: "search_mandate_assigned",
    targetType: "search_mandate",
    targetId: mandateId,
    outcome: "success",
    metadata: { requestId },
  });
  return { requestId };
}

export async function updateMandateStatus(mandateId: string, status: MandateStatus, adminId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("search_mandates")
    .update({ status, handled_by: adminId, handled_at: now, updated_at: now })
    .eq("id", mandateId)
    .select("id");
  if (error) throw error;
  const updated = Boolean(data?.length);
  if (updated) {
    await writeAuditEvent({
      actorUserId: adminId,
      action: "search_mandate_status_changed",
      targetType: "search_mandate",
      targetId: mandateId,
      outcome: "success",
      metadata: { status },
    });
  }
  return updated;
}
