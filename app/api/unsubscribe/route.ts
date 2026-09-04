import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { suppressEmail } from "@/lib/email/suppression";
import { readUnsubscribeToken } from "@/lib/email/unsubscribe";
import { getClientIp, pseudonymizeIp } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Der Widerspruch gegen werbliche Post.
 *
 * Zwei Wege führen hierher, und beide müssen funktionieren:
 *
 *   1. Ein Mensch klickt den Link im Fuß der Nachricht, landet auf
 *      `/unsubscribe` und drückt dort die Schaltfläche. Der Link selbst ist
 *      ein GET auf eine Seite und trägt nichts aus — Virenscanner und
 *      Vorschaudienste rufen Links in E-Mails automatisch ab, und ein GET,
 *      das schon abmeldet, würde Leute stillschweigend austragen, die nur
 *      ihre Post geöffnet haben. Dieselbe Überlegung wie bei
 *      `/api/whitelist/confirm`, nur mit umgekehrtem Vorzeichen.
 *   2. Gmail, Yahoo und Outlook zeigen neben dem Absender einen eigenen
 *      „Abbestellen"-Knopf, sobald die Kopfzeilen nach RFC 8058 gesetzt sind,
 *      und schicken darauf einen POST mit `List-Unsubscribe=One-Click`. Der
 *      kommt vom Mailanbieter, nicht aus dem Browser des Nutzers.
 *
 * Deshalb steht hier kein `assertSameOrigin`: Weg 2 ist zwangsläufig
 * fremdherkünftig, und eine Herkunftsprüfung würde genau den Knopf
 * abschalten, den Leute drücken, die sonst auf „Spam" drücken. Den Schutz
 * trägt stattdessen der Token — ein HMAC über die Adresse des Empfängers.
 * Wer ihn nicht hat, kann niemanden austragen; wer ihn hat, hat die
 * Nachricht. Und die Folge ist nicht zerstörerisch: ein Eintrag in der
 * Sperrliste hält Werbung auf, sonst nichts, und lässt sich zurücknehmen.
 */

type Outcome = "done" | "invalid" | "error";

function resultUrl(request: Request, outcome: Outcome): URL {
  const url = new URL(appPath("/unsubscribe"), request.url);
  url.searchParams.set("result", outcome);
  return url;
}

/**
 * Was der Aufrufer als Antwort verträgt.
 *
 * Ein Mailanbieter erwartet auf den Ein-Klick-POST eine schlichte 2xx-Antwort
 * und wertet eine Weiterleitung teils als Fehlschlag. Ein Browser, der ein
 * Formular abgeschickt hat, soll dagegen auf einer Seite landen, die sagt,
 * was passiert ist.
 */
function isOneClick(body: URLSearchParams): boolean {
  return body.get("List-Unsubscribe") === "One-Click";
}

export async function POST(request: NextRequest) {
  const traceId = randomUUID();
  let oneClick = false;

  try {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 4_000) {
      return new Response("Request body too large", { status: 413 });
    }

    const ipHash = pseudonymizeIp(getClientIp(request));
    // Der Tokenraum ist 256 Bit groß, aber eine Grenze kostet nichts und hält
    // jemanden auf, der die Route als Schreibzugriff missbrauchen will.
    const limit = await consumeRateLimit(`unsubscribe:${ipHash}`, 30, 60 * 60_000);
    if (!limit.allowed) {
      return NextResponse.redirect(resultUrl(request, "error"), {
        status: 303,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    // Der Ein-Klick-POST schickt `application/x-www-form-urlencoded`, das
    // Formular ebenso. `request.text()` deckt beides ab, ohne dass ein
    // fehlender oder abweichender Content-Type die Anfrage scheitern lässt.
    const body = new URLSearchParams(await request.text());
    oneClick = isOneClick(body);

    // Beim Ein-Klick steht der Token in der Adresse, beim Formular im Rumpf.
    const token =
      body.get("token") ?? new URL(request.url).searchParams.get("t");
    const email = readUnsubscribeToken(token);

    if (!email) {
      await writeAuditEvent({
        actorUserId: null,
        action: "email_unsubscribe_rejected",
        targetType: "email_suppression",
        outcome: "denied",
        traceId,
        metadata: { oneClick },
      });
      return oneClick
        ? new Response(null, { status: 400 })
        : NextResponse.redirect(resultUrl(request, "invalid"), 303);
    }

    const outcome = await suppressEmail({
      email,
      reason: "unsubscribe_link",
      source: oneClick ? "list_unsubscribe_one_click" : "unsubscribe_page",
    });

    if (!outcome.suppressed) {
      await writeAuditEvent({
        actorUserId: null,
        action: "email_unsubscribe_failed",
        targetType: "email_suppression",
        outcome: "failed",
        traceId,
        metadata: { oneClick, reason: outcome.reason },
      });
      return oneClick
        ? new Response(null, { status: 503 })
        : NextResponse.redirect(resultUrl(request, "error"), 303);
    }

    // Die Adresse steht nicht im Protokoll — `writeAuditEvent` würde ein Feld
    // mit „email" ohnehin herausfiltern, und der Beleg liegt in
    // `email_suppressions`.
    await writeAuditEvent({
      actorUserId: null,
      action: "email_unsubscribed",
      targetType: "email_suppression",
      outcome: "success",
      traceId,
      metadata: { oneClick, wasNew: outcome.wasNew },
    });

    return oneClick
      ? new Response(null, { status: 200 })
      : NextResponse.redirect(resultUrl(request, "done"), 303);
  } catch (error) {
    if (error instanceof Response) return error;
    await writeAuditEvent({
      actorUserId: null,
      action: "email_unsubscribe_error",
      targetType: "email_suppression",
      outcome: "failed",
      traceId,
    }).catch(() => undefined);
    return oneClick
      ? new Response(null, { status: 503 })
      : NextResponse.redirect(resultUrl(request, "error"), 303);
  }
}
