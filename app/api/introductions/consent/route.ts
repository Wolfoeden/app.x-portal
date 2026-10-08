import { NextResponse } from "next/server";
import { z } from "zod";
import { consentingFreelancerEmail } from "@/lib/placement/recruiting-contacts";
import { contactRecipientHash, readContactToken } from "@/lib/placement/contact-token";
import { dispatchRecruitingContact } from "@/lib/placement/contact-delivery";
import { assertWorkflowOperationAllowed } from "@/lib/domain/workflow-controls";
import { assertSameOrigin, readJsonWithLimit, getClientIp, pseudonymizeIp } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const Input = z.object({ token: z.string().min(10).max(200), decision: z.enum(["accept", "decline"]) }).strict();

async function describe(token: string | null) {
  const parsed = readContactToken(token);
  if (!parsed) throw new Response("Dieser Link ist ungültig oder abgelaufen.", { status: 404 });
  const admin = createAdminSupabaseClient();
  const { data: row, error } = await admin.from("intro_bookings")
    .select("id,status,owner_user_id,project_id,freelancer_profile_id,commercial_model")
    .eq("id", parsed.requestId).eq("commercial_model", "no_fee").maybeSingle();
  if (error) throw error;
  if (!row) throw new Response("Anfrage nicht gefunden.", { status: 404 });
  const [profile, project] = await Promise.all([
    admin.from("freelancer_profiles").select("display_name,owner_user_id,booking_url,profile_status").eq("id", row.freelancer_profile_id).maybeSingle(),
    admin.from("projects").select("title,original_request,structured_brief").eq("id", row.project_id).maybeSingle(),
  ]);
  if (profile.error || project.error) throw profile.error || project.error;
  if (!profile.data || profile.data.profile_status !== "active") throw new Response("Profil nicht verfügbar.", { status: 409 });
  const recipient = await consentingFreelancerEmail(admin, row.freelancer_profile_id, profile.data.owner_user_id);
  if (!recipient || contactRecipientHash(recipient) !== parsed.recipientHash) throw new Response("Die Kontaktadresse hat sich geändert. Dieser Link ist nicht mehr gültig.", { status: 409 });
  return { admin, row, profile: profile.data, project: project.data, recipient };
}

export async function GET(request: Request) {
  try {
    const result = await describe(new URL(request.url).searchParams.get("t"));
    return NextResponse.json({ projectTitle: result.project?.title || null, freelancerName: result.profile.display_name, status: result.row.status, commercialModel: "no_fee" }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Die Anfrage kann gerade nicht geladen werden." }, { status: 503, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = await consumeRateLimit(`recruiting-consent:${pseudonymizeIp(getClientIp(request))}`, 30, 60 * 60_000);
    if (!limit.allowed) return new Response("Bitte versuchen Sie es später erneut.", { status: 429 });
    const input = Input.parse(await readJsonWithLimit(request, 1_000));
    const { admin, row, profile, project, recipient } = await describe(input.token);
    if (row.status !== "requested") return NextResponse.json({ recorded: false, status: row.status }, { headers: NO_STORE });
    const accepting = input.decision === "accept";
    if (accepting) assertWorkflowOperationAllowed(project?.structured_brief?.originalRequest || project?.original_request || "", "contact");
    const { data: client, error: clientError } = await admin.auth.admin.getUserById(row.owner_user_id);
    if (clientError) throw clientError;
    if (accepting && (!client.user?.email_confirmed_at || !client.user.email)) throw new Response("Das Konto der anfragenden Person ist nicht mehr bestätigt.", { status: 409 });
    const calendar = /^https:\/\//u.test(profile.booking_url || "") ? profile.booking_url : null;
    const { data, error } = await admin.rpc("respond_recruiting_contact", {
      p_id: row.id, p_accept: accepting, p_client_email: client.user?.email || null,
      p_freelancer_email: recipient, p_freelancer_name: profile.display_name,
      p_project_title: project?.title || null, p_booking_url: calendar,
    });
    if (error) throw error;
    if (!data) return NextResponse.json({ recorded: false }, { headers: NO_STORE });
    if (accepting) await dispatchRecruitingContact(row.id, SITE_URL);
    return NextResponse.json({ recorded: true, status: accepting ? "ready_to_book" : "cancelled" }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Die Freigabe konnte gerade nicht gespeichert werden." }, { status: error instanceof z.ZodError ? 400 : 503, headers: NO_STORE });
  }
}
