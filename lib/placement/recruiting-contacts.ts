import "server-only";
import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@/lib/auth/current-user";
import { writeAuditEvent } from "@/lib/audit/write";
import { deliverEmail } from "@/lib/email/deliver";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/security/request";
import { mintContactToken } from "./contact-token";
import { freelancerContactRequest } from "./recruiting-messages";
import { findShownProfile } from "./shown-profile";

type Admin = ReturnType<typeof createAdminSupabaseClient>;
type ContactRow = { id: string; status: string; requested_at: string; commercial_model: string; booking_url: string | null; contact_delivery_status: string | null };
const COLUMNS = "id,status,requested_at,commercial_model,booking_url,contact_delivery_status";

/** Imported addresses are excluded unless a published application has consent. */
export async function consentingFreelancerEmail(admin: Admin, profileId: string, ownerId: string | null): Promise<string | null> {
  if (ownerId) {
    const { data, error } = await admin.auth.admin.getUserById(ownerId);
    if (error) throw error;
    return data.user?.email_confirmed_at ? data.user.email?.trim() || null : null;
  }
  const { data, error } = await admin.from("freelancer_applications").select("contact_email")
    .eq("published_profile_id", profileId).eq("status", "approved").not("consent_at", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.contact_email?.trim() || null;
}

function response(row: ContactRow, created: boolean) {
  return {
    created,
    introduction: { id: row.id, status: row.status, requestedAt: row.requested_at, commercialModel: row.commercial_model, bookingUrl: row.booking_url, emailDelivery: row.contact_delivery_status },
    message: row.commercial_model === "legacy_placement"
      ? "Für dieses Profil liegt bereits eine historische Anfrage vor. Deren vereinbarte Bedingungen bleiben bestehen."
      : row.status === "ready_to_book"
        ? "Der freigegebene Kalender ist verfügbar. Aktuelle Verfügbarkeit bitte direkt abstimmen. Für diesen Vorgang fällt keine Vermittlungsgebühr an."
        : row.contact_delivery_status === "failed"
          ? "Die Anfrage ist gespeichert, die Benachrichtigung konnte jedoch nicht zugestellt werden. Interesse und Verfügbarkeit sind unbestätigt."
          : "Ihre gezielte Kontaktanfrage wurde gespeichert. Der Freelancer entscheidet selbst über die Freigabe. Interesse und Verfügbarkeit sind noch unbestätigt; es fällt keine Vermittlungsgebühr an.",
  };
}

export async function createRecruitingContact(input: { projectId: string; profileId: string; idempotencyKey: string; user: CurrentUser; siteUrl: string }) {
  const admin = createAdminSupabaseClient();
  const { data: project, error: projectError } = await admin.from("projects").select("id,title")
    .eq("id", input.projectId).eq("owner_user_id", input.user.id).maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw new Response("Projekt nicht gefunden.", { status: 404 });
  const shown = await findShownProfile(admin, { projectId: input.projectId, profileId: input.profileId, ownerUserId: input.user.id });
  if (!shown) throw new Response("Dieses Profil gehört nicht zur angezeigten Auswahl.", { status: 409 });
  const existingFor = () => admin.from("intro_bookings").select(COLUMNS).eq("owner_user_id", input.user.id)
    .eq("project_id", input.projectId).eq("freelancer_profile_id", input.profileId)
    .neq("status", "cancelled").order("requested_at", { ascending: false }).limit(1).maybeSingle();
  const existing = await existingFor();
  if (existing.error) throw existing.error;
  if (existing.data) return response(existing.data as ContactRow, false);
  const { data: profile, error: profileError } = await admin.from("freelancer_profiles")
    .select("id,display_name,owner_user_id,intro_policy,booking_url,demo_status")
    .eq("id", input.profileId).eq("profile_status", "active").neq("availability_status", "unavailable").maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.demo_status === "demo") throw new Response("Dieses Profil kann nicht angefragt werden.", { status: 409 });
  const direct = shown.profile.introPolicy.type === "free" && profile.intro_policy === "free" && /^https:\/\//u.test(profile.booking_url || "");
  const recipient = direct ? null : await consentingFreelancerEmail(admin, input.profileId, profile.owner_user_id);
  if (!direct && !recipient) throw new Response("Für dieses Profil liegt kein freigegebener Kontaktweg vor. Bearbeiten Sie Ihre Kriterien oder starten Sie ausdrücklich eine weitere Recherche.", { status: 409 });
  const id = randomUUID();
  const token = recipient ? mintContactToken(id, Date.now(), recipient) : null;
  if (!direct && !token) throw new Response("Der automatische Kontaktweg ist noch nicht konfiguriert.", { status: 503 });
  const timestamp = new Date().toISOString();
  const { data, error } = await admin.from("intro_bookings").insert({
    id, project_id: input.projectId, owner_user_id: input.user.id, freelancer_profile_id: input.profileId,
    match_id: shown.matchId, commercial_model: "no_fee",
    intro_policy_snapshot: direct ? "free" : "freelancer_consent", status: direct ? "ready_to_book" : "requested",
    booking_provider: direct ? "calendly" : null, booking_url: direct ? profile.booking_url : null,
    explicit_confirmation_at: timestamp, confirmed_at: direct ? timestamp : null,
    idempotency_key: input.idempotencyKey, contact_delivery_status: direct ? null : "pending",
  }).select(COLUMNS).single();
  if (error) {
    if (error.code === "23505") {
      const raced = await existingFor();
      if (raced.data) return response(raced.data as ContactRow, false);
    }
    throw error;
  }
  const row = data as ContactRow;
  await writeAuditEvent({ actorUserId: input.user.id, action: "recruiting_contact_requested", targetType: "intro_booking", targetId: id, outcome: "success", metadata: { commercialModel: "no_fee", contactConsent: true } });
  if (recipient && token) {
    const url = new URL("/kontaktfreigabe", input.siteUrl);
    url.searchParams.set("t", token);
    const delivered = await deliverEmail({ to: recipient, ...freelancerContactRequest({ projectTitle: project.title, freelancerName: profile.display_name, consentUrl: url.toString() }), kind: "transactional" });
    row.contact_delivery_status = delivered.delivered ? "sent" : "failed";
    const saved = await admin.from("intro_bookings").update({ contact_delivery_status: row.contact_delivery_status, contact_delivered_at: delivered.delivered ? new Date().toISOString() : null }).eq("id", id);
    if (saved.error) throw saved.error;
    if (!delivered.delivered) logEvent("recruiting_contact_delivery_failed", { requestId: id, reason: delivered.reason });
  }
  return response(row, true);
}
