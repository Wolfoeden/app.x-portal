import "server-only";

import { z } from "zod";

import { getClientIp, logEvent } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

/**
 * Wer ohne Konto anfragt oder einen Suchauftrag gibt, nennt E-Mail und Firma,
 * damit XPORTAL vorstellen und nachfragen kann. `website` ist ein Honigtopf:
 * Menschen sehen das Feld nicht, Formular-Bots füllen es.
 *
 * Geteilt von der Anfrage aus der Ergebnisliste (app/api/introductions) und
 * dem Suchauftrag (app/api/search-mandates), damit beide dieselbe Schwelle
 * haben.
 */
export const GuestContactSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(320).email(),
    company: z.string().trim().min(2).max(200),
    name: z.string().trim().max(120).optional().transform((value) => value || null),
    website: z.string().max(200).optional(),
  })
  .strict();

export type GuestContact = { email: string; company: string; name: string | null };

/** Wie viele Vorgänge ohne Konto je Adresse und Tag, je Weg getrennt gezählt. */
export const GUEST_REQUESTS_PER_IP_PER_DAY = 10;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function jsonResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GUEST_LIMIT_ERROR =
  "Sie haben heute schon mehrere Anfragen gesendet. Bitte versuchen Sie es morgen erneut oder legen Sie ein Konto an.";

/**
 * Honigtopf und Grenze je Adresse. Wirft eine fertige Antwort, wenn der
 * Vorgang nicht angenommen wird; die Grenze je Gast zählt der Aufrufer in
 * seiner eigenen Tabelle.
 */
export async function admitGuestContact(
  request: Request,
  contact: z.infer<typeof GuestContactSchema>,
  userId: string,
  scope: "placement" | "mandate",
): Promise<GuestContact> {
  if (contact.website) {
    logEvent(scope === "placement" ? "guest_request_honeypot" : "guest_mandate_honeypot", { userId });
    throw jsonResponse(400, "Die Anfrage konnte nicht gesendet werden.");
  }
  const ipLimit = await consumeRateLimit(
    `guest-${scope}-ip:${getClientIp(request)}`,
    GUEST_REQUESTS_PER_IP_PER_DAY,
    DAY_MS,
  );
  if (!ipLimit.allowed) throw jsonResponse(429, GUEST_LIMIT_ERROR);
  return { email: contact.email, company: contact.company, name: contact.name };
}
