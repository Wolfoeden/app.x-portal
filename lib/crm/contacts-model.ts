/**
 * Kontakte für die eigene Akquise: Recruiter und Auftraggeber, die der
 * Betreiber selbst anspricht (public.crm_contacts).
 *
 * Reine Funktionen ohne Datenbank: der Import aus einer Tabelle, die Stufen,
 * der Mail-Entwurf. Die Seite, die Routen und die Tests teilen sie.
 *
 * Keine automatische Ansprache. XPORTAL bereitet eine Mail vor; geschrieben
 * und abgeschickt wird sie aus dem Postfach des Betreibers, im Einzelfall.
 * Werbe-E-Mails ohne Einwilligung sind nach § 7 Abs. 2 Nr. 2 UWG auch
 * gegenüber Unternehmen grundsätzlich unzulässig — eine persönliche Anfrage
 * zu einem konkreten Projekt ist etwas anderes als ein Serienversand.
 */

export const CONTACT_STAGES = [
  "new",
  "contacted",
  "replied",
  "meeting",
  "customer",
  "not_interested",
  "do_not_contact",
] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];

export const CONTACT_STAGE_LABELS: Readonly<Record<ContactStage, string>> = {
  new: "Neu",
  contacted: "Angeschrieben",
  replied: "Antwort",
  meeting: "Gespräch",
  customer: "Kunde",
  not_interested: "Kein Interesse",
  do_not_contact: "Nicht kontaktieren",
};

/** Die Stufen, die noch Arbeit sind — in der Reihenfolge der Pipeline. */
export const OPEN_CONTACT_STAGES: readonly ContactStage[] = ["new", "contacted", "replied", "meeting"];

export function isContactStage(value: unknown): value is ContactStage {
  return typeof value === "string" && (CONTACT_STAGES as readonly string[]).includes(value);
}

