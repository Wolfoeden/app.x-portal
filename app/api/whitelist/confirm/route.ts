import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  hashConfirmationToken,
  isConfirmationTokenShape,
} from "@/lib/whitelist/confirmation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bestätigt eine Whitelist-Anmeldung.
 *
 * Bewusst POST und nicht GET: Ein Bestätigungslink wird von Virenscannern,
 * Vorschaudiensten und Mailclients regelmäßig automatisch aufgerufen. Würde
 * schon dieser Aufruf bestätigen, entstünde genau die Behauptung, die der
 * Double-Opt-in beseitigen soll — eine Einwilligung, die niemand erteilt hat.
 * Der Link führt deshalb auf eine Seite mit einer Schaltfläche.
 */

type Outcome = "confirmed" | "expired" | "unknown" | "error";

function resultUrl(request: Request, outcome: Outcome): URL {
  const url = new URL(appPath("/whitelist/confirm"), request.url);
  url.searchParams.set("result", outcome);
  return url;
}

export async function POST(request: NextRequest) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 4_000) {
      return new Response("Request body too large", { status: 413 });
    }

    const ipHash = pseudonymizeIp(getClientIp(request));
    // Ohne Grenze ließe sich der Tokenraum absuchen. Er ist zwar 256 Bit groß,
    // aber ein Limit kostet nichts.
    const limit = await consumeRateLimit(
      `whitelist-confirm:${ipHash}`,
      20,
      60 * 60_000,
    );
    if (!limit.allowed) {
      return NextResponse.redirect(resultUrl(request, "error"), {
        status: 303,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    const formData = await request.formData();
    const token = String(formData.get("token") ?? "");
    if (!isConfirmationTokenShape(token)) {
      return NextResponse.redirect(resultUrl(request, "unknown"), 303);
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.redirect(resultUrl(request, "error"), 303);
    }

    const admin = createAdminSupabaseClient();
    const { data: lead, error } = await admin
      .from("whitelist_leads")
      .select("id,status,confirmation_expires_at")
      .eq("confirmation_token_hash", hashConfirmationToken(token))
      .maybeSingle();
    if (error) throw error;
    if (!lead) {
      return NextResponse.redirect(resultUrl(request, "unknown"), 303);
    }

    // Eine zweite Bestätigung desselben Links ist kein Fehler, sondern der
    // Nutzer, der auf "zurück" gedrückt hat.
    if (lead.status === "confirmed") {
      return NextResponse.redirect(resultUrl(request, "confirmed"), 303);
    }

    const expiresAt = lead.confirmation_expires_at
      ? new Date(lead.confirmation_expires_at as string)
      : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      await writeAuditEvent({
        actorUserId: null,
        action: "whitelist_confirmation_expired",
        targetType: "whitelist_lead",
        targetId: lead.id as string,
        outcome: "denied",
        traceId,
      });
      return NextResponse.redirect(resultUrl(request, "expired"), 303);
    }

    const { error: updateError } = await admin
      .from("whitelist_leads")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        // Der Token hat seinen Zweck erfüllt und wird nicht aufbewahrt.
        confirmation_token_hash: null,
        confirmation_expires_at: null,
      })
      .eq("id", lead.id)
      .eq("status", "pending");
    if (updateError) throw updateError;

    await writeAuditEvent({
      actorUserId: null,
      action: "whitelist_confirmed",
      targetType: "whitelist_lead",
      targetId: lead.id as string,
      outcome: "success",
      traceId,
    });

    return NextResponse.redirect(resultUrl(request, "confirmed"), 303);
  } catch (error) {
    if (error instanceof Response) return error;
    await writeAuditEvent({
      actorUserId: null,
      action: "whitelist_confirmation_failed",
      targetType: "whitelist_lead",
      outcome: "failed",
      traceId,
    }).catch(() => undefined);
    return NextResponse.redirect(resultUrl(request, "error"), 303);
  }
}
