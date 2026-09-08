import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { promotionalDeliveryConfigured } from "@/lib/email/deliver";
import { listPreparedDrafts } from "@/lib/leadgen/leads-data";
import { deliverPreparedDraft } from "@/lib/leadgen/match-run";
import { LEAD_HOURLY_SEND_LIMIT } from "@/lib/leadgen/limits";
import { assertSameOrigin } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Einen vorbereiteten Entwurf von Hand verschicken.
 *
 * Derselbe Weg, den der Zeitgeber nimmt — `deliverPreparedDraft()` —, nur mit
 * einem Menschen als Auslöser. Der Text wird nicht neu erzeugt und nicht
 * verändert: Was in der Vorschau steht, geht raus.
 *
 * Es gab hier einmal einen zweiten Weg, der sich seinen Text von einem Modell
 * schreiben ließ. Derselbe Lead bekam damit je nach Knopf eine andere
 * Nachricht. Dieser Weg ist zurückgebaut.
 *
 * Ohne Zeitfenster und ohne Tagesmenge: Wer hier klickt, weiß, wie spät es
 * ist und wie viel heute schon rausging — die Zahl steht im selben Bild.
 *
 * **Die Stundenmenge gilt trotzdem**, und zwar nicht hier, sondern in
 * `deliverPreparedDraft()`. Am 8. September gingen fünfundzwanzig statt
 * zwanzig Nachrichten raus, weil dieser Weg an der Mengenprüfung des
 * Stapellaufs vorbeiführte. Der Unterschied zur Tagesmenge ist die
 * Begründung: Die Tagesmenge schützt den Ruf des Postfachs und darf vom
 * Betreiber überstimmt werden. Die Stundenmenge schützt den Mailserver vor
 * einer Spitze, und dagegen hilft kein Wissen darüber, wie spät es ist.
 */

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = randomUUID();
  try {
    const admin = await requireAdminUser();
    assertSameOrigin(request);

    const params = ParamsSchema.safeParse(await context.params);
    if (!params.success) {
      return NextResponse.json({ error: "Unbekannter Entwurf." }, { status: 400 });
    }

    if (!promotionalDeliveryConfigured()) {
      return NextResponse.json(
        {
          error:
            "Der Mailversand ist nicht eingerichtet. Ohne SMTP-Zugang und ohne EMAIL_UNSUBSCRIBE_SECRET wird nichts verschickt.",
        },
        { status: 503 },
      );
    }

    // Der Entwurf wird aus derselben Liste geholt, aus der auch der Tageslauf
    // schöpft. Eine eigene Abfrage hier hieße, zwei Stellen darüber
    // entscheiden zu lassen, was verschickt werden darf.
    const drafts = await listPreparedDrafts(200);
    const draft = drafts.find((entry) => entry.outreach_id === params.data.id);
    if (!draft) {
      return NextResponse.json(
        { error: "Dieser Entwurf wartet nicht mehr auf den Versand." },
        { status: 404 },
      );
    }

    const result = await deliverPreparedDraft(draft);

    await writeAuditEvent({
      actorUserId: admin.id,
      action: "leadgen_outreach_sent_manually",
      targetType: "leadgen_outreach",
      targetId: draft.outreach_id,
      outcome: result.sent ? "success" : "failed",
      traceId,
      // Keine Empfängeradresse: Das Protokoll hält fest, was geschah, nicht
      // mit wem. Der Beleg daneben trägt sie ohnehin.
      metadata: {
        leadId: draft.lead_id,
        reason: result.sent ? null : result.reason,
      },
    });

    if (!result.sent) {
      return NextResponse.json(
        {
          error:
            result.reason === "already_sent"
              ? "Dieser Lead wurde bereits angeschrieben."
              : result.reason === "hourly_limit"
                ? // Nicht „gescheitert": Es hat nichts versagt, die
                  // Stundenmenge ist erreicht. Wer das als Fehler liest,
                  // sucht an der falschen Stelle.
                  `In dieser Stunde sind bereits ${LEAD_HOURLY_SEND_LIMIT} Nachrichten raus — zur vollen Stunde geht es weiter.`
                : "Der Versand ist gescheitert. Der Grund steht im Beleg.",
          reason: result.reason,
          traceId,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(
      JSON.stringify({
        event: "leadgen_manual_send_failed",
        traceId,
        reason: error instanceof Error ? error.message : "unknown",
      }),
    );
    return NextResponse.json(
      { error: "Der Versand ist gescheitert.", traceId },
      { status: 500 },
    );
  }
}
