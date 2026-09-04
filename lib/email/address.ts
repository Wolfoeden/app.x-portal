/**
 * Die eine Schreibweise einer Adresse.
 *
 * Ohne eine gemeinsame Normalform wäre die Sperrliste löchrig: wer als
 * `Dominik.Schwarz@Firma.de` abbestellt, bekäme unter `dominik.schwarz@firma.de`
 * weiter Post, und niemand würde den Fehler bemerken — die Mail geht ja raus.
 * Deshalb entsteht der Vergleichswert genau hier und nirgends sonst.
 *
 * Bewusst zurückhaltend: kleinschreiben und trimmen, mehr nicht. Punkte und
 * Plus-Zusätze zu entfernen ist eine Gmail-Eigenheit; bei einer Firmenadresse
 * sind `info@firma.de` und `info+xportal@firma.de` zwei verschiedene
 * Postfächer, und wer sie zusammenwirft, sperrt beim Widerspruch des einen
 * stillschweigend auch das andere.
 *
 * Kein `server-only`: die Normalform wird auch beim Bauen eines Links
 * gebraucht, und sie enthält keine Geheimnisse.
 */

/** Grob nach RFC 5321: ein @, kein Leerraum, eine Domain mit Punkt. */
const SHAPE = /^[^\s@]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/u;

/** Die Obergrenze aus RFC 5321. */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Gibt die Vergleichsform zurück — oder null, wenn das keine Adresse ist.
 *
 * Null ist ein Ergebnis, kein Fehler: der Aufrufer soll entscheiden, ob eine
 * unbrauchbare Adresse den Versand abbricht oder nur diese eine Zeile.
 */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > EMAIL_MAX_LENGTH) return null;
  return SHAPE.test(trimmed) ? trimmed : null;
}

/** Die Domain einer bereits normalisierten Adresse. */
export function emailDomain(normalized: string): string | null {
  const at = normalized.lastIndexOf("@");
  return at > 0 ? normalized.slice(at + 1) : null;
}

/**
 * Die Form, die der Betreiber in der Sperrliste sieht: `d***k@firma.de`.
 *
 * Genug, um einen Eintrag wiederzuerkennen, wenn jemand nachfragt, warum er
 * keine Post bekommt — und zu wenig, um damit jemanden anzuschreiben. Die
 * Domain bleibt lesbar, weil sonst auch eine Firmensperre nicht mehr
 * nachvollziehbar wäre.
 */
export function maskEmail(normalized: string): string {
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (local.length <= 2) return `${"*".repeat(local.length)}@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
