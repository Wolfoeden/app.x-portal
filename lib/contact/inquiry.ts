import { z } from "zod";

import {
  CONTACT_TOPICS,
  CONTACT_WAYS,
  contactTopicLabel,
  isBusinessTopic,
  isContactTopicKey,
  type ContactTopicKey,
  type ContactWay,
} from "./topics";

/**
 * Das Formular der Kontaktseite: Themen zum Anhaken, Name, Unternehmen,
 * Adresse, Telefon, ein paar Sätze und der gewünschte Rückweg.
 *
 * Reine Funktionen ohne Datenbank, damit Route und Tests sie teilen. Die
 * Tabelle `contact_requests` bleibt, wie sie ist: Themen werden zum Betreff,
 * Unternehmen, Telefon und Rückweg stehen als Zeilen über der Nachricht.
 */

const TOPIC_KEYS = CONTACT_TOPICS.map((topic) => topic.key) as [ContactTopicKey, ...ContactTopicKey[]];
const WAY_KEYS = CONTACT_WAYS.map((way) => way.key) as [ContactWay, ...ContactWay[]];

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

/** Wie bei „Gespräch buchen“: Ziffern, Leerzeichen, + ( ) / -. */
const PHONE = /^[+0-9][0-9 ()/-]{4,39}$/u;

/** So steht eine Anfrage von der Kontaktseite im CRM (`crm_contacts.source`). */
export const CONTACT_INQUIRY_SOURCE = "website_kontakt";

/** Ohne Thema braucht es ein paar Worte, sonst weiß niemand, worum es geht. */
export const MIN_MESSAGE_WITHOUT_TOPIC = 10;

export const ContactInquirySchema = z
  .object({
    topics: z.array(z.enum(TOPIC_KEYS)).max(TOPIC_KEYS.length),
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(160),
    company: optional(120),
    phone: optional(40).refine((value) => value === null || PHONE.test(value), { message: "phone" }),
    way: z.enum(WAY_KEYS),
    message: z.string().trim().max(3_000),
    /** Honigtopf: Menschen sehen das Feld nicht und lassen es leer. */
    website: z.string().max(200).optional().default(""),
  })
  .strict()
  .refine((value) => value.topics.length > 0 || value.message.length >= MIN_MESSAGE_WITHOUT_TOPIC, {
    message: "content",
  });

export type ContactInquiry = z.infer<typeof ContactInquirySchema>;

/** Liest das Formular in das Schema. Unbekannte Themen fallen heraus. */
export function contactInquiryFromForm(form: FormData): unknown {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const picked = new Set(form.getAll("topic").filter(isContactTopicKey));
  return {
    topics: TOPIC_KEYS.filter((key) => picked.has(key)),
    fullName: field("fullName"),
    email: field("email"),
    company: field("company"),
    phone: field("phone"),
    way: field("way") || "email",
    message: field("message"),
    website: field("website"),
  };
}

export function inquiryTopicLabels(inquiry: Pick<ContactInquiry, "topics">): string[] {
  return inquiry.topics.map(contactTopicLabel);
}

/** Geht es um etwas, das XPORTAL selbst anbietet? Dann auch ins CRM. */
export function isBusinessInquiry(inquiry: Pick<ContactInquiry, "topics">): boolean {
  return inquiry.topics.some(isBusinessTopic);
}

/** Der Betreff in `contact_requests` und in beiden Mails. */
export function inquirySubject(inquiry: Pick<ContactInquiry, "topics">): string {
  const labels = inquiryTopicLabels(inquiry);
  return (labels.length ? labels.join(", ") : "Allgemeine Anfrage").slice(0, 150);
}

function wayLine(inquiry: Pick<ContactInquiry, "way" | "phone">): string {
  if (inquiry.way === "rueckruf") {
    return inquiry.phone
      ? "Gewünschte Rückmeldung: Rückruf"
      : "Gewünschte Rückmeldung: Rückruf (keine Telefonnummer angegeben, bitte per E-Mail nachfragen)";
  }
  if (inquiry.way === "termin") return "Gewünschte Rückmeldung: bucht selbst einen Termin";
  return "Gewünschte Rückmeldung: E-Mail";
}

/**
 * Die Nachricht in `contact_requests`: die Angaben neben dem Text als Zeilen,
 * darunter der Text selbst. Mindestens 20 Zeichen, wie die Spalte verlangt —
 * die Zeile zum Rückweg steht immer da.
 */
export function inquiryMessage(inquiry: ContactInquiry): string {
  return [
    ...(inquiry.company ? [`Unternehmen: ${inquiry.company}`] : []),
    ...(inquiry.phone ? [`Telefon: ${inquiry.phone}`] : []),
    wayLine(inquiry),
    "",
    inquiry.message || "(Kein Text, nur Themen gewählt.)",
  ]
    .join("\n")
    .slice(0, 5_000);
}
