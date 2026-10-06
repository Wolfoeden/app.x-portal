import { NextResponse } from "next/server";
import { z } from "zod";

import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { placementRequestsEnabled } from "@/lib/placement/config";
import { placementBookingAllowed } from "@/lib/placement/requests";
import { contactLinkTarget, isContactLinkKind } from "@/lib/profile/contact-links";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * LinkedIn oder GitHub eines Freelancers, aus dem Kurzlink auf der Karte.
 *
 * Wie der Kalender (`../book`): im Vermittlungsmodell mit bezahltem Tarif,
 * nach einer Vorstellung durch den Betreiber oder als Betreiber; ohne das
 * Modell mit Konto. Alle anderen — und jeder Aufruf ohne hinterlegten Link —
 * landen bei „Gespräch buchen“ mit diesem Profil.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const parsed = IdSchema.safeParse(rawId);
  if (!parsed.success) return new Response("Nicht gefunden.", { status: 404, headers: NO_STORE });
  const profileId = parsed.data;
  const kind = new URL(request.url).searchParams.get("kind");
  const fallback = () =>
    NextResponse.redirect(new URL(appPath(`/gespraech?von=profile&profil=${profileId}`), request.url), {
      status: 302,
      headers: NO_STORE,
    });
  if (!isContactLinkKind(kind)) return fallback();

  try {
    const user = await getCurrentUser().catch(() => null);
    if (!user || user.isAnonymous) return fallback();
    if (placementRequestsEnabled() && !(await placementBookingAllowed(user, profileId))) return fallback();

    const limit = await consumeRateLimit(`freelancer-link:${user.id}`, 60, 60 * 60_000);
    if (!limit.allowed) {
      return new Response("Zu viele Aufrufe. Bitte versuchen Sie es später erneut.", {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    const { data, error } = await createAdminSupabaseClient()
      .from("freelancer_profiles")
      .select("profile_links")
      .eq("id", profileId)
      .eq("profile_status", "active")
      .maybeSingle();
    if (error) throw error;
    const target = contactLinkTarget((data as { profile_links?: unknown } | null)?.profile_links, kind);
    if (!target) return fallback();

    void writeAuditEvent({
      actorUserId: user.id,
      action: "freelancer_link_opened",
      targetType: "freelancer_profile",
      targetId: profileId,
      outcome: "success",
      metadata: { kind },
    }).catch(() => undefined);
    return NextResponse.redirect(target, { status: 302, headers: NO_STORE });
  } catch {
    return new Response("Der Link ist vorübergehend nicht verfügbar.", { status: 503, headers: NO_STORE });
  }
}
