import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeEmail } from "./address";

/**
 * Der Abmeldelink.
 *
 * Kein Datenbankeintrag je verschickter Nachricht, sondern ein HMAC über die
 * Adresse selbst. Drei Gründe, und alle drei sind hier wichtiger als die
 * Widerrufbarkeit, die ein gespeicherter Token böte:
 *
 *   1. Er läuft nie ab. Ein Abmeldelink, der nach 72 Stunden ins Leere führt,
 *      ist schlimmer als keiner — die Zusage im Fuß der Nachricht steht dann
 *      noch da, eingelöst wird sie nicht mehr. Mails werden archiviert und
 *      Monate später wieder aufgemacht.
 *   2. Jeder Absender kann ihn ausrechnen. Das Akquise-Werkzeug außerhalb
 *      dieser Anwendung schreibt nichts in `leadgen_outreach`; ohne einen
 *      ableitbaren Token könnte es überhaupt keinen gültigen Link setzen, und
 *      dann liefe die Sperrliste an genau dem Kanal vorbei, für den sie
 *      gebaut wurde.
 *   3. Er verrät nichts. Im Token steckt die Adresse des Empfängers — also
 *      genau das, was ohnehin in der Kopfzeile derselben Nachricht steht.
 *
 * Ohne `EMAIL_UNSUBSCRIBE_SECRET` gibt es keinen Link. Der Versandweg macht
 * daraus die harte Folge: dann geht keine werbliche Nachricht raus. Lieber
 * gar nicht schreiben als ohne funktionierenden Widerspruch schreiben.
 */

/** Der Pfad, auf dem der Link landet. */
export const UNSUBSCRIBE_PATH = "/unsubscribe";

/** Genug für die längste zulässige Adresse plus Signatur, mit Reserve. */
const TOKEN_MAX_LENGTH = 512;

function secret(): string | null {
  const value = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  // Ein kurzes Geheimnis ist schlechter als ein fehlendes: es sähe
  // eingerichtet aus und wäre zu erraten.
  return value && value.length >= 32 ? value : null;
}

export function unsubscribeConfigured(): boolean {
  return secret() !== null;
}

function sign(normalizedEmail: string, key: string): string {
  return createHmac("sha256", key).update(normalizedEmail).digest("base64url");
}

/**
 * Erzeugt den Token zu einer Adresse. Null, wenn die Adresse unbrauchbar ist
 * oder das Geheimnis fehlt — der Aufrufer darf dann nicht werblich versenden.
 */
export function mintUnsubscribeToken(email: string): string | null {
  const key = secret();
  const normalized = normalizeEmail(email);
  if (!key || !normalized) return null;
  return `${Buffer.from(normalized, "utf8").toString("base64url")}.${sign(normalized, key)}`;
}

/**
 * Liest die Adresse aus einem Token zurück — oder null.
 *
 * Der Vergleich läuft in konstanter Zeit. Das ist hier weniger dramatisch als
 * bei einem Anmeldetoken, kostet aber nichts, und ohne ihn ließe sich die
 * Signatur zeichenweise erraten.
 */
export function readUnsubscribeToken(token: unknown): string | null {
  const key = secret();
  if (!key || typeof token !== "string") return null;

  const value = token.trim();
  if (!value || value.length > TOKEN_MAX_LENGTH) return null;

  const separator = value.indexOf(".");
  if (separator <= 0 || separator === value.length - 1) return null;

  const encoded = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded) || !/^[A-Za-z0-9_-]+$/u.test(signature)) {
    return null;
  }

  let candidate: string;
  try {
    candidate = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  // Erst normalisieren, dann prüfen: signiert wurde die Normalform, und ein
  // Token, der eine andere Schreibweise transportiert, ist keiner.
  const normalized = normalizeEmail(candidate);
  if (!normalized || normalized !== candidate) return null;

  const expected = Buffer.from(sign(normalized, key), "utf8");
  const provided = Buffer.from(signature, "utf8");
  if (expected.length !== provided.length) return null;
  return timingSafeEqual(expected, provided) ? normalized : null;
}

/** Die vollständige Adresse des Links, wie sie in der Nachricht steht. */
export function unsubscribeUrl(baseUrl: string, email: string): string | null {
  const token = mintUnsubscribeToken(email);
  if (!token) return null;
  const url = new URL(UNSUBSCRIBE_PATH, baseUrl);
  url.searchParams.set("t", token);
  return url.toString();
}

/**
 * Die Kopfzeilen nach RFC 8058.
 *
 * Gmail und Yahoo blenden daraufhin einen eigenen „Abbestellen"-Knopf neben
 * dem Absender ein — den drücken Leute, die sonst auf „Spam" drücken würden,
 * und eine Spam-Meldung kostet die Zustellbarkeit aller folgenden Nachrichten.
 * Der `mailto:`-Eintrag steht daneben, weil ein Mailprogramm ohne
 * HTTP-Unterstützung sonst gar keinen Weg anbietet.
 */
export function unsubscribeHeaders(input: {
  url: string;
  mailto: string;
}): Record<string, string> {
  return {
    "List-Unsubscribe": `<${input.url}>, <mailto:${input.mailto}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
