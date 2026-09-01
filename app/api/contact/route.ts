import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import {
  contactAcknowledgementMessage,
  contactInbox,
  contactNotificationMessage,
} from "@/lib/contact/messages";
import { deliverEmail } from "@/lib/email/deliver";
import {
  assertSameOrigin,
  getClientIp,
  logEvent,
  pseudonymizeIp,
} from "@/lib/security/request";
import { CAPTCHA_FIELD, verifyCaptcha } from "@/lib/security/captcha";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Der Kontaktweg aus dem Impressum.
 *
 * Bewusst ein gewöhnliches Formular mit `method="post"` statt eines
 * fetch-Aufrufs: Der Weg, über den jemand einen Anbieter erreichen können muss,
 * sollte nicht davon abhängen, dass JavaScript lädt. Deshalb auch die
 * Weiterleitung mit 303 statt einer JSON-Antwort.
 */
const ContactSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(160),
    subject: z.string().trim().min(3).max(150),
    message: z.string().trim().min(20).max(5_000),
    website: z.string().max(200).optional().default(""),
  })
  .strict();

function contactUrl(
  request: Request,
  state: "sent" | "error" | "invalid",
): URL {
  const url = new URL(appPath("/contact"), request.url);
  url.searchParams.set("status", state);
  url.hash = "formular";
  return url;
}

export async function POST(request: NextRequest) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 24_000) {
      return new Response("Request body too large", { status: 413 });
    }

    const formData = await request.formData();
    const parsed = ContactSchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? "").toLocaleLowerCase("en-US"),
      subject: String(formData.get("subject") ?? ""),
      message: String(formData.get("message") ?? ""),
      website: String(formData.get("website") ?? ""),
    });
    if (!parsed.success) {
      // Nur der Grund, keine Eingaben. Diese Zweige schreiben kein Audit;
      // ohne eine Spur lässt sich später nicht sagen, ob jemand am Formular
      // scheiterte oder am Captcha.
      logEvent("contact_rejected", { reason: "invalid_form" });
      return NextResponse.redirect(contactUrl(request, "invalid"), 303);
    }

    // Ein Bot, der das Honigtopf-Feld ausgefüllt hat, bekommt dieselbe Antwort
    // wie ein Mensch. Gespeichert wird nichts.
    if (parsed.data.website) {
      return NextResponse.redirect(contactUrl(request, "sent"), 303);
    }

    // Nach dem Honeypot und vor dem Rate-Limit: ein Bot, der den Honeypot
    // gefuellt hat, soll gar nicht erst eine Anfrage an hCaptcha ausloesen.
    const captchaResult = await verifyCaptcha(
      String(formData.get(CAPTCHA_FIELD) ?? ""),
      getClientIp(request),
    );
    if (!captchaResult.ok) {
      logEvent("contact_rejected", { reason: `captcha_${captchaResult.reason}` });
      return NextResponse.redirect(contactUrl(request, "error"), 303);
    }

    const ipHash = pseudonymizeIp(getClientIp(request));
    const limit = await consumeRateLimit(`contact:${ipHash}`, 5, 60 * 60_000);
    if (!limit.allowed) {
      logEvent("contact_rejected", { reason: "rate_limited" });
      return NextResponse.redirect(contactUrl(request, "error"), {
        status: 303,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.redirect(contactUrl(request, "error"), 303);
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("contact_requests")
      .insert({
        full_name: parsed.data.fullName,
        email: parsed.data.email,
        subject: parsed.data.subject,
        message: parsed.data.message,
        source: "contact_form",
      })
      .select("id")
      .single();
    if (error) throw error;

    // Erst gespeichert, dann verschickt — und ein gescheiterter Versand macht
    // die Anfrage nicht ungültig. Sie steht bereits in der Tabelle; eine
    // Fehlerseite würde jemanden dazu bringen, dieselbe Nachricht noch einmal
    // zu schicken, obwohl sie längst da ist. Was schiefging, steht im
    // Audit-Eintrag, damit es nicht stillschweigend verschwindet.
    // Nebenläufig, nicht nacheinander: Der Versandweg hält keinen
    // Verbindungspool, jede Nachricht baut ihre eigene SMTP-Verbindung auf.
    // Nacheinander wartete der Absender des Formulars zweimal darauf.
    const [notification, acknowledgement] = await Promise.all([
      deliverEmail({
        to: contactInbox(),
        ...contactNotificationMessage(parsed.data),
      }),
      deliverEmail({
        to: parsed.data.email,
        ...contactAcknowledgementMessage(parsed.data),
      }),
    ]);

    await writeAuditEvent({
      actorUserId: null,
      action: "contact_request_saved",
      targetType: "contact_request",
      targetId: data.id,
      outcome: "success",
      traceId,
      metadata: {
        notified: notification.delivered,
        acknowledged: acknowledgement.delivered,
      },
    });

    return NextResponse.redirect(contactUrl(request, "sent"), 303);
  } catch (error) {
    if (error instanceof Response) return error;
    await writeAuditEvent({
      actorUserId: null,
      action: "contact_request_failed",
      targetType: "contact_request",
      outcome: "failed",
      traceId,
    }).catch(() => undefined);
    return NextResponse.redirect(contactUrl(request, "error"), 303);
  }
}
