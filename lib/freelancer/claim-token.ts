import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Der Übernahme-Link für ein Profil, das der Betreiber angelegt hat
 * (21.10.2026).
 *
 * 62 der 68 Profile gehören keinem Konto: Niemand kann sie pflegen, und
 * Anfragen erreichen die Person nur, wenn der Betreiber ihre Adresse kennt.
 * Der Link erlaubt es der Person, das Profil mit ihrem eigenen Konto zu
 * übernehmen. Wie der Praxis-Link (lib/sales/praxis.ts): HMAC mit eigenem
 * Zweck, Ausstellungszeit im Kennzeichen, 90 Tage gültig. Übernehmen lässt
 * sich ein Profil nur einmal; die Route prüft, dass es noch niemandem gehört.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export const CLAIM_LINK_MAX_AGE_DAYS = 90;
const MAX_AGE_SECONDS = CLAIM_LINK_MAX_AGE_DAYS * 24 * 60 * 60;

function key(): Buffer | null {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update("profile-claim-v1").digest();
}

function sign(payload: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function mintClaimToken(profileId: string, now: Date = new Date()): string | null {
  const secret = key();
  if (!secret || !UUID.test(profileId)) return null;
  const payload = `${profileId.toLowerCase()}:${Math.floor(now.getTime() / 1000)}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, secret)}`;
}

/** Die Profilkennung aus einem gültigen, nicht abgelaufenen Link, sonst `null`. */
export function readClaimToken(token: unknown, now: Date = new Date()): string | null {
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

  const [profileId, issued] = payload.split(":");
  const issuedAt = Number(issued);
  if (!profileId || !UUID.test(profileId) || !Number.isInteger(issuedAt)) return null;
  const age = Math.floor(now.getTime() / 1000) - issuedAt;
  if (age < 0 || age > MAX_AGE_SECONDS) return null;
  return profileId;
}

export const CLAIM_PATH = "/profil-uebernehmen";

export function claimPath(token: string): string {
  return `${CLAIM_PATH}?t=${encodeURIComponent(token)}`;
}
