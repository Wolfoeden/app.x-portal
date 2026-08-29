import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { applicationOrigin } from "@/lib/auth/redirect";
import { deliverEmail } from "@/lib/email/deliver";
import {
  confirmationExpiresAt,
  confirmationMessage,
  confirmationUrl,
  mintConfirmationToken,
} from "@/lib/whitelist/confirmation";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
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

/**
 * `joined` heißt: Bestätigungsmail ist unterwegs. `pending` heißt: der Eintrag
 * ist notiert, aber es ging keine Mail raus — solange kein E-Mail-Anbieter
 * angebunden ist, ist das der reguläre Fall. Die Unterscheidung existiert,
 * damit die Seite nicht etwas zusagt, das nicht passiert ist.
 */
function landingUrl(request: Request, state: "joined" | "pending" | "error") {
  const url = new URL(appPath("/cardano"), request.url);
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
    const limit = await consumeRateLimit(`whitelist:${ipHash}`, 5, 15 * 60_000);
    if (!limit.allowed) {
      return NextResponse.redirect(landingUrl(request, "error"), {
        status: 303,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    const admin = createAdminSupabaseClient();

    // Eine bereits bestätigte Adresse wird nicht auf "pending" zurückgesetzt.
    // Sonst könnte ein Dritter mit einer fremden Adresse eine bestehende
    // Einwilligung entwerten.
    const { data: existing, error: lookupError } = await admin
      .from("whitelist_leads")
      .select("id,status")
      .eq("email", parsed.data.email)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing?.status === "confirmed") {
      await writeAuditEvent({
        actorUserId: null,
        action: "whitelist_request_already_confirmed",
        targetType: "whitelist_lead",
        targetId: existing.id,
        outcome: "success",
        traceId,
      });
      return NextResponse.redirect(landingUrl(request, "joined"), 303);
    }

    const now = new Date();
    const { token, hash } = mintConfirmationToken();
    const { data, error } = await admin
      .from("whitelist_leads")
      .upsert(
        {
          full_name: parsed.data.fullName,
          email: parsed.data.email,
          country: parsed.data.country,
          // Die abgegebene Erklärung. Der Nachweis entsteht erst mit der
          // Bestätigung — siehe confirmed_at.
          consent_at: now.toISOString(),
          source: "home",
          status: "pending",
          confirmation_token_hash: hash,
          confirmation_expires_at: confirmationExpiresAt(now).toISOString(),
          confirmed_at: null,
        },
        { onConflict: "email" },
      )
      .select("id")
      .single();
    if (error) throw error;

    const message = confirmationMessage({
      fullName: parsed.data.fullName,
      confirmUrl: confirmationUrl(applicationOrigin(request), token),
    });
    const delivery = await deliverEmail({ to: parsed.data.email, ...message });

    if (delivery.delivered) {
      await admin
        .from("whitelist_leads")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", data.id);
    }

    await writeAuditEvent({
      actorUserId: null,
      action: "whitelist_request_saved",
      targetType: "whitelist_lead",
      targetId: data.id,
      outcome: "success",
      traceId,
      metadata: { source: "home", confirmation_sent: delivery.delivered },
    });

    return NextResponse.redirect(
      landingUrl(request, delivery.delivered ? "joined" : "pending"),
      303,
    );
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