export const EMAIL_KINDS = ["personal", "company", "team", "none", "unknown"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const EMAIL_KIND_LABELS: Readonly<Record<EmailKind, string>> = {
  personal: "Persönlich",
  company: "Firmenpostfach",
  team: "Team-/Projektpostfach",
  none: "Keine öffentliche E-Mail",
  unknown: "Unbekannt",
};

export type ContactInput = {
  company: string;
  contactName: string | null;
  roleTitle: string | null;
  kind: string | null;
  region: string | null;
  focus: string | null;
  email: string | null;
  emailKind: EmailKind;
  emailSourceUrl: string | null;
  projectUrl: string | null;
  note: string | null;
};

export type Contact = ContactInput & {
  id: string;
  source: string;
  stage: ContactStage;
  nextFollowUpOn: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactEvent = {
  id: string;
  kind: "imported" | "note" | "stage" | "mail_drafted" | "updated";
  body: string | null;
  fromStage: ContactStage | null;
  toStage: ContactStage | null;
  createdAt: string;
};

// Import ------------------------------------------------------------------------

type Field = keyof ContactInput;

/**
 * Spaltennamen, wie sie in Tabellen vorkommen. Kleingeschrieben, ohne
 * Satzzeichen verglichen: „E-Mail-Adresse“, „E-Mail“ und „email“ meinen
 * dasselbe.
 */
const HEADER_ALIASES: Readonly<Record<Field, readonly string[]>> = {
  company: ["unternehmen", "firma", "company", "organisation", "organization"],
  contactName: ["ansprechpartner", "ansprechpartnerin", "kontakt", "name", "person", "contact", "contactname"],
  roleTitle: ["funktion", "rolle", "position", "titel", "title", "role", "jobtitle"],
  kind: ["typ", "art", "type", "kategorie", "category"],
  region: ["region", "ort", "standort", "location", "land"],
  focus: ["aibezuganzeige", "aibezug", "kibezug", "schwerpunkt", "fokus", "focus", "anzeige", "thema"],
  email: ["emailadresse", "email", "mail", "emailaddress"],
  emailKind: ["emailart", "adressart", "emailtyp", "emailkind"],
  emailSourceUrl: ["emailquelle", "quelle", "quellenlink", "source", "sourceurl"],
  projectUrl: ["projektlink", "projekt", "anzeigelink", "posting", "projecturl", "url", "link"],
  note: ["hinweis", "notiz", "anmerkung", "note", "notes", "kommentar"],
};

function headerKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
}

function fieldForHeader(header: string): Field | null {
  const key = headerKey(header);
  if (!key) return null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[Field, readonly string[]]>) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

/**
 * Aus Excel kopiert heißt Tabulatoren — irgendwo im Text, nicht unbedingt in
 * der ersten Zeile: Titelzeilen über der Kopfzeile haben nur eine Zelle.
 * Sonst entscheidet, ob Semikolon oder Komma in den ersten Zeilen häufiger ist.
 */
function detectDelimiter(text: string): string {
  if (text.includes("\t")) return "\t";
  const head = text.split("\n").slice(0, 20).join("\n");
  const semicolons = (head.match(/;/gu) ?? []).length;
  const commas = (head.match(/,/gu) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

/** Zeilen und Zellen aus CSV oder aus Excel kopiertem Text (Tabulatoren). */
export function splitTable(text: string): string[][] {
  const normalized = text.replace(/\r\n?/gu, "\n");
  const delimiter = detectDelimiter(normalized);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]!;
    if (quoted) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Leere Zeilen bleiben stehen, damit die Zeilennummern im Bericht stimmen.
  return rows;
}

/** Die Adressart aus dem Wortlaut der Tabelle, z. B. „Zentrale; z. Hd. Person“. */
export function emailKindFrom(label: string | null, email: string | null): EmailKind {
  const value = (label ?? "").toLocaleLowerCase("de-DE");
  if (!email) return "none";
  if (/persönlich|personal|direkt/u.test(value)) return "personal";
  if (/team|projekt|project/u.test(value)) return "team";
  if (/firm|zentrale|company|info|allgemein/u.test(value)) return "company";
  if (/keine/u.test(value)) return "none";
  return "unknown";
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const PLACEHOLDER_NAMES = /^(nicht genannt|unbekannt|n\/a|-|—)$/iu;

function clean(value: string | undefined, max: number): string | null {
  const text = (value ?? "").replace(/\s+/gu, " ").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function cleanUrl(value: string | undefined): string | null {
  const text = clean(value, 500);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type ParsedImport = {
  contacts: ContactInput[];
  /** Zeilen, die nicht übernommen werden, mit Zeilennummer und Grund. */
  skipped: Array<{ line: number; reason: string }>;
  /** Spalten, die keinem Feld zugeordnet werden konnten. */
  unmappedHeaders: string[];
};

/**
 * Liest eine Tabelle mit Kopfzeile. Die Kopfzeile ist die erste Zeile, die
 * eine Firmen-Spalte nennt — Titel- und Stand-Zeilen darüber, wie in der
 * Excel-Vorlage, werden übersprungen.
 *
 * Nichts wird erfunden: Eine Adresse, die keine ist, bleibt leer; „Nicht
 * genannt“ ist kein Name.
 */
export function parseContactTable(text: string, maxRows = 2_000): ParsedImport {
  const rows = splitTable(text);
  const headerIndex = rows.findIndex((cells) => cells.some((cell) => fieldForHeader(cell) === "company"));
  if (headerIndex < 0) {
    return {
      contacts: [],
      skipped: [{ line: 1, reason: "Keine Kopfzeile mit einer Spalte „Unternehmen“ oder „Firma“ gefunden." }],
      unmappedHeaders: [],
    };
  }

  const headers = rows[headerIndex]!;
  const mapping = headers.map(fieldForHeader);
  const unmappedHeaders = headers.filter((header, index) => header.trim() && mapping[index] === null).map((header) => header.trim());
  const contacts: ContactInput[] = [];
  const skipped: ParsedImport["skipped"] = [];
  const seen = new Set<string>();

  rows.slice(headerIndex + 1, headerIndex + 1 + maxRows).forEach((cells, offset) => {
    if (!cells.some((value) => value.trim())) return;
    const line = headerIndex + offset + 2;
    const raw: Partial<Record<Field, string>> = {};
    mapping.forEach((field, index) => {
      if (field && raw[field] === undefined) raw[field] = cells[index];
    });

    const company = clean(raw.company, 200);
    if (!company) {
      skipped.push({ line, reason: "Ohne Unternehmen." });
      return;
    }
    const emailText = clean(raw.email, 254)?.toLowerCase() ?? null;
    const email = emailText && EMAIL_PATTERN.test(emailText) ? emailText : null;
    const name = clean(raw.contactName, 160);
    const contact: ContactInput = {
      company,
      contactName: name && !PLACEHOLDER_NAMES.test(name) ? name : null,
      roleTitle: clean(raw.roleTitle, 200),
      kind: clean(raw.kind, 80),
      region: clean(raw.region, 160),
      focus: clean(raw.focus, 400),
      email,
      emailKind: emailKindFrom(clean(raw.emailKind, 80), email),
      emailSourceUrl: cleanUrl(raw.emailSourceUrl),
      projectUrl: cleanUrl(raw.projectUrl),
      note: clean(raw.note, 2000),
    };
    const key = contactDedupeKey(contact);
    if (seen.has(key)) {
      skipped.push({ line, reason: "Doppelt in dieser Tabelle." });
      return;
    }
    seen.add(key);
    contacts.push(contact);
  });

  return { contacts, skipped, unmappedHeaders };
}

/**
 * Derselbe Kontakt aus zwei Importen: Firma, Person und Adresse,
 * kleingeschrieben. Zwei Personen hinter demselben Firmenpostfach bleiben
 * zwei Kontakte; dieselbe Person mit neuer Adresse wird ein neuer.
 */
export function contactDedupeKey(contact: Pick<ContactInput, "company" | "contactName" | "email">): string {
  const part = (value: string | null) => (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("de-DE").replace(/\s+/gu, " ");
  return [part(contact.company), part(contact.contactName), part(contact.email)].join("|").slice(0, 700);
}

// Arbeit --------------------------------------------------------------------------

/** Fällig, wenn die Wiedervorlage heute oder früher ist und der Kontakt noch offen. */
export function isFollowUpDue(
  contact: Pick<Contact, "nextFollowUpOn" | "stage">,
  today: string,
): boolean {
  return Boolean(
    contact.nextFollowUpOn &&
      contact.nextFollowUpOn <= today &&
      (OPEN_CONTACT_STAGES as readonly string[]).includes(contact.stage),
  );
}

/** Heute als JJJJ-MM-TT in Berliner Zeit. */
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}

/** Wiedervorlage in `days` Werktagen-ungefähr: Kalendertage, Wochenende auf Montag. */
export function followUpDate(from: Date, days: number): string {
  const date = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export const SITE_FOR_MAIL = "https://x-portal.eu";

/**
 * Ein Entwurf, den der Betreiber anpasst und aus seinem Postfach schickt.
 *
 * Kurz, persönlich, mit einem konkreten Anlass und einem Weg, der ohne
 * Konto funktioniert. Der letzte Absatz nennt die Herkunft der Adresse und
 * den Widerspruch (Art. 14 und 21 DSGVO) — er gehört in die erste Mail,
 * nicht in eine spätere.
 */
export function contactMailDraft(contact: Pick<Contact, "company" | "contactName" | "focus" | "projectUrl" | "emailSourceUrl">): {
  subject: string;
  body: string;
} {
  const greeting = contact.contactName ? `Guten Tag ${contact.contactName},` : "Guten Tag,";
  const topic = contact.focus ? contact.focus.split(/[,;/]/u)[0]!.trim() : "AI Agents";
  const anlass = contact.projectUrl
    ? `ich habe Ihre Ausschreibung gesehen (${contact.projectUrl}).`
    : `ich habe gesehen, dass ${contact.company} regelmäßig Projekte im Bereich ${topic} besetzt.`;
  const subject = `Freelancer für ${topic} – XPORTAL`;
  const body = [
    greeting,
    "",
    anlass,
    "",
    "Mit XPORTAL fügen Sie eine Projektbeschreibung ein und sehen in wenigen Sekunden, welche geprüften Freelancer passen – mit Honorar, Stand der Verfügbarkeit und den Punkten, die vor einem Gespräch offen sind. Suche, Anfrage und Vorstellung sind kostenlos; eine Gebühr fällt nur bei einer Beauftragung an.",
    "",
    `Direkt ausprobieren, ohne Konto: ${SITE_FOR_MAIL}/chat?beispiel=ai-agenten`,
    "",
    "Passt ein kurzer Austausch in den nächsten Tagen?",
    "",
    "Viele Grüße",
    "",
    "—",
    `Ihre Adresse stammt aus ${contact.emailSourceUrl ? contact.emailSourceUrl : "einer öffentlichen Quelle zu Ihrem Unternehmen"}. Wenn Sie keine weiteren Nachrichten wünschen, genügt eine kurze Antwort; ich trage Sie dann aus.`,
  ].join("\n");
  return { subject, body };
}

/** `mailto:`-Link für den Entwurf; öffnet das Mailprogramm des Betreibers. */
export function mailtoHref(email: string, draft: { subject: string; body: string }): string {
  const params = new URLSearchParams({ subject: draft.subject, body: draft.body });
  // URLSearchParams kodiert Leerzeichen als „+“, mailto erwartet %20.
  return `mailto:${encodeURIComponent(email).replace(/%40/gu, "@")}?${params.toString().replace(/\+/gu, "%20")}`;
}
