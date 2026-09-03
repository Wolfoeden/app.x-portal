import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { LEADGEN_OUTREACH_CREDITS } from "@/lib/ai/credit-policy";
import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { createDraftForLead } from "@/lib/leadgen/draft-service";
import { getLead } from "@/lib/leadgen/leads-data";
import { quotaRefusal } from "@/lib/leadgen/quota-response";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  pseudonymizeSubject,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Erzeugt den Entwurf einer Akquise-Mail und legt ihn ab.
 *
 * Diese Route verschickt nichts. Der Betreiber liest den Text, ändert ihn
 * gegebenenfalls und drückt danach auf Senden — der Versand hat seine eigene
 * Route und seinen eigenen Protokolleintrag.
 */

const InputSchema = z
  .object({
    requestId: z.string().trim().min(8).max(160),
  })
  .strict();

const LeadIdSchema = z.coerce.number().int().positive();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = randomUUID();
  let leadId: number | null = null;

  try {
    assertSameOrigin(request);
    const [{ id }, admin] = await Promise.all([
      context.params,
      requireAdminUser(),
    ]);
    leadId = LeadIdSchema.parse(id);
    const input = InputSchema.parse(await readJsonWithLimit(request, 2_000));

    const userHash = pseudonymizeSubject(`user:${admin.id}`);
    const ipHash = pseudonymizeIp(getClientIp(request));

    // Eine zusätzliche Bremse gegen versehentliche Schleifen im Browser. Das
    // eigentliche Tor bleibt requireAdminUser(); dieser Zähler ist gegenüber
    // der Datenbank absichtlich fail-open.
    const limit = await consumeRateLimit(
      `admin-leadgen-draft:${userHash}`,
      30,
      60_000,
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Zu viele Entwürfe in kurzer Zeit.", traceId },
        {
          status: 429,
          headers: {
            "Retry-After": String(limit.retryAfterSeconds),
            "Cache-Control": "private, no-store",
          },
        },
      );
    }

    const lead = await getLead(leadId);
    if (!lead) {
      return NextResponse.json(
        { error: "Der Lead wurde nicht gefunden.", traceId },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const outcome = await createDraftForLead({
      lead,
      adminId: admin.id,
      isAnonymous: admin.isAnonymous,
      isAdmin: admin.isAdmin,
      userHash,
      ipHash,
      requestId: input.requestId,
    });

    if (outcome.status === "quota_denied") {
      await writeAuditEvent({
        actorUserId: admin.id,
        action: "leadgen_draft_denied",
        targetType: "leadgen_outreach",
        outcome: "denied",
        traceId,
        metadata: { leadId, reason: outcome.reason },
      });

      const refusal = quotaRefusal({
        reason: outcome.reason,
        retryAfterSeconds: outcome.retryAfterSeconds,
        credits: outcome.credits,
        traceId,
      });
      return NextResponse.json(refusal.body, {
        status: refusal.status,
        headers: refusal.headers,
      });
    }

    await writeAuditEvent({
      actorUserId: admin.id,
      action: "leadgen_draft_created",
      targetType: "leadgen_outreach",
      outcome: "success",
      traceId,
      metadata: {
        leadId,
        mode: outcome.mode,
        creditsCharged: outcome.creditsCharged ?? -1,
      },
    });

    return NextResponse.json(
      {
        status: "created",
        draft: outcome.draft,
        mode: outcome.mode,
        price: { credits: LEADGEN_OUTREACH_CREDITS },
        creditsCharged: outcome.creditsCharged,
        credits: outcome.credits,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Die Anfrage hat ein ungültiges Format.", traceId },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    await writeAuditEvent({
      actorUserId: null,
      action: "leadgen_draft_failed",
      targetType: "leadgen_outreach",
      outcome: "failed",
      traceId,
      metadata: { leadId: leadId ?? -1 },
    }).catch(() => undefined);

    return NextResponse.json(
      { error: "Der Entwurf konnte nicht erzeugt werden.", traceId },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
