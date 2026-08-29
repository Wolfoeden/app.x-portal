import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Der Bestätigungstoken für den Double-Opt-in.
 *
 * In der Datenbank liegt nur der SHA-256-Hex-Wert. Wer die Tabelle liest —
 * ein Betreiber in Studio, ein Backup, ein Leck — kann damit keine fremde
 * Anmeldung bestätigen. Der Token selbst existiert nur zwischen der Erzeugung
 * und der Bestätigungsmail.
 *
 * Kein HMAC, sondern ein reiner Hash: Der Token ist 256 Bit Zufall, gegen
 * Erraten hilft kein Schlüssel zusätzlich, und ein Schlüsselwechsel würde
 * jede offene Bestätigung entwerten.
 */

/** Lang genug, dass Raten aussichtslos ist, kurz genug für eine Zeile. */
const TOKEN_BYTES = 32;

/** Eine Bestätigung, die Wochen später kommt, belegt wenig. */
export const CONFIRMATION_TTL_HOURS = 72;

export function mintConfirmationToken(): { token: string; hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashConfirmationToken(token) };
}

export function hashConfirmationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Formatprüfung vor jedem Datenbankzugriff: ein Token ist base64url. */
export function isConfirmationTokenShape(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/u.test(value)
  );
}

export function confirmationExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + CONFIRMATION_TTL_HOURS * 3_600_000);
}

/** Vergleich in konstanter Zeit, auch wenn hier nur Hashes verglichen werden. */
export function confirmationHashMatches(
  expected: string,
  provided: string,
): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(provided, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function confirmationUrl(baseUrl: string, token: string): string {
  const url = new URL("/whitelist/confirm", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function confirmationMessage(input: {
  fullName: string;
  confirmUrl: string;
}): { subject: string; text: string } {
  return {
    subject: "Bitte bestätigen Sie Ihre XPORTAL-Anmeldung",
    text: [
      `Hallo ${input.fullName},`,
      "",
      "Sie haben sich für die XPORTAL-Whitelist eingetragen. Damit wir Ihnen",
      "schreiben dürfen, bestätigen Sie bitte einmal Ihre Adresse:",
      "",
      input.confirmUrl,
      "",
      `Der Link gilt ${CONFIRMATION_TTL_HOURS} Stunden. Wenn Sie sich nicht`,
      "eingetragen haben, ignorieren Sie diese Nachricht — ohne Bestätigung",
      "senden wir Ihnen nichts und löschen den Eintrag nach 30 Tagen.",
      "",
      "300 – Inhaber Roman Dering, Heilig-Kreuz-Straße 18, 87600 Kaufbeuren",
      "info@x-portal.eu · https://x-portal.eu/imprint",
    ].join("\n"),
  };
}
