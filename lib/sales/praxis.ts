import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Das Kürzel im Link der Praxisseite: Kennung des CRM-Kontakts und
 * Zeitpunkt, signiert — wie das Token des Kalenderlinks
 * (lib/sales/sales-call.ts), mit eigenem Zweck und längerer Gültigkeit,
 * weil eine Mail auch nach Wochen noch geöffnet wird.
 *
 * Ein abgelaufenes oder fremdes Kürzel macht die Seite nicht kaputt: Sie
 * ist für alle gleich, nur die Zuordnung im Admin fehlt dann.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

function key(): Buffer | null {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update("praxis-link-v1").digest();
}

function sign(payload: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function mintPraxisToken(contactId: string, now: Date = new Date()): string | null {
  const secret = key();
  if (!secret || !UUID.test(contactId)) return null;
  const payload = `${contactId.toLowerCase()}:${Math.floor(now.getTime() / 1000)}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, secret)}`;
}

export function readPraxisToken(token: unknown, now: Date = new Date()): string | null {
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
