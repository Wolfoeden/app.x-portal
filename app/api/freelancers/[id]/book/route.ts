import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { appPath } from "@/lib/app-path";
import { isAllowedBookingHost } from "@/lib/freelancer/booking-hosts";
import {
  loadBookingDestination,
  recordFreelancerProfileEvent,
} from "@/lib/freelancer/profile-data";
import {
  getClientIp,
  pseudonymizeIp,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await context.params;
    const parsed = IdSchema.safeParse(rawId);
    if (!parsed.success) return new Response("Nicht gefunden.", { status: 404 });

    const destination = await loadBookingDestination(parsed.data);
    if (!destination) return new Response("Nicht gefunden.", { status: 404 });

    const ipHash = pseudonymizeIp(getClientIp(request));
    const limit = await consumeRateLimit(
      `freelancer-book:${ipHash}`,
      60,
      60 * 60_000,
    );
    if (limit.allowed) {
      // Analytics must never block the freelancer's actual booking journey.
      void recordFreelancerProfileEvent({
        eventKey: randomUUID(),
        profileId: parsed.data,
        eventType: "booking_click",
        source: "booking_link",
      }).catch(() => undefined);
    }
    // Ein bekannter Buchungsdienst wird direkt erreicht. Alles andere geht
    // über eine Seite, die das Ziel zeigt, statt dass x-portal.eu als
    // Weiterleiter für eine fremde Adresse einsteht.
    if (isAllowedBookingHost(destination.url)) {
      return NextResponse.redirect(destination.url, 302);
    }

    return NextResponse.redirect(
      new URL(appPath(`/booking/${parsed.data}`), request.url),
      302,
    );
  } catch {
    return new Response("Buchungslink vorübergehend nicht verfügbar.", {
      status: 503,
    });
  }
}
