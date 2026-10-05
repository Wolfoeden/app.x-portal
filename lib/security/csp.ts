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

/**
 * Die Herkuenfte, die hCaptcha braucht.
 *
 * Das Widget laedt sein Skript von `js.hcaptcha.com`, baut die Aufgabe in einem
 * iframe von `*.hcaptcha.com` auf und meldet die Antwort an dieselbe Domain.
 * Ohne alle drei Direktiven erscheint statt des Kaestchens nichts.
 *
 * Der frueher hier stehende Satz "Kein `frame-src`: Es wird nichts eingebettet"
 * gilt damit nicht mehr uneingeschraenkt. Die Zusage aus Abschnitt 6 der
 * Datenschutzhinweise — Buchungsseiten von Freelancern erst nach einem Klick
 * und in einem eigenen Aufruf — bleibt davon unberuehrt.
 */
const HCAPTCHA_ORIGINS = "https://hcaptcha.com https://*.hcaptcha.com";

/**
 * Der Kalender fuer „Gespraech buchen“ mit XPORTAL selbst. Er erscheint erst,
 * nachdem jemand die Gespraechsanfrage abgeschickt hat, und nur auf der
 * Danke-Seite (Abschnitt 7 der Datenschutzhinweise). Genau dieser eine Dienst,
 * kein Platzhalter: Buchungsseiten von Freelancern bleiben aussen vor.
 * Muss mit SALES_CALENDAR_EMBED_ORIGIN in lib/sales/sales-call-model.ts
 * uebereinstimmen.
 */
export const SALES_CALENDAR_FRAME_ORIGIN = "https://calendly.com";

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
  // In der Nonce-Fassung ignorieren Browser wegen `'strict-dynamic'` jede
  // Herkunftsliste — dort traegt das hCaptcha-Skript die Nonce selbst. Die
  // durchgesetzte Fassung kennt `'strict-dynamic'` nicht und braucht die
  // Herkunft ausgeschrieben, sonst wird das Skript blockiert.
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentEval}`
    : `script-src 'self' 'unsafe-inline' ${HCAPTCHA_ORIGINS}${developmentEval}`;

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
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${HCAPTCHA_ORIGINS}`,
    // Eingebettet werden hCaptcha und der eigene Gesprächskalender auf der
    // Danke-Seite von /gespraech. Buchungsseiten von Freelancern nicht:
    // Abschnitt 6 der Datenschutzhinweise sagt zu, dass sie erst nach einem
    // Klick und dann in einem eigenen Aufruf geladen werden.
    `frame-src ${HCAPTCHA_ORIGINS} ${SALES_CALENDAR_FRAME_ORIGIN}`,
    ...(reportPath
      ? [`report-uri ${reportPath}`, `report-to ${CSP_REPORT_GROUP}`]
      : []),
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
