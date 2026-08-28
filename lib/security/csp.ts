/**
 * Die Content-Security-Policy an einer Stelle.
 *
 * Bisher stand sie nur in `next.config.ts` und enthielt in Produktion
 * `script-src 'unsafe-inline'`. Damit fiel der eigentliche Zweck der Richtlinie
 * weg: Ein eingeschleustes Skript — aus einem Profiltext, einem Suchtreffer
 * oder einer Modellantwort — wäre ausgeführt worden. Der Rest der Richtlinie
 * ist eng gesetzt; diese eine Direktive war der Bruch in der Kette.
 *
 * Der Ersatz ist eine Nonce je Anfrage. Sie wird in `proxy.ts` erzeugt; Next
 * liest sie aus dem Anfrage-Header und schreibt sie an seine eigenen Skripte.
 * `'strict-dynamic'` sorgt dafür, dass von dort nachgeladene Skripte die
 * Erlaubnis erben, ohne dass die Herkunft einzeln aufgezählt werden muss.
 *
 * Ausgerollt wird in zwei Schritten: Die durchgesetzte Richtlinie bleibt
 * vorerst die alte, die Nonce-Fassung läuft daneben als
 * `Content-Security-Policy-Report-Only`. Erst wenn eine Woche ohne echte
 * Meldungen vergangen ist, tauschen die beiden die Rollen. Ein Umschalten ohne
 * diesen Zwischenschritt würde jede übersehene Inline-Stelle sofort zu einer
 * weißen Seite machen.
 */

export type ContentSecurityPolicyOptions = {
  /** Gesetzt heißt: Nonce-Fassung statt `'unsafe-inline'`. */
  nonce?: string;
  isProduction: boolean;
  /** Ziel für Verstoßmeldungen; nur für die Report-Only-Fassung sinnvoll. */
  reportPath?: string;
};

export const CSP_REPORT_PATH = "/api/csp-report";

/** Der Gruppenname, den `Reporting-Endpoints` und `report-to` teilen müssen. */
export const CSP_REPORT_GROUP = "csp";

export function buildContentSecurityPolicy({
  nonce,
  isProduction,
  reportPath,
}: ContentSecurityPolicyOptions): string {
  // `unsafe-eval` bleibt der Entwicklungsumgebung vorbehalten: Der
  // Dev-Server braucht es, die Produktion nie.
  const developmentEval = isProduction ? "" : " 'unsafe-eval'";
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentEval}`
    : `script-src 'self' 'unsafe-inline'${developmentEval}`;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    // Next und next/font setzen Stile inline. Eine Nonce hilft hier nicht,
    // weil auch React zur Laufzeit Stile schreibt.
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    // Kein `frame-src`: Es wird nichts eingebettet. Die frühere Ausnahme für
    // calendly.com stand im Widerspruch zu Abschnitt 7 der
    // Datenschutzhinweise, der zusagt, dass Buchungsseiten erst nach einem
    // Klick und dann in einem eigenen Aufruf geladen werden.
    "frame-src 'none'",
    ...(reportPath
      ? [`report-uri ${reportPath}`, `report-to ${CSP_REPORT_GROUP}`]
      : []),
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
