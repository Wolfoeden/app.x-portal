import "server-only";
import { deliverEmail } from "@/lib/email/deliver";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/security/request";
import { assertWorkflowOperationAllowed } from "@/lib/domain/workflow-controls";
import { contactAcceptedMessage, freelancerContactRequest } from "./recruiting-messages";
import { mintContactToken } from "./contact-token";
import { consentingFreelancerEmail } from "./recruiting-recipient";

type Delivery = {
  id: string; kind: "consent_request" | "confirmation_client" | "confirmation_freelancer";
  lease_token: string; recipient_email: string | null;
  payload: { projectTitle: string | null; counterpartEmail: string; counterpartName: string; bookingUrl?: string | null };
};

/** User-triggered dispatch. No background cold outreach or automatic bulk send. */
export async function dispatchRecruitingContact(requestId: string, siteUrl: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { data: rows, error } = await admin.from("recruiting_contact_deliveries").select("id")
    .eq("intro_booking_id", requestId).in("status", ["pending", "failed", "sending"]);
  if (error) throw error;
  for (const item of rows ?? []) {
    const claimed = await admin.rpc("claim_recruiting_contact_delivery", { p_id: item.id });
    if (claimed.error) throw claimed.error;
    const delivery = (claimed.data as Delivery[] | null)?.[0];
    if (!delivery) continue;
    let recipient = delivery.recipient_email;
    let message: { subject: string; text: string };
    let failure: string | null = null;
    try {
      if (delivery.kind === "consent_request") {
        const intro = await admin.from("intro_bookings").select("project_id,freelancer_profile_id,status,commercial_model").eq("id", requestId).maybeSingle();
        if (intro.error) throw intro.error;
        if (!intro.data || intro.data.status !== "requested" || intro.data.commercial_model !== "no_fee") throw new Response("Anfrage nicht mehr offen.", { status: 409 });
        const [project, profile] = await Promise.all([
          admin.from("projects").select("title,original_request,structured_brief").eq("id", intro.data.project_id).maybeSingle(),
          admin.from("freelancer_profiles").select("display_name,owner_user_id,profile_status").eq("id", intro.data.freelancer_profile_id).maybeSingle(),
        ]);
        if (project.error || profile.error) throw project.error || profile.error;
        if (!project.data || !profile.data || profile.data.profile_status !== "active") throw new Error("contact_unavailable");
        const source = project.data.structured_brief?.originalRequest || project.data.original_request || "";
        assertWorkflowOperationAllowed(source, "contact");
        recipient = await consentingFreelancerEmail(admin, intro.data.freelancer_profile_id, profile.data.owner_user_id);
        const token = recipient ? mintContactToken(requestId, Date.now(), recipient) : null;
        if (!recipient || !token) throw new Error("contact_unavailable");
        const url = new URL("/kontaktfreigabe", siteUrl); url.searchParams.set("t", token);
        message = freelancerContactRequest({ projectTitle: project.data.title, freelancerName: profile.data.display_name, consentUrl: url.toString() });
      } else message = contactAcceptedMessage(delivery.payload);
      if (!recipient) throw new Error("contact_unavailable");
      const sent = await deliverEmail({ to: recipient, ...message, kind: "transactional" });
      failure = sent.delivered ? null : sent.reason;
    } catch { failure = "contact_unavailable"; }
    const finished = await admin.from("recruiting_contact_deliveries").update({
      status: failure ? "failed" : "sent", sent_at: failure ? null : new Date().toISOString(),
      last_error: failure, lease_token: null, lease_until: null,
    }).eq("id", delivery.id).eq("lease_token", delivery.lease_token).eq("status", "sending");
    if (finished.error) throw finished.error;
    if (delivery.kind === "consent_request") {
      const saved = await admin.from("intro_bookings").update({ contact_delivery_status: failure ? "failed" : "sent", contact_delivered_at: failure ? null : new Date().toISOString() })
        .eq("id", requestId).eq("status", "requested");
      if (saved.error) throw saved.error;
    }
    if (failure) logEvent("recruiting_contact_delivery_failed", { requestId, kind: delivery.kind, reason: failure });
  }
}

/** Called only after the route checked row ownership and recorded consent. */
export async function approvedRecruitingContact(requestId: string) {
  const { data, error } = await createAdminSupabaseClient().from("recruiting_contact_deliveries")
    .select("payload").eq("intro_booking_id", requestId).eq("kind", "confirmation_client").maybeSingle();
  if (error) throw error;
  const payload = data?.payload as Delivery["payload"] | undefined;
  return payload ? { email: payload.counterpartEmail, name: payload.counterpartName, bookingUrl: payload.bookingUrl || null } : null;
}
