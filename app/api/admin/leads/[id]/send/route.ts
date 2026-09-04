import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import {
  deliverEmail,
  promotionalDeliveryConfigured,
  publicMailOrigin,
} from "@/lib/email/deliver";
import { checkEmailSuppression } from "@/lib/email/suppression";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { createDraftForLead } from "@/lib/leadgen/draft-service";
import {
  claimOutreach,
  getLead,
  getOutreachDraft,
  recordOutreachSent,
  rejectOutreachDraft,
  releaseOutreachClaim,
  updateLead,
} from "@/lib/leadgen/leads-data";
import {
  LEAD_BODY_MAX_LENGTH,
  LEAD_SUBJECT_MAX_LENGTH,
  leadHeadline,
  leadSourceUrl,
} from "@/lib/leadgen/limits";
import {
  buildLeadEmail,
  leadSearchUrl,
  unattendedBodyIssue,
} from "@/lib/leadgen/outreach-message";
import { quotaRefusal } from "@/lib/leadgen/quota-response";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  pseudonymizeSubject,
  readJsonWithLimit,
} from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Verschickt das Anschreiben und archiviert den Lead.
 *
 * Drei Quellen für den Text, in dieser Reihenfolge: was der Betreiber im
 * Formular geändert hat, sonst der abgelegte Entwurf, sonst — nur wenn
 * ausdrücklich verlangt — ein frisch erzeugter. Der letzte Fall ist der
 * Stapelversand: dort drückt der Betreiber einmal und erwartet, dass für
 * jeden ausgewählten Lead etwas Passendes entsteht.
 *
 * Reihenfolge des Vorgangs ist Absicht: erst den Lead beanspruchen, dann
 * zustellen, dann den Anspruch abschließen. Läge der Versand zwischen
 * Prüfung und Protokoll, könnten zwei gleichzeitige Läufe beide zustellen,
 * bevor einer von ihnen den Konflikt bemerkt — und die zweite Mail wäre
 * schon beim Empfänger. Scheitert die Zustellung, wird der Anspruch wieder
 * freigegeben und der Versuch bleibt als `failed` im Protokoll stehen.
 */

const InputSchema = z
  .object({
    requestId: z.string().trim().min(8).max(160),
    subject: z.string().trim().min(1).max(LEAD_SUBJECT_MAX_LENGTH).optional(),
    body: z.string().trim().min(1).max(LEAD_BODY_MAX_LENGTH).optional(),
    /** Für den Stapelversand: fehlt ein Entwurf, wird einer erzeugt. */
    autoDraft: z.boolean().optional(),
  })
  .strict();

const LeadIdSchema = z.coerce.number().int().positive();

/**
 * Wer diese Nachricht schickt.
 *
 * Dieselbe Adresse, unter der auch jede andere Nachricht des Portals
 * rausgeht. Ein eigener Absender für die Akquise wäre möglich, wurde aber
 * verworfen: die Ansprache kommt vom Portal, nicht von einer Privatperson,
 * und eine zweite Adresse bräuchte ihre eigene SPF- und DKIM-Pflege.
 *
 * Der Wert steht auch im Fuß der Nachricht als Adresse für Antwort und
 * Widerspruch — beides muss dieselbe sein, sonst liefe der Widerspruch ins
 * Leere.
 */
