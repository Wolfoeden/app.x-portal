/**
 * Die Themen der Kontaktseite (/contact), in der Reihenfolge des
 * Telefonleitfadens: erst die bekannten Einsatzfälle für KI-Agenten, dann die
 * Kompetenzen rund um sichere KI, dann Freelancer über den Talent Index
 * (früher die eigene Seite /gespraech), zuletzt alles andere.
 *
 * Ohne Server- und zod-Abhängigkeit, weil Seite, Route, Menü und Tests sie
 * teilen. Der Schlüssel steht in Links (`/contact/kundenservice`, früher
 * `/contact?thema=kundenservice`) und im Formular; geändert wird er
 * deshalb nicht.
 */

export type ContactTopicGroup = "agent" | "competence" | "recruiting" | "other";

export type ContactTopic = {
  key: string;
  /** Kurz, für das Formular und den Betreff. */
  label: string;
  group: ContactTopicGroup;
};

export const CONTACT_TOPICS = [
  { key: "kundenservice", label: "Kundenservice", group: "agent" },
  { key: "vertrieb", label: "Vertrieb", group: "agent" },
  { key: "daten", label: "Daten und Störungen", group: "agent" },
  { key: "wissen", label: "Mitarbeiterwissen", group: "agent" },
  { key: "lager", label: "Lager und Logistik", group: "agent" },
  { key: "schulung", label: "KI-Schulung", group: "competence" },
  { key: "cybersecurity", label: "Cybersecurity-Anforderungen", group: "competence" },
  { key: "iso27001", label: "ISMS / ISO 27001", group: "competence" },
  { key: "freelancer", label: "Freelancer finden", group: "recruiting" },
  { key: "anderes", label: "Etwas anderes", group: "other" },
] as const satisfies readonly ContactTopic[];

export type ContactTopicKey = (typeof CONTACT_TOPICS)[number]["key"];

const BY_KEY = new Map<string, ContactTopic>(CONTACT_TOPICS.map((topic) => [topic.key, topic]));

export function isContactTopicKey(value: unknown): value is ContactTopicKey {
  return typeof value === "string" && BY_KEY.has(value);
}

export function contactTopicLabel(key: ContactTopicKey): string {
  return BY_KEY.get(key)!.label;
}

/** Ein Thema, zu dem XPORTAL selbst etwas anbietet (Agent, Kompetenz, Freelancer). */
export function isBusinessTopic(key: ContactTopicKey): boolean {
  return BY_KEY.get(key)!.group !== "other";
}

/**
 * Die alten Links aus dem Menü (`/contact?betreff=Compliance%20Check`,
 * `…=KI-Webinar`) stehen in Mails und Lesezeichen. Sie haken das passende
 * Thema an, statt ins Leere zu führen.
 */
const LEGACY_SUBJECTS: Record<string, ContactTopicKey> = {
  "Compliance Check": "iso27001",
  "KI-Webinar": "schulung",
};

/**
 * Die vorausgewählten Themen aus der Adresse: `thema` (auch mehrfach) und
 * der alte `betreff`. Unbekanntes fällt heraus, damit kein Link beliebigen
 * Text ins Formular schreibt.
 */
export function topicsFromQuery(
  thema: string | string[] | undefined,
  betreff: string | string[] | undefined,
): ContactTopicKey[] {
  const raw = [
    ...(Array.isArray(thema) ? thema : thema ? [thema] : []).flatMap((value) => value.split(",")),
    ...(Array.isArray(betreff) ? betreff : betreff ? [betreff] : []).map((value) => LEGACY_SUBJECTS[value] ?? ""),
  ];
  const picked = new Set(raw.map((value) => value.trim().toLocaleLowerCase("de-DE")).filter(isContactTopicKey));
  return CONTACT_TOPICS.map((topic) => topic.key).filter((key) => picked.has(key));
}

/** Wie sich XPORTAL melden soll. */
export const CONTACT_WAYS = [
  { key: "rueckruf", label: "Rückruf" },
  { key: "email", label: "E-Mail" },
  { key: "termin", label: "Ich buche selbst einen Termin" },
] as const;

export type ContactWay = (typeof CONTACT_WAYS)[number]["key"];

export function isContactWay(value: unknown): value is ContactWay {
  return CONTACT_WAYS.some((way) => way.key === value);
}
