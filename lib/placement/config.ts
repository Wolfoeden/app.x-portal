/**
 * Das Vermittlungsmodell: kostenlos suchen, zahlen bei Beauftragung.
 *
 * Bis zum 28.09.2026 verdiente XPORTAL nur an Credit-Abos, und niemand hatte
 * je eines bezahlt. Der Plan „Vermittlungsmodell“ stellt auf ein einmaliges
 * Erfolgshonorar um: Der Kunde fragt einen Freelancer über XPORTAL an, stimmt
 * dabei den Vermittlungsbedingungen zu, XPORTAL stellt vor. Kommt es zur
 * Beauftragung, wird das Honorar fällig.
 *
 * Alles hängt an einem Schalter. Ist er aus, bleibt der bisherige Weg — der
 * Terminknopf führt direkt in den Kalender des Freelancers — unverändert.
 * Eingeschaltet werden darf er erst, wenn die Bedingungen rechtlich geprüft
 * sind; bis dahin steht über ihnen sichtbar „Entwurf“.
 *
 * Die Datei ist bewusst ohne Serverabhängigkeit: Oberfläche und Routen lesen
 * dieselben Zahlen.
 */

/**
 * Der Schalter. `NEXT_PUBLIC_`, weil auch die Oberfläche ihn braucht; der Wert
 * wird beim Build eingesetzt, eine Änderung braucht also ein neues Deploy.
 * Als Funktion, damit Tests ihn je Fall setzen können.
 */
export function placementRequestsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED === "true";
}

export const PLACEMENT_TERMS = {
  /** Wird bei jeder Zustimmung gespeichert. Neue Fassung, neue Kennung. */
  version: "vermittlung-2026-09-entwurf-1",
  /** `approved` erst nach der rechtlichen Prüfung. */
  status: "draft" as "draft" | "approved",
  /** Prozent des Auftragswerts. */
  feePercent: 10,
  /** Welcher Zeitraum der Zusammenarbeit zählt. */
  feeMonths: 3,
  /** Höchstens so viele Projekttage gehen in die Berechnung ein. */
  maxFeeDays: 60,
  /** Wie lange eine Vorstellung das Honorar auslöst. */
  protectionMonths: 12,
  /** Zahlungsziel der Rechnung. */
  paymentDays: 14,
} as const;

export const PLACEMENT_TERMS_PATH = "/vermittlungsbedingungen";

/**
 * Welche Kalenderadresse der Browser bekommt.
 *
 * Ohne Vermittlungsmodell die echte, wie bisher. Mit dem Modell nur noch den
 * eigenen Buchungslink, der erst nach der Vorstellung weiterleitet: Stünde
 * die echte Adresse im Suchergebnis, ließe sie sich an der Anfrage vorbei
 * aus der Seite lesen.
 */
export function clientBookingUrl(
  profileId: string,
  bookingUrl: string | null,
  siteUrl: string,
): string | null {
  if (!bookingUrl || !placementRequestsEnabled()) return bookingUrl;
  return `${siteUrl.replace(/\/+$/u, "")}/api/freelancers/${profileId}/book`;
}

/**
 * Das Honorar für einen Einsatz, in Cent. Tagessatz in Cent, Tage ganzzahlig.
 *
 * Es gilt die Fassung, der der Kunde bei der Anfrage zugestimmt hat. Ändern
 * sich die Bedingungen später, bleibt eine alte Anfrage bei ihren Zahlen.
 */
export function placementFeeCents(
  dayRateCents: number,
  projectDays: number,
  terms: { feePercent: number; maxFeeDays: number } = PLACEMENT_TERMS,
): number {
  if (!Number.isFinite(dayRateCents) || dayRateCents <= 0) return 0;
  if (!Number.isFinite(projectDays) || projectDays <= 0) return 0;
  const days = Math.min(Math.floor(projectDays), terms.maxFeeDays);
  return Math.round((dayRateCents * days * terms.feePercent) / 100);
}

/** Die drei Sätze, die bei jeder Anfrage über dem Häkchen stehen. */
export function placementTermsSummary(): string[] {
  const t = PLACEMENT_TERMS;
  return [
    "Suche, Vorstellung und Erstgespräch sind kostenlos.",
    `Beauftragen Sie den Freelancer, zahlen Sie einmalig ${t.feePercent} % des vereinbarten Honorars für die ersten ${t.feeMonths} Monate (höchstens ${t.maxFeeDays} Projekttage), zuzüglich Umsatzsteuer.`,
    `Das gilt für Beauftragungen innerhalb von ${t.protectionMonths} Monaten nach der Vorstellung, auch wenn der Vertrag später oder für ein anderes Projekt zustande kommt.`,
  ];
}
