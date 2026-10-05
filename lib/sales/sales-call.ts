import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { salesCalendarUrl } from "./sales-call-model";

/**
 * Der Kalender für „Gespräch buchen“ (`SALES_CALL_URL`, etwa ein
 * Calendly-Ereignis). Ohne gültigen https-Link bleibt es beim Rückruf.
 */
export function salesCallUrl(): string | null {
  const raw = process.env.SALES_CALL_URL?.trim();
  return raw && salesCalendarUrl(raw) ? raw : null;
}

/**
 * Die Danke-Seite nach dem Absenden kennt den Kontakt nur über dieses
 * Token: Kennung und Zeitpunkt, signiert. Name und Adresse stehen so nie in
 * einer Adresszeile von XPORTAL, und wer das Token nicht hat, kann keinen
 * vorausgefüllten Kalenderlink zu einem fremden Kontakt erzeugen.
 *
 * Der Schlüssel wird aus dem Geheimnis der Abmeldelinks abgeleitet, mit
 * eigenem Zweck — wie bei den Antwortlinks der Vermittlung.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

function key(): Buffer | null {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update("sales-call-calendar-v1").digest();
}

function sign(payload: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function mintSalesCallToken(contactId: string, now: Date = new Date()): string | null {
  const secret = key();
  if (!secret || !UUID.test(contactId)) return null;
  const payload = `${contactId.toLowerCase()}:${Math.floor(now.getTime() / 1000)}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, secret)}`;
}

export function readSalesCallToken(token: unknown, now: Date = new Date()): string | null {
  const secret = key();
  if (!secret || typeof token !== "string") return null;
  const value = token.trim();
  if (!value || value.length > 200) return null;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded) || !/^[A-Za-z0-9_-]+$/u.test(signature)) return null;

  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = Buffer.from(sign(payload, secret), "utf8");
  const provided = Buffer.from(signature, "utf8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  const [contactId, issued] = payload.split(":");
  const issuedAt = Number(issued);
  if (!contactId || !UUID.test(contactId) || !Number.isInteger(issuedAt)) return null;
  const age = Math.floor(now.getTime() / 1000) - issuedAt;
  if (age < 0 || age > MAX_AGE_SECONDS) return null;
  return contactId;
}

/**
 * Name, Adresse und gesuchte Rolle aus dem Kontakt, für die Vorbelegung des
 * Kalenders. Wirft nie: Ohne Vorbelegung geht es trotzdem weiter, der Termin
 * ist wichtiger.
 */
export async function salesCallPrefill(
  contactId: string | null,
): Promise<{ fullName: string; email: string | null; role: string | null } | undefined> {
  if (!contactId || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return undefined;
  try {
    const { data } = await createAdminSupabaseClient()
      .from("crm_contacts")
      .select("contact_name,email,focus")
      .eq("id", contactId)
      .maybeSingle();
    const row = data as { contact_name: string | null; email: string | null; focus: string | null } | null;
    return row?.contact_name ? { fullName: row.contact_name, email: row.email, role: row.focus } : undefined;
  } catch {
    return undefined;
  }
}
