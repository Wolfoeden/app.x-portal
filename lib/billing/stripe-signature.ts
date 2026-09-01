import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Die Signatur eines Stripe-Webhooks pruefen.
 *
 * Von Hand und nicht ueber das `stripe`-Paket: gebraucht wird genau diese eine
 * Funktion, und das Verfahren ist vollstaendig dokumentiert. Ein Paket, das
 * die halbe API mitbringt, waere fuer eine HMAC-Pruefung ein grosser Zuwachs
 * an Angriffsflaeche und Wartung.
 *
 * Das ist die einzige Stelle, die diesen Endpunkt schuetzt. `assertSameOrigin`
 * greift hier nicht — Stripe ruft aus einem fremden Ursprung auf. Wer die
 * Signatur faelschen koennte, koennte sich ein Enterprise-Konto verschaffen.
 */

/** Wie alt ein Aufruf hoechstens sein darf. Stripe empfiehlt fuenf Minuten. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureResult =
  | { ok: true }
  | { ok: false; reason: "malformed" | "mismatch" | "too_old" | "not_configured" };

type ParsedHeader = { timestamp: number; signatures: string[] };

/**
 * Der Header sieht so aus: `t=1614556800,v1=abc…,v1=def…`.
 *
 * Mehrere `v1` kommen vor, wenn ein Endpunkt gerade zwei Secrets hat — beim
 * Rotieren. Es reicht, wenn eine davon passt.
 */
export function parseSignatureHeader(header: string | null): ParsedHeader | null {
  if (!header) return null;

  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t") {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed) && parsed > 0) timestamp = parsed;
    } else if (key === "v1" && /^[a-f0-9]{64}$/iu.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }

  return timestamp === null || signatures.length === 0
    ? null
    : { timestamp, signatures };
}

/**
 * Prueft die Signatur gegen den rohen Koerper.
 *
 * `rawBody` muss der unveraenderte Text sein. Wird er vorher durch
 * `JSON.parse` und zurueck geschickt, aendert sich die Reihenfolge oder das
 * Leerzeichen und die Signatur passt nicht mehr — der haeufigste Fehler an
 * dieser Stelle.
 */
export function verifyStripeSignature(input: {
  rawBody: string;
  header: string | null;
  secret: string | undefined;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): SignatureResult {
  const secret = input.secret?.trim();
  if (!secret) return { ok: false, reason: "not_configured" };

  const parsed = parseSignatureHeader(input.header);
  if (!parsed) return { ok: false, reason: "malformed" };

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  // Auch ein Aufruf aus der Zukunft ist verdaechtig: er waere entweder eine
  // verstellte Uhr oder ein Versuch, das Zeitfenster zu umgehen.
  if (Math.abs(now - parsed.timestamp) > tolerance) {
    return { ok: false, reason: "too_old" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${input.rawBody}`, "utf8")
    .digest();

  for (const candidate of parsed.signatures) {
    const received = Buffer.from(candidate, "hex");
    // Laengengleich ist durch die Hex-Pruefung im Parser sichergestellt;
    // timingSafeEqual wirft sonst, statt false zu liefern.
    if (received.length === expected.length && timingSafeEqual(received, expected)) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "mismatch" };
}
