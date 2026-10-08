import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { userHasRecruitingAccess } from "@/lib/billing/entitlements";
import { createRecruitingContact } from "@/lib/placement/recruiting-contacts";
import { approvedRecruitingContact } from "@/lib/placement/contact-delivery";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { SITE_URL } from "@/lib/seo";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const InputSchema = z.object({
  projectId: z.string().uuid(), profileId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(160),
  contactConsent: z.literal(true),
  retryDelivery: z.boolean().optional(),
  placementTermsVersion: z.string().max(80).optional(),
}).strict();

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const params = new URL(request.url).searchParams;
    const projectId = z.string().uuid().parse(params.get("projectId"));
    const profileId = z.string().uuid().parse(params.get("profileId"));
    const { data, error } = await createAdminSupabaseClient().from("intro_bookings")
      .select("id,status,requested_at,confirmed_at,commercial_model,contact_delivery_status,freelancer_consented_at")
      .eq("owner_user_id", user.id).eq("project_id", projectId).eq("freelancer_profile_id", profileId)
      .order("requested_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const contact = data?.commercial_model === "no_fee" && data.freelancer_consented_at && data.status !== "cancelled" ? await approvedRecruitingContact(data.id) : null;
    let deliveryNeedsRetry = false;
    if (data?.commercial_model === "no_fee" && data.status !== "cancelled") {
      const deliveries = await createAdminSupabaseClient().from("recruiting_contact_deliveries")
        .select("id").eq("intro_booking_id", data.id).in("status", ["pending", "failed"]).limit(1);
      if (deliveries.error) throw deliveries.error;
      deliveryNeedsRetry = Boolean(deliveries.data?.length);
    }
    return NextResponse.json({ introduction: data ? {
      id: data.id, status: data.status, requestedAt: data.requested_at, confirmedAt: data.confirmed_at,
      commercialModel: data.commercial_model, emailDelivery: data.contact_delivery_status,
      contact, deliveryNeedsRetry,
    } : null }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Der Stand der Anfrage ist gerade nicht abrufbar." }, { status: error instanceof z.ZodError ? 400 : 503, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = InputSchema.parse(await readJsonWithLimit(request, 4_000));
    const user = await requireCurrentUser();
    if (user.isAnonymous || !user.email) throw new Response("Bitte melden Sie sich mit einem bestätigten Konto an.", { status: 401 });
    if (!user.isAdmin && !(await userHasRecruitingAccess(user.id))) throw new Response("Für neue Kontaktanfragen benötigen Sie eine aktive Testphase oder einen berechtigten Tarif.", { status: 402 });
    const limit = await consumeRateLimit(`recruiting-contact:${user.id}`, 10, 60 * 60_000);
    if (!limit.allowed) return NextResponse.json({ error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } });
    const result = await createRecruitingContact({ ...input, user, siteUrl: SITE_URL });
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error instanceof z.ZodError ? "Bitte bestätigen Sie die Kontaktfreigabe und prüfen Sie Ihre Auswahl." : "Die Kontaktanfrage konnte gerade nicht gespeichert werden." }, { status: error instanceof z.ZodError ? 400 : 503, headers: NO_STORE });
  }
}
