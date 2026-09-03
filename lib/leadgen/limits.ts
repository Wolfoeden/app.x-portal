/**
 * Die gemeinsamen Konstanten der Lead-Arbeitsfläche: Datenbankvertrag,
 * Serverrouten und Oberfläche lesen dieselben Werte. Ohne zod, damit die
 * Client-Komponente keine Prüfbibliothek mitschleppt, die sie nie ausführt.
 */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "replied",
  "dismissed",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Readonly<Record<LeadStatus, string>> = {
  new: "Offen",
  contacted: "Angeschrieben",
  replied: "Antwort da",
  dismissed: "Verworfen",
};

/**
 * Was die Liste zeigt. `open` ist die Standardansicht — bearbeitete Leads
 * sind archiviert und stehen dem laufenden Betrieb nicht im Weg.
 */
export const LEAD_SCOPES = ["open", "archived", "all"] as const;
export type LeadScope = (typeof LEAD_SCOPES)[number];

export const LEAD_SCOPE_LABELS: Readonly<Record<LeadScope, string>> = {
  open: "Offen",
  archived: "Archiv",
  all: "Alle",
};

export const LEAD_CATEGORY_MAX_LENGTH = 40;
export const LEAD_NOTES_MAX_LENGTH = 2_000;

/** Genau die Breite der Spalte `leadgen_outreach.subject`. */
export const LEAD_SUBJECT_MAX_LENGTH = 200;

/**
 * Was der Betreiber selbst eintippen darf.
 *
 * Bewusst kleiner als die Spalte `leadgen_outreach.body` (16.000): dort
 * landet die abgeschickte Fassung mitsamt Anrede und rechtlichem Fuss, und
 * der Fuss allein misst rund 1.000 Zeichen. Waeren beide Grenzen gleich,
 * schluege das Protokollieren fehl, nachdem die Mail schon raus ist.
 */
export const LEAD_BODY_MAX_LENGTH = 8_000;

export const LEAD_PAGE_SIZE = 50;

/**
 * Wie viele Leads ein Stapelversand höchstens anfasst.
 *
 * Die Zahl ist keine technische Grenze, sondern die Tagesmenge, die ein
 * Postfach bei IONOS unauffällig verschickt — dieselbe Grenze, die der
 * Akquise-Bot außerhalb dieser Anwendung einhält. Wer mehr verschickt,
 * landet im Spamfilter, und zwar dauerhaft.
 */
export const LEAD_BULK_SEND_LIMIT = 20;

export function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === "string" &&
    (LEAD_STATUSES as readonly string[]).includes(value)
  );
}

export function isLeadScope(value: unknown): value is LeadScope {
  return (
    typeof value === "string" &&
    (LEAD_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * Die Ausschreibung kommt als eine Zeile aus dem Importwerkzeug:
 * `Titel — Kurzbeschreibung — URL`. Für die Liste ist nur der Titel
 * interessant, für den Entwurf der ganze Text.
 */
export function leadHeadline(stellenanzeige: string): string {
  const [headline] = stellenanzeige.split(" — ");
  return (headline ?? stellenanzeige).trim() || stellenanzeige.trim();
}

export function leadSourceUrl(stellenanzeige: string): string | null {
  const match = stellenanzeige.match(/https?:\/\/\S+/u);
  if (!match) return null;
  // Ein Satzzeichen am Ende gehört nicht zur Adresse.
  return match[0].replace(/[),.;]+$/u, "");
}
