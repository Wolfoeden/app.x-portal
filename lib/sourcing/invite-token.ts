import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Das Kennzeichen am Einladungslink.
 *
 * Ohne es endet jede Einladung im Nichts: Wer sich einträgt, erzeugt eine neue
 * Bewerbung, der recherchierte Datensatz bleibt liegen und verfällt — und
 * niemand kann sagen, ob die Ansprache gewirkt hat. Fünf Cent je Adresse sind
 * billig, wenn jede zwanzigste Einladung ein Profil bringt, und Verschwendung,
 * wenn keine. Diese Zahl entsteht hier.
 *
 * Wie beim Abmeldelink ein HMAC statt eines gespeicherten Tokens, aus
 * denselben Gründen: Er läuft nicht ab, und eine Mail wird auch nach Monaten
 * noch aufgemacht.
 *
 * **Eigenes Geheimnis braucht es nicht, wohl aber eine eigene Bedeutung.** Der
 * Schlüssel ist derselbe wie beim Abmeldelink, die Nachricht trägt aber ein
 * festes Präfix. Ohne diese Trennung wäre ein gültiger Abmeldetoken zugleich
 * ein gültiges Einladungskennzeichen — dieselbe Zeichenkette, zwei Wirkungen.
 * Eine neue Umgebungsvariable hätte dasselbe geleistet und die Einführung an
 * eine Konfigurationsänderung gebunden; das ist der Preis, den der Weg hier
 * spart.
 */

const ZWECK = "sourcing-invite:v1:";
const TOKEN_MAX_LENGTH = 200;

/** Genau das Format, das die Datenbank für ihre Kennungen benutzt. */
const UUID_MUSTER =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function secret(): string | null {
  const value = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  // Ein kurzes Geheimnis ist schlechter als ein fehlendes: Es sähe
  // eingerichtet aus und wäre zu erraten.
  return value && value.length >= 32 ? value : null;
}

export function inviteTrackingConfigured(): boolean {
  return secret() !== null;
}

function sign(applicationId: string, key: string): string {
  return createHmac("sha256", key)
    .update(`${ZWECK}${applicationId}`)
    .digest("base64url");
}

/**
 * Erzeugt das Kennzeichen zu einem Kandidaten.
 *
 * Null, wenn das Geheimnis fehlt. Der Aufrufer verschickt dann **trotzdem** —
 * anders als beim Abmeldelink, der eine Zusage einlöst. Hier geht es um
 * Messbarkeit, und eine Einladung ohne Zähler ist besser als keine Einladung.
 */
export function mintInviteToken(applicationId: string): string | null {
  const key = secret();
  if (!key || !UUID_MUSTER.test(applicationId)) return null;
  return `${applicationId}.${sign(applicationId, key)}`;
}

/**
 * Liest die Kandidatenkennung aus einem Kennzeichen zurück — oder null.
 *
 * Der Vergleich läuft in konstanter Zeit. Ohne ihn ließe sich die Signatur
 * zeichenweise erraten, und wer sie erraten hat, könnte fremde Kandidaten als
 * angemeldet ausgeben.
 */
export function readInviteToken(token: unknown): string | null {
  const key = secret();
  if (!key || typeof token !== "string") return null;

  const value = token.trim();
  if (!value || value.length > TOKEN_MAX_LENGTH) return null;

  const trenner = value.indexOf(".");
  if (trenner <= 0 || trenner === value.length - 1) return null;

  const id = value.slice(0, trenner);
  const signatur = value.slice(trenner + 1);
  if (!UUID_MUSTER.test(id)) return null;

  const erwartet = Buffer.from(sign(id, key), "utf8");
  const gegeben = Buffer.from(signatur, "utf8");
  if (erwartet.length !== gegeben.length) return null;
  return timingSafeEqual(erwartet, gegeben) ? id.toLowerCase() : null;
}

/** Der Name des Feldes im Link. Kurz, damit die Adresse lesbar bleibt. */
export const INVITE_TOKEN_PARAM = "e";
