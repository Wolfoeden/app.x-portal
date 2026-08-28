import { takeRateLimit } from "@/lib/security/rate-limit";
import { getClientIp, logEvent, pseudonymizeIp } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nimmt Verstöße gegen die Report-Only-Richtlinie entgegen.
 *
 * Solange die Nonce-Fassung nur beobachtet wird, ist das hier die einzige
 * Stelle, an der sich zeigt, was beim Umschalten brechen würde. Die Route
 * schreibt nichts in die Datenbank: Ein Bericht ist ein Signal, kein Datensatz,
 * und die Begrenzung soll ohne Datenbankaufruf greifen.
 *
 * Der Browser schickt diese Meldung ohne `Origin` und teils von fremden
 * Kontexten aus. Deshalb steht hier bewusst keine Herkunftsprüfung — dafür
 * eine harte Größengrenze, eine Ratenbegrenzung und ein Log, das nur Direktive
 * und Pfad behält.
 */

const MAX_BODY_BYTES = 8_000;
const MAX_REPORTS_PER_REQUEST = 5;

/**
 * Query und Fragment fallen weg. Eine Projekt- oder Profil-ID im Pfad ist für
 * die Fehlersuche nötig, ein Suchbegriff im Query-String nicht — und das
 * Logging-Prinzip aus docs/security-operations.md verlangt, dass hier nichts
 * Personenbezogenes landet.
 */
function safeLocation(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    // `inline`, `eval`, `data` und andere Schlüsselwörter sind keine URLs.
    return value.slice(0, 120);
  }
}

type Violation = {
  directive: string | null;
  blocked: string | null;
  document: string | null;
};

function violationsFrom(payload: unknown): Violation[] {
  const entries: Violation[] = [];

  // Reporting-API: eine Liste von Berichten.
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") continue;
      const body = (entry as { body?: unknown }).body;
      if (!body || typeof body !== "object") continue;
      const report = body as Record<string, unknown>;
      entries.push({
        directive:
          typeof report.effectiveDirective === "string"
            ? report.effectiveDirective.slice(0, 60)
            : null,
        blocked: safeLocation(report.blockedURL),
        document: safeLocation(report.documentURL),
      });
    }
    return entries.slice(0, MAX_REPORTS_PER_REQUEST);
  }

  // `report-uri`: ein einzelner Bericht unter `csp-report`.
  if (payload && typeof payload === "object") {
    const report = (payload as { "csp-report"?: unknown })["csp-report"];
    if (report && typeof report === "object") {
      const fields = report as Record<string, unknown>;
      const directive =
        typeof fields["effective-directive"] === "string"
          ? fields["effective-directive"]
          : typeof fields["violated-directive"] === "string"
            ? fields["violated-directive"]
            : null;
      entries.push({
        directive: directive ? directive.slice(0, 60) : null,
        blocked: safeLocation(fields["blocked-uri"]),
        document: safeLocation(fields["document-uri"]),
      });
    }
  }

  return entries;
}

export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return new Response(null, { status: 413 });
    }

    let subject = "unknown";
    try {
      subject = pseudonymizeIp(getClientIp(request));
    } catch {
      // Ohne HMAC-Secret wird nicht protokolliert, aber auch nicht gemeldet:
      // ein Bericht darf keine Konfigurationsdetails preisgeben.
    }
    if (!takeRateLimit(`csp-report:${subject}`, 30, 60_000).allowed) {
      return new Response(null, { status: 429 });
    }

    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return new Response(null, { status: 413 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      return new Response(null, { status: 400 });
    }

    for (const violation of violationsFrom(payload)) {
      logEvent("csp_violation_report", {
        directive: violation.directive,
        blocked: violation.blocked,
        document: violation.document,
      });
    }

    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
