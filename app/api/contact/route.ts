import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import {
  CONTACT_INQUIRY_SOURCE,
  ContactInquirySchema,
  contactInquiryFromForm,
  inquiryMessage,
  inquirySubject,
  isBusinessInquiry,
  type ContactInquiry,
} from "@/lib/contact/inquiry";
import {
  contactAcknowledgementMessage,
  contactInbox,
  contactNotificationMessage,
} from "@/lib/contact/messages";
import { recordInboundLead } from "@/lib/crm/contacts-data";
import { berlinToday } from "@/lib/crm/contacts-model";
import { deliverEmail } from "@/lib/email/deliver";
import { SALES_CALL_KIND } from "@/lib/sales/sales-call-links";
import { salesCalendarUrl } from "@/lib/sales/sales-call-model";
import { mintSalesCallToken, salesCallUrl } from "@/lib/sales/sales-call";
import {
  assertSameOrigin,
  getClientIp,
  logEvent,
  pseudonymizeIp,
} from "@/lib/security/request";
import { CAPTCHA_FIELD, verifyCaptcha } from "@/lib/security/captcha";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { SITE_URL } from "@/lib/seo";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Der Kontaktweg aus dem Impressum und das Formular der Kontaktseite.
 *
 * Bewusst ein gewöhnliches Formular mit `method="post"` statt eines
 * fetch-Aufrufs: Der Weg, über den jemand einen Anbieter erreichen können muss,
 * sollte nicht davon abhängen, dass JavaScript lädt. Deshalb auch die
 * Weiterleitung mit 303 statt einer JSON-Antwort.
 *
 * Jede Anfrage landet in `contact_requests`. Geht es um Freelancer, KI-Agenten
 * oder eine der Kompetenzen, steht sie zusätzlich als Gesprächsanfrage im
 * CRM, mit Wiedervorlage heute. Seit /gespraech in dieser Seite aufgegangen
 * ist (14.10.2026), zählt sie auch als „Gespräch angefragt“ im Umsatzweg,
 * und die Danke-Ansicht bekommt ein Token für den vorausgefüllten Kalender.
 */
function contactUrl(
  request: Request,
  state: "sent" | "error" | "invalid",
  token?: string | null,
): URL {
  const url = new URL(appPath("/contact"), request.url);
  url.searchParams.set("status", state);
  if (token) url.searchParams.set("t", token);
  url.hash = "anfrage";
  return url;
}

/**
 * Ins CRM, damit der Rückruf nicht nur in einem Postfach steht. Scheitert
 * das, bleibt die Anfrage trotzdem gültig: Sie liegt schon in
 * `contact_requests`, und die Mail geht trotzdem raus.
 */
async function recordInCrm(inquiry: ContactInquiry, subject: string, message: string): Promise<string | null> {
  if (!isBusinessInquiry(inquiry)) return null;
  try {
    const lead = await recordInboundLead(
      {
        company: inquiry.company ?? "Ohne Firmenangabe",
        contactName: inquiry.fullName,
        roleTitle: null,
        kind: SALES_CALL_KIND,
        region: null,
        focus: subject.slice(0, 400),
        email: inquiry.email,
        emailKind: "personal",
        emailSourceUrl: null,
        projectUrl: null,
        note: message.slice(0, 2_000),
      },
      {
        source: CONTACT_INQUIRY_SOURCE,
        today: berlinToday(),
        eventBody: `Anfrage über die Kontaktseite: ${subject}\n${message}`,
      },
    );
    return lead.id;
  } catch (error) {
    console.error("contact inquiry crm failed", error);
    return null;
  }
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
    const parsed = ContactInquirySchema.safeParse(contactInquiryFromForm(formData));
    if (!parsed.success) {
      // Nur der Grund, keine Eingaben. Diese Zweige schreiben kein Audit;
      // ohne eine Spur lässt sich später nicht sagen, ob jemand am Formular
      // scheiterte oder am Captcha.
      logEvent("contact_rejected", { reason: "invalid_form" });
      return NextResponse.redirect(contactUrl(request, "invalid"), 303);
    }
    const inquiry = parsed.data;

    // Ein Bot, der das Honigtopf-Feld ausgefüllt hat, bekommt dieselbe Antwort
    // wie ein Mensch. Gespeichert wird nichts.
    if (inquiry.website) {
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

    const subject = inquirySubject(inquiry);
    const message = inquiryMessage(inquiry);
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("contact_requests")
      .insert({
        full_name: inquiry.fullName,
        email: inquiry.email,
        subject,
        message,
        source: "contact_form",
      })
      .select("id")
      .single();
    if (error) throw error;

    const crmId = await recordInCrm(inquiry, subject, message);
    const base = salesCallUrl();
    const calendarUrl = base ? salesCalendarUrl(base, { fullName: inquiry.fullName, email: inquiry.email, role: subject }) : null;

    // Erst gespeichert, dann verschickt — und ein gescheiterter Versand macht
    // die Anfrage nicht ungültig. Sie steht bereits in der Tabelle; eine
    // Fehlerseite würde jemanden dazu bringen, dieselbe Nachricht noch einmal
    // zu schicken, obwohl sie längst da ist. Was schiefging, steht im
    // Audit-Eintrag, damit es nicht stillschweigend verschwindet.
    // Nebenläufig, nicht nacheinander: Der Versandweg hält keinen
    // Verbindungspool, jede Nachricht baut ihre eigene SMTP-Verbindung auf.
    // Nacheinander wartete der Absender des Formulars zweimal darauf.
    const mail = { fullName: inquiry.fullName, email: inquiry.email, subject, message };
    const [notification, acknowledgement] = await Promise.all([
      deliverEmail({
        to: contactInbox(),
        ...contactNotificationMessage(mail, {
          callback: inquiry.way === "rueckruf",
          crmUrl: crmId ? `${SITE_URL}${appPath(`/chat/admin/kontakte/${crmId}`)}` : null,
        }),
        // Keine Werbung, sondern die Weitergabe einer Anfrage, die jemand
        // gerade selbst abgeschickt hat. Die Sperrliste haelt sie nicht auf.
        kind: "transactional",
      }),
      deliverEmail({
        to: inquiry.email,
        ...contactAcknowledgementMessage(mail, { calendarUrl: isBusinessInquiry(inquiry) ? calendarUrl : null }),
        kind: "transactional",
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
        topics: inquiry.topics.join(",") || null,
        way: inquiry.way,
        crm: Boolean(crmId),
      },
    });
    if (crmId) {
      await writeAuditEvent({
        actorUserId: null,
        action: "sales_call_requested",
        targetType: "crm_contacts",
        targetId: crmId,
        outcome: "success",
        traceId,
        metadata: { topics: inquiry.topics.join(","), phone: Boolean(inquiry.phone) },
      }).catch(() => undefined);
    }

    return NextResponse.redirect(contactUrl(request, "sent", crmId ? mintSalesCallToken(crmId) : null), 303);
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
