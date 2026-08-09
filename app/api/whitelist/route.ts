import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { takeRateLimit } from "@/lib/security/rate-limit";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
} from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const WhitelistSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(160),
    country: z.string().trim().min(2).max(80),
    consent: z.literal("yes"),
    website: z.string().max(200).optional().default(""),
  })
  .strict();

function landingUrl(request: Request, state: "joined" | "error") {
  const url = new URL("/home", request.url);
  url.searchParams.set(state, "1");
  url.hash = "access";
  return url;
}

export async function POST(request: NextRequest) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 12_000) {
      return new Response("Request body too large", { status: 413 });
    }

    const formData = await request.formData();
    const parsed = WhitelistSchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? "").toLocaleLowerCase("en-US"),
      country: String(formData.get("country") ?? ""),
      consent: String(formData.get("consent") ?? ""),
      website: String(formData.get("website") ?? ""),
    });
    if (!parsed.success) {
      return NextResponse.redirect(landingUrl(request, "error"), 303);
    }

    if (parsed.data.website) {
      return NextResponse.redirect(landingUrl(request, "joined"), 303);
    }

    const ipHash = pseudonymizeIp(getClientIp(request));
    const limit = takeRateLimit(`whitelist:${ipHash}`, 5, 15 * 60_000);
    if (!limit.allowed) {
      return NextResponse.redirect(landingUrl(request, "error"), {
        status: 303,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    const admin = createAdminSupabaseClient();
    const consentAt = new Date().toISOString();
    const { data, error } = await admin
      .from("whitelist_leads")
      .upsert(
        {
          full_name: parsed.data.fullName,
          email: parsed.data.email,
          country: parsed.data.country,
          consent_at: consentAt,
          source: "home",
        },
        { onConflict: "email" },
      )
      .select("id")
      .single();
    if (error) throw error;

    await writeAuditEvent({
      actorUserId: null,
      action: "whitelist_request_saved",
      targetType: "whitelist_lead",
      targetId: data.id,
      outcome: "success",
      traceId,
      metadata: { source: "home" },
    });

    return NextResponse.redirect(landingUrl(request, "joined"), 303);
  } catch (error) {
    if (error instanceof Response) return error;
    await writeAuditEvent({
      actorUserId: null,
      action: "whitelist_request_failed",
      targetType: "whitelist_lead",
      outcome: "failed",
      traceId,
    }).catch(() => undefined);
    return NextResponse.redirect(landingUrl(request, "error"), 303);
  }
}
