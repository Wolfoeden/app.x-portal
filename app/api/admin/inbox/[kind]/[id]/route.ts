import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AdminInboxConflictError,
  AdminInboxTransitionError,
  getAdminInboxDetail,
  updateContactInboxItem,
  updateIntroductionInboxItem,
} from "@/lib/admin/inbox-data";
import {
  INTRODUCTION_ACTIONS,
  INTRODUCTION_STATUSES,
} from "@/lib/admin/inbox";
import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KindSchema = z.enum(["contact", "introduction"]);
const IdSchema = z.uuid();
const ExpectedUpdatedAtSchema = z.iso.datetime({ offset: true });
const HttpsUrlSchema = z
  .url()
  .max(1_000)
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Nur HTTPS-Buchungslinks sind erlaubt.",
  });

const ContactPatchSchema = z
  .object({
    action: z.enum(["mark_handled", "reopen"]),
    expectedUpdatedAt: ExpectedUpdatedAtSchema,
  })
  .strict();

const IntroductionPatchBase = z.object({
  expectedStatus: z.enum(INTRODUCTION_STATUSES),
  expectedUpdatedAt: ExpectedUpdatedAtSchema,
});

const IntroductionPatchSchema = z.discriminatedUnion("action", [
  IntroductionPatchBase.extend({ action: z.literal("start_review") }).strict(),
  IntroductionPatchBase.extend({
    action: z.literal("approve"),
    bookingUrl: HttpsUrlSchema,
  }).strict(),
  IntroductionPatchBase.extend({ action: z.literal("mark_booked") }).strict(),
  IntroductionPatchBase.extend({ action: z.literal("complete") }).strict(),
  IntroductionPatchBase.extend({ action: z.literal("cancel") }).strict(),
]);

type RouteContext = {
  params: Promise<{ kind: string; id: string }>;
};

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function invalidResponse(traceId: string) {
  return NextResponse.json(
    { error: "Die Anfrage hat ein ungültiges Format.", traceId },
    { status: 400, headers: PRIVATE_HEADERS },
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const traceId = randomUUID();
  let targetId: string | null = null;
  let kind: z.infer<typeof KindSchema> | null = null;

  try {
    const [{ kind: rawKind, id }, admin] = await Promise.all([
      context.params,
      requireAdminUser(),
    ]);
    kind = KindSchema.parse(rawKind);
    targetId = IdSchema.parse(id);

    const detail = await getAdminInboxDetail(kind, targetId);
    if (!detail) {
      return NextResponse.json(
        { error: "Der Vorgang wurde nicht gefunden." },
        { status: 404, headers: PRIVATE_HEADERS },
      );
    }

    await writeAuditEvent({
      actorUserId: admin.id,
      action: "admin_inbox_detail_viewed",
      targetType: kind === "contact" ? "contact_request" : "intro_booking",
      targetId,
      outcome: "success",
      traceId,
      metadata: { kind },
      required: true,
    });

    return NextResponse.json({ detail }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return invalidResponse(traceId);

    await writeAuditEvent({
      actorUserId: null,
      action: "admin_inbox_detail_failed",
      targetType: kind === "contact" ? "contact_request" : "intro_booking",
      targetId,
      outcome: "failed",
      traceId,
      metadata: { kind: kind ?? "unknown" },
    }).catch(() => undefined);

    return NextResponse.json(
      { error: "Die Details konnten nicht geladen werden.", traceId },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const traceId = randomUUID();
  let targetId: string | null = null;
  let kind: z.infer<typeof KindSchema> | null = null;

  try {
    assertSameOrigin(request);
    const [{ kind: rawKind, id }, admin] = await Promise.all([
      context.params,
      requireAdminUser(),
    ]);
    kind = KindSchema.parse(rawKind);
    targetId = IdSchema.parse(id);
    const body = await readJsonWithLimit(request, 4_000);

    if (kind === "contact") {
      const input = ContactPatchSchema.parse(body);
      const update = await updateContactInboxItem({
        id: targetId,
        ...input,
      });
      if (!update) {
        return NextResponse.json(
          { error: "Die Kontaktanfrage wurde nicht gefunden." },
          { status: 404, headers: PRIVATE_HEADERS },
        );
      }

      await writeAuditEvent({
        actorUserId: admin.id,
        action:
          input.action === "mark_handled"
            ? "admin_contact_request_handled"
            : "admin_contact_request_reopened",
        targetType: "contact_request",
        targetId,
        outcome: "success",
        traceId,
        metadata: { handled: update.handledAt !== null },
        required: true,
      });

      return NextResponse.json({ update }, { headers: PRIVATE_HEADERS });
    }

    const input = IntroductionPatchSchema.parse(body);
    if (!INTRODUCTION_ACTIONS.includes(input.action)) return invalidResponse(traceId);
    const update = await updateIntroductionInboxItem({
      id: targetId,
      ...input,
    });
    if (!update) {
      return NextResponse.json(
        { error: "Die Introduction wurde nicht gefunden." },
        { status: 404, headers: PRIVATE_HEADERS },
      );
    }

    await writeAuditEvent({
      actorUserId: admin.id,
      action: "admin_intro_booking_status_changed",
      targetType: "intro_booking",
      targetId,
      outcome: "success",
      traceId,
      metadata: {
        previousStatus: update.previousStatus,
        nextStatus: update.status,
        hasBookingUrl: Boolean(update.bookingUrl),
      },
      required: true,
    });

    return NextResponse.json({ update }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return invalidResponse(traceId);
    if (
      error instanceof AdminInboxConflictError ||
      error instanceof AdminInboxTransitionError
    ) {
      return NextResponse.json(
        { error: error.message, traceId },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }

    await writeAuditEvent({
      actorUserId: null,
      action: "admin_inbox_update_failed",
      targetType: kind === "contact" ? "contact_request" : "intro_booking",
      targetId,
      outcome: "failed",
      traceId,
      metadata: { kind: kind ?? "unknown" },
    }).catch(() => undefined);

    return NextResponse.json(
      { error: "Die Änderung konnte nicht gespeichert werden.", traceId },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }
}
