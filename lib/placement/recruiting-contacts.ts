import "server-only";
import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@/lib/auth/current-user";
import { writeAuditEvent } from "@/lib/audit/write";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assertWorkflowOperationAllowed } from "@/lib/domain/workflow-controls";
import { mintContactToken } from "./contact-token";
import { dispatchRecruitingContact } from "./contact-delivery";
import { consentingFreelancerEmail } from "./recruiting-recipient";
export { consentingFreelancerEmail } from "./recruiting-recipient";
import { findShownProfile } from "./shown-profile";

type ContactRow = { id: string; status: string; requested_at: string; commercial_model: string; booking_url: string | null; contact_delivery_status: string | null };
const COLUMNS = "id,status,requested_at,commercial_model,booking_url,contact_delivery_status";

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

export async function createRecruitingContact(input: { projectId: string; profileId: string; idempotencyKey: string; user: CurrentUser; siteUrl: string; retryDelivery?: boolean }) {
  const admin = createAdminSupabaseClient();
  const owner = await admin.auth.admin.getUserById(input.user.id);
  if (owner.error) throw owner.error;
  if (!owner.data.user?.email_confirmed_at) throw new Response("Bestätigen Sie zuerst Ihre Konto-E-Mail.", { status: 403 });
  const { data: project, error: projectError } = await admin.from("projects").select("id,title,original_request,structured_brief")
    .eq("id", input.projectId).eq("owner_user_id", input.user.id).maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw new Response("Projekt nicht gefunden.", { status: 404 });
  const source = typeof project.structured_brief?.originalRequest === "string" ? project.structured_brief.originalRequest : project.original_request || "";
  assertWorkflowOperationAllowed(source, "contact");
  const shown = await findShownProfile(admin, { projectId: input.projectId, profileId: input.profileId, ownerUserId: input.user.id });
  if (!shown) throw new Response("Dieses Profil gehört nicht zur angezeigten Auswahl.", { status: 409 });
  const existingFor = () => admin.from("intro_bookings").select(COLUMNS).eq("owner_user_id", input.user.id)
    .eq("project_id", input.projectId).eq("freelancer_profile_id", input.profileId)
    .neq("status", "cancelled").order("requested_at", { ascending: false }).limit(1).maybeSingle();
  const existing = await existingFor();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (input.retryDelivery && existing.data.commercial_model === "no_fee") {
      await dispatchRecruitingContact(existing.data.id, input.siteUrl);
      const refreshed = await existingFor();
      if (refreshed.error) throw refreshed.error;
      if (refreshed.data) return response(refreshed.data as ContactRow, false);
    }
    return response(existing.data as ContactRow, false);
  }
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
    await dispatchRecruitingContact(id, input.siteUrl);
    const refreshed = await existingFor();
    if (refreshed.error) throw refreshed.error;
    if (refreshed.data) return response(refreshed.data as ContactRow, true);
  }
  return response(row, true);
}
