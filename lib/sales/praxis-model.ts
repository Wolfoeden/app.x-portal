import type { Contact } from "@/lib/crm/contacts-model";
import { SIGNATURE_LINES } from "@/lib/email/signature";

import { SALES_CONTACT } from "./sales-contact-model";

/**
 * Die Praxisseite (/praxis): Nach dem Telefonat schickt der Betreiber —
 * nur mit dem „Ja“ aus dem Gespräch — eine Mail mit diesem Link. Die Seite
 * ist für alle Firmen gleich; nur der Link trägt ein Kürzel (`?t=`), damit
 * im Admin steht, wer geöffnet, was markiert und den Kalender geöffnet hat.
 *
 * Ohne Serverabhängigkeit, damit Admin-Seite, Route und Tests den Entwurf
 * teilen. Das Kürzel selbst entsteht in lib/sales/praxis.ts.
 */

export const PRAXIS_PATH = "/praxis";

export function praxisLink(site: string, token: string | null): string {
  return token ? `${site}${PRAXIS_PATH}?t=${encodeURIComponent(token)}` : `${site}${PRAXIS_PATH}`;
}

/**
 * Die Mail nach dem Anruf. Anrede mit Namen, der Rest für alle gleich; mit
 * dem Hinweis, wie man keine weiteren Nachrichten bekommt.
 */
export function praxisMailDraft(contact: Pick<Contact, "contactName">, link: string): { subject: string; body: string } {
  const greeting = contact.contactName ? `Guten Tag ${contact.contactName},` : "Guten Tag,";
  return {
    subject: "Wie besprochen: so arbeiten andere Unternehmen schon mit KI",
    body: [
      greeting,
      "",
      "danke für das Gespräch eben. Wie versprochen: drei Beispiele, wie andere Unternehmen schon mit KI arbeiten. Einen Termin können Sie direkt dort wählen:",
      "",
      link,
      "",
      ...SIGNATURE_LINES,
      SALES_CONTACT.phone,
      "",
      "—",
      "Sie bekommen diese Mail, weil Sie im Telefonat zugestimmt haben. Wenn Sie keine weiteren Nachrichten wünschen, genügt eine kurze Antwort.",
    ].join("\n"),
  };
}
