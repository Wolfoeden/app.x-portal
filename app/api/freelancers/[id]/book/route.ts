import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  loadBookingDestination,
  recordFreelancerProfileEvent,
} from "@/lib/freelancer/profile-data";
import { takeRateLimit } from "@/lib/security/rate-limit";
import {
  getClientIp,
  pseudonymizeIp,
} from "@/lib/security/request";

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
    const limit = takeRateLimit(`freelancer-book:${ipHash}`, 60, 60 * 60_000);
    if (limit.allowed) {
      // Analytics must never block the freelancer's actual booking journey.
      void recordFreelancerProfileEvent({
        eventKey: randomUUID(),
        profileId: parsed.data,
        eventType: "booking_click",
        source: "booking_link",
      }).catch(() => undefined);
    }
    return NextResponse.redirect(destination, 302);
  } catch {
    return new Response("Buchungslink vorübergehend nicht verfügbar.", {
      status: 503,
    });
  }
}