function senderAddress(): string | null {
  return (
    process.env.EMAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || null
  );
}

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
    const input = InputSchema.parse(await readJsonWithLimit(request, 32_000));

    const from = senderAddress();
    // Strenger als der reine SMTP-Zugang: eine Akquise-Mail ohne
    // funktionierenden Abmeldelink darf nicht rausgehen, und das soll der
    // Betreiber hier erfahren statt an einer Fehlermeldung mitten im Stapel.
    if (!promotionalDeliveryConfigured() || !from) {
      return NextResponse.json(
        {
          error:
            "Der Mailversand ist nicht eingerichtet. Ohne SMTP-Zugang und ohne EMAIL_UNSUBSCRIBE_SECRET wird nichts verschickt.",
          reason: "provider_not_configured",
          traceId,
        },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const lead = await getLead(leadId);
    if (!lead) {
      return NextResponse.json(
        { error: "Der Lead wurde nicht gefunden.", traceId },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (lead.last_contacted_at) {
      return NextResponse.json(
        { error: "Dieser Lead wurde bereits angeschrieben.", reason: "already_sent", traceId },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    /**
     * Die Sperrliste, hier vorgezogen.
     *
     * Durchgesetzt wird sie in `deliverEmail()` — das ist die Zusage, und die
     * bleibt bestehen. Diese Prüfung steht davor, weil dazwischen ein
     * Modellaufruf liegt: ohne sie würde der Stapelversand für jede gesperrte
     * Adresse erst Credits für einen Entwurf ausgeben, den niemand je zu
     * sehen bekommt.
     *
     * Der Lead wird gleich mit verworfen und archiviert. Bliebe er offen,
     * stünde er morgen wieder in der Arbeitsliste, und der Betreiber liefe
     * jeden Tag erneut in dieselbe Absage.
     */
    const suppression = await checkEmailSuppression(lead.recipient_email);

    if (suppression === "suppressed") {
      await updateLead({ id: leadId, status: "dismissed", archived: true });
      await writeAuditEvent({
        actorUserId: admin.id,
        action: "leadgen_outreach_suppressed",
        targetType: "leadgen_queue",
        outcome: "denied",
        traceId,
        metadata: { leadId },
      });
      return NextResponse.json(
        {
          error:
            "Diese Adresse hat der Werbung widersprochen. Der Lead wurde verworfen.",
          reason: "suppressed",
          traceId,
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    // Der andere Fall: Die Sperrliste war nicht erreichbar. Auch dann geht
    // nichts raus — aber der Lead bleibt unangetastet. Ihn hier zu verwerfen
    // hieße, einen Aussetzer der Datenbank als Widerspruch zu lesen und einen
    // brauchbaren Lead dauerhaft wegzuwerfen.
    if (suppression === "unavailable") {
      await writeAuditEvent({
        actorUserId: admin.id,
        action: "leadgen_outreach_suppression_unavailable",
        targetType: "leadgen_queue",
        outcome: "failed",
        traceId,
        metadata: { leadId },
      });
      return NextResponse.json(
        {
          error:
            "Die Sperrliste ist gerade nicht erreichbar. Der Lead bleibt offen — bitte später erneut versuchen.",
          reason: "suppression_check_failed",
          traceId,
        },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const userHash = pseudonymizeSubject(`user:${admin.id}`);

    // Der abgelegte Entwurf wird immer gelesen, auch wenn der Betreiber Text
    // und Betreff mitschickt. Er trägt, was der Anbieter gekostet hat — und
    // genau das wäre sonst verloren: der Normalfall ist, dass der Betreiber
    // den erzeugten Text im Formular sieht und ihn von dort abschickt.
    const stored = await getOutreachDraft(leadId);

    let subject = input.subject ?? stored?.subject ?? null;
    let body = input.body ?? stored?.body ?? null;
    let model: string | null = stored?.model ?? null;
    let creditsCharged: number | null = stored?.credits ?? null;

    /**
     * Ob ein Mensch diesen Text gesehen hat.
     *
     * Nur ein Rumpf aus dem Formular ist gelesen — er stand im Textfeld, als
     * der Betreiber auf Senden gedrückt hat. Ein Text, der aus der Datenbank
     * oder frisch aus dem Modell kommt, ist es nicht, auch wenn er dort schon
     * eine Weile liegt.
     */
    const vomBetreiberBestaetigt = Boolean(input.body);

    if ((!subject || !body) && input.autoDraft) {
      const outcome = await createDraftForLead({
        lead,
        adminId: admin.id,
        isAnonymous: admin.isAnonymous,
        isAdmin: admin.isAdmin,
        userHash,
        ipHash: pseudonymizeIp(getClientIp(request)),
        requestId: input.requestId,
      });
      if (outcome.status === "quota_denied") {
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
      subject = outcome.draft.subject;
      body = outcome.draft.body;
      model = outcome.model;
      creditsCharged = outcome.creditsCharged;
    }

    if (!subject || !body) {
      return NextResponse.json(
        {
          error: "Für diesen Lead liegt kein Entwurf vor.",
          reason: "no_draft",
          traceId,
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    // Alles, was der Betreiber nicht selbst im Formular gesehen hat, wird
    // geprüft — der frisch erzeugte Text ebenso wie einer, der seit einem
    // früheren Lauf in der Datenbank liegt. Sonst wäre die Prüfung beim
    // zweiten Anlauf umgangen: der beanstandete Entwurf stünde dann bereits
    // gespeichert bereit, und der Zweig, der ihn aufhält, liefe gar nicht an.
    if (!vomBetreiberBestaetigt) {
      // Betreff und Text, beide: eine untergeschobene Adresse in der
      // Betreffzeile stünde ebenso beim Empfänger.
      const beanstandung =
        unattendedBodyIssue(subject, from) ?? unattendedBodyIssue(body, from);
      if (beanstandung) {
        // Der Entwurf ist bezahlt, aber unbrauchbar. Als `failed` abgelegt
        // bleibt nachvollziehbar, wofür Credits geflossen sind, und die Zeile
        // meldet nicht länger einen Entwurf, der nie rausgehen darf.
        await rejectOutreachDraft({
          leadId,
          reason: "unattended_content",
          createdBy: admin.id,
        });
        await writeAuditEvent({
          actorUserId: admin.id,
          action: "leadgen_outreach_draft_rejected",
          targetType: "leadgen_outreach",
          outcome: "denied",
          traceId,
          metadata: { leadId, reason: "unattended_content" },
        });
        return NextResponse.json(
          {
            error: beanstandung,
            reason: "unattended_content",
            traceId,
          },
          { status: 409, headers: { "Cache-Control": "private, no-store" } },
        );
      }
    }

    const text = buildLeadEmail({
      body,
      recipientName: lead.recipient_name,
      company: lead.company,
      senderEmail: from,
      sourceUrl: leadSourceUrl(lead.stellenanzeige),
      // Derselbe Link, den `deliverEmail()` gleich als Kopfzeile nach RFC 8058
      // setzt — hier sichtbar im Fuß, damit ihn auch findet, wessen
      // Mailprogramm keinen eigenen Abbestellen-Knopf einblendet.
      unsubscribeUrl: unsubscribeUrl(publicMailOrigin(), lead.recipient_email),
      // Die Handlungsaufforderung. Sie ersetzt die Frage am Textende: ein
      // Klick zeigt sofort Profile, eine Frage verlangt erst eine Antwort.
      ctaUrl: leadSearchUrl({
        origin: publicMailOrigin(),
        headline: leadHeadline(lead.stellenanzeige),
      }),
      // Anrede und Grußformel entfernt der Zusammenbau nur aus einem
      // Modelltext. Was der Betreiber selbst getippt hat, bleibt Wort für
      // Wort stehen — eine Wendung wie „beste Grüße nach München" mitten im
      // Absatz hätte ihm sonst stillschweigend den Rest abgeschnitten.
      trimModelPhrases: !vomBetreiberBestaetigt,
    });

    // Erst den Lead beanspruchen, dann zustellen. Andersherum läge der Versand
    // zwischen Prüfung und Protokoll, und zwei gleichzeitige Läufe könnten
    // beide zustellen, bevor einer von ihnen den Konflikt bemerkt.
    const claim = await claimOutreach({
      leadId,
      subject,
      body: text,
      model,
      credits: creditsCharged,
      createdBy: admin.id,
    });

    if (!claim.claimed) {
      return NextResponse.json(
        {
          error:
            claim.reason === "already_sent"
              ? "Dieser Lead wird gerade angeschrieben oder wurde es bereits."
              : "Der Lead wurde nicht gefunden.",
          reason: claim.reason,
          traceId,
        },
        {
          status: claim.reason === "lead_not_found" ? 404 : 409,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const delivery = await deliverEmail({
      to: lead.recipient_email,
      subject,
      text,
      // Werbung. Der Versandweg setzt daraufhin die Kopfzeilen nach RFC 8058
      // und prüft die Sperrliste ein zweites Mal — die Prüfung oben spart
      // Credits, diese hier ist die Zusage.
      kind: "cold_outreach",
    });

    if (!delivery.delivered) {
      await releaseOutreachClaim({
        outreachId: claim.outreachId,
        reason: delivery.reason,
      });
      await writeAuditEvent({
        actorUserId: admin.id,
        action: "leadgen_outreach_send_failed",
        targetType: "leadgen_outreach",
        targetId: claim.outreachId,
        outcome: "failed",
        traceId,
        metadata: { leadId, reason: delivery.reason },
      });
      return NextResponse.json(
        {
          error: "Die Nachricht konnte nicht zugestellt werden.",
          reason: delivery.reason,
          traceId,
        },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const recorded = await recordOutreachSent(claim.outreachId);

    if (!recorded.recorded) {
      // Die Mail ist raus. Der Beleg liegt seit dem Anspruch vor, es fehlt nur
      // der Abschluss — der Lead bleibt dann auf `sending` stehen und wird von
      // niemandem ein zweites Mal angeschrieben.
      await writeAuditEvent({
        actorUserId: admin.id,
        action: "leadgen_outreach_send_unrecorded",
        targetType: "leadgen_outreach",
        targetId: claim.outreachId,
        outcome: "failed",
        traceId,
        metadata: { leadId, reason: recorded.reason, sent: true },
      });
      return NextResponse.json(
        {
          error:
            "Die Nachricht ging raus, der Abschluss im Protokoll fehlt aber.",
          reason: recorded.reason,
          traceId,
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    // Ab hier ist der Vorgang abgeschlossen. Ein Fehler beim Schreiben des
    // Auditeintrags darf ihn nicht rückwirkend als gescheitert melden — die
    // Mail ist zugestellt und protokolliert, und ein zweiter Versuch des
    // Betreibers wäre der falsche Schluss.
    await writeAuditEvent({
      actorUserId: admin.id,
      action: "leadgen_outreach_sent",
      targetType: "leadgen_outreach",
      targetId: claim.outreachId,
      outcome: "success",
      traceId,
      metadata: {
        leadId,
        textLength: text.length,
        drafted: Boolean(model),
        creditsCharged: creditsCharged ?? -1,
      },
      required: true,
    }).catch(() => undefined);

    return NextResponse.json(
      { status: "sent", outreachId: claim.outreachId },
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
      action: "leadgen_outreach_send_error",
      targetType: "leadgen_outreach",
      outcome: "failed",
      traceId,
      metadata: { leadId: leadId ?? -1 },
    }).catch(() => undefined);

    return NextResponse.json(
      { error: "Der Versand ist fehlgeschlagen.", traceId },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
