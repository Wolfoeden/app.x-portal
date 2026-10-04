import { z } from "zod";

import { IMPRINT_EMAIL, PROVIDER_IMPRINT_LINES } from "@/lib/legal/policy";

/**
 * „Gespräch buchen“: Ein Unternehmen bittet um ein kurzes Gespräch mit
 * XPORTAL, bevor es selbst sucht. Das ist der Weg für alle, die lieber mit
 * einem Menschen sprechen, als einen Projekttext in einen Chat zu kopieren.
 *
 * Reine Funktionen ohne Datenbank und ohne Umgebung: das Formular, die Notiz
 * im CRM, der Kalenderlink, die beiden Mails. Seite, Route und Tests teilen
 * sie.
 *
 * Ablauf: Formular (ohne JavaScript, wie das Kontaktformular) → Kontakt in
 * `crm_contacts` mit Wiedervorlage heute → Mail an den Betreiber und eine
 * Bestätigung an den Absender → Danke-Seite mit „Termin wählen“. Der Termin
 * selbst liegt beim Kalenderdienst; XPORTAL bettet ihn nicht ein.
 */

export {
  SALES_CALL_ENTRIES,
  SALES_CALL_KIND,
  SALES_CALL_PATH,
  isSalesCallEntry,
  salesCallHref,
  type SalesCallEntry,
} from "./sales-call-links";

export const SALES_CALL_SOURCE = "website_gespraech";

/** Wie lang das Gespräch ist — steht auf der Seite und in der Bestätigung. */
export const SALES_CALL_MINUTES = 20;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

export const SalesCallSchema = z
  .object({
    company: z.string().trim().min(2).max(200),
    fullName: z.string().trim().min(2).max(160),
    email: z.string().trim().toLowerCase().email().max(160),
    role: z.string().trim().min(2).max(200),
    phone: optional(40).refine((value) => value === null || /^[+0-9][0-9 ()/-]{4,39}$/u.test(value), {
      message: "phone",
    }),
    start: optional(80),
    duration: optional(80),
    rate: optional(80),
    note: optional(2_000),
    consent: z.literal("on"),
    /** Honigtopf: Menschen sehen das Feld nicht und lassen es leer. */
    website: z.string().max(200).optional().default(""),
  })
  .strict();

export type SalesCallInput = z.infer<typeof SalesCallSchema>;

/** Liest das Formular in das Schema; fehlende Felder werden zu leeren Texten. */
export function salesCallFromForm(form: FormData): unknown {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const consent = field("consent");
  return {
    company: field("company"),
    fullName: field("fullName"),
    email: field("email"),
    role: field("role"),
    phone: field("phone"),
    start: field("start"),
    duration: field("duration"),
    rate: field("rate"),
    note: field("note"),
    ...(consent ? { consent } : {}),
    website: field("website"),
  };
}

/** Die Angaben neben der Rolle, eine Zeile je Angabe — für CRM und Mail. */
function detailLines(input: SalesCallInput): string[] {
  return [
    input.start ? `Start: ${input.start}` : null,
    input.duration ? `Dauer: ${input.duration}` : null,
    input.rate ? `Tagessatz-Rahmen: ${input.rate}` : null,
    input.phone ? `Telefon: ${input.phone}` : null,
  ].filter((line): line is string => line !== null);
}

/** Die Notiz am Kontakt. Höchstens 2.000 Zeichen, wie die Spalte. */
export function salesCallNote(input: SalesCallInput): string {
  return [`Gesucht: ${input.role}`, ...detailLines(input), ...(input.note ? ["", input.note] : [])]
    .join("\n")
    .slice(0, 2_000);
}

/**
 * Der Kalenderlink mit vorausgefüllten Angaben, damit niemand Name und
 * Adresse ein zweites Mal tippt. `name`, `email` und `a1` (die erste eigene
 * Frage) sind die Parameter von Calendly; andere Dienste ignorieren sie.
 * Nur https; alles andere ergibt `null`.
 */
export function salesCalendarUrl(
  base: string | null | undefined,
  prefill?: { fullName: string; email: string | null; role: string | null },
): string | null {
  let url: URL;
  try {
    url = new URL((base ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
  if (prefill) {
    url.searchParams.set("name", prefill.fullName);
    if (prefill.email) url.searchParams.set("email", prefill.email);
    if (prefill.role) url.searchParams.set("a1", prefill.role);
  }
  url.searchParams.set("utm_source", "x-portal");
  return url.toString();
}

/**
 * Die Benachrichtigung ins eigene Postfach. Alles, was der Absender
 * angegeben hat, dazu der Weg zum Kontakt im Admin — die Antwort soll ohne
 * Umweg über die Datenbank möglich sein.
 */
export function salesCallNotificationMessage(
  input: SalesCallInput,
  links: { contactUrl: string },
): { subject: string; text: string } {
  return {
    subject: `Gesprächsanfrage: ${input.company} – ${input.role}`.slice(0, 180),
    text: [
      `Firma:   ${input.company}`,
      `Name:    ${input.fullName}`,
      `Adresse: ${input.email}`,
      `Gesucht: ${input.role}`,
      ...detailLines(input),
      ...(input.note ? ["", "Notiz:", input.note] : []),
      "",
      `Im CRM (Wiedervorlage heute): ${links.contactUrl}`,
      "",
      "—",
      "Automatisch erzeugt aus „Gespräch buchen“ auf https://x-portal.eu/gespraech.",
      "Ob schon ein Termin im Kalender steht, zeigt der Kalenderdienst.",
    ].join("\n"),
  };
}

/**
 * Die Bestätigung an den Absender. Sie zitiert keine freien Eingaben —
 * die Adresse ist ungeprüft, und über das Formular soll sich fremden
 * Postfächern kein Text zustellen lassen. Nur der Kalenderlink, falls einer
 * eingerichtet ist, damit sich der Termin auch später noch wählen lässt.
 */
export function salesCallAcknowledgementMessage(
  input: Pick<SalesCallInput, "fullName">,
  calendarUrl: string | null,
): { subject: string; text: string } {
  return {
    subject: "Ihre Gesprächsanfrage bei XPORTAL",
    text: [
      `Guten Tag ${input.fullName},`,
      "",
      "danke für Ihre Anfrage. Wir melden uns werktags innerhalb weniger Stunden.",
      ...(calendarUrl
        ? ["", `Wenn Sie gleich einen Termin für ein ${SALES_CALL_MINUTES}-Minuten-Gespräch wählen möchten:`, calendarUrl]
        : []),
      "",
      "Im Gespräch klären wir, wen Sie suchen, ab wann und zu welchem Rahmen. Danach stellen wir Ihnen passende Freelancer vor. Kosten entstehen erst, wenn Sie einen Freelancer beauftragen.",
      "",
      "Falls Sie diese Anfrage nicht gestellt haben, hat jemand Ihre Adresse in unser Formular eingetragen. Eine kurze Antwort genügt, dann löschen wir sie.",
      "",
      ...PROVIDER_IMPRINT_LINES,
      `${IMPRINT_EMAIL} · https://x-portal.eu/imprint`,
    ].join("\n"),
  };
}
