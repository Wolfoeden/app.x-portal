import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAllowedBookingHost } from "@/lib/freelancer/booking-hosts";
import { placementRequestsEnabled } from "@/lib/placement/config";
import { placementBookingAllowed } from "@/lib/placement/requests";
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

    // Im Vermittlungsmodell öffnet sich der Kalender erst nach der
    // Vorstellung. Wer vorher hier landet — aus einem alten Link, einer
    // Lead-Mail oder von Hand —, wird zur Anfrage geschickt.
    if (placementRequestsEnabled()) {
      const user = await getCurrentUser().catch(() => null);
      if (!(await placementBookingAllowed(user, parsed.data))) {
        return NextResponse.redirect(
          new URL(appPath("/chat?booking=request"), request.url),
          302,
        );
      }
    }

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
      // Der Link aus der Akquise-Mail trägt `via=lead`. Das Profilereignis
      // kennt nur eine Quelle, deshalb steht die Zuordnung zur Mail im
      // Protokoll: so zeigt sich, ob die Mails zu Terminen führen.
      if (new URL(request.url).searchParams.get("via") === "lead") {
        void writeAuditEvent({
          actorUserId: null,
          action: "lead_email_booking_click",
          targetType: "freelancer_profile",
          targetId: parsed.data,
          outcome: "success",
        }).catch(() => undefined);
      }
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
