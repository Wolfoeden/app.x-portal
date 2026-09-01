import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  parseSignatureHeader,
  SIGNATURE_TOLERANCE_SECONDS,
  verifyStripeSignature,
} from "@/lib/billing/stripe-signature";

const SECRET = "whsec_test_secret";
const BODY = '{"id":"evt_1","type":"checkout.session.completed"}';
const NOW = 1_764_000_000;

function sign(body: string, secret: string, timestamp: number): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function verify(overrides: Partial<Parameters<typeof verifyStripeSignature>[0]> = {}) {
  return verifyStripeSignature({
    rawBody: BODY,
    header: sign(BODY, SECRET, NOW),
    secret: SECRET,
    nowSeconds: NOW,
    ...overrides,
  });
}

describe("Stripe-Signatur", () => {
  it("nimmt eine gültige Signatur an", () => {
    expect(verify()).toEqual({ ok: true });
  });

  /**
   * Dies ist die einzige Stelle, die den Endpunkt schützt — `assertSameOrigin`
   * greift nicht, weil Stripe aus einem fremden Ursprung aufruft. Wer die
   * Signatur fälschen könnte, könnte sich ein Enterprise-Konto verschaffen.
   */
  it("weist eine falsche Signatur zurück", () => {
    expect(verify({ header: sign(BODY, "whsec_falsch", NOW) })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  // Der häufigste Fehler an dieser Stelle: der Körper wird vor der Prüfung
  // durch JSON.parse und zurück geschickt.
  it("weist einen veränderten Körper zurück", () => {
    expect(verify({ rawBody: `${BODY} ` })).toEqual({ ok: false, reason: "mismatch" });
    expect(verify({ rawBody: '{"id":"evt_2"}' })).toEqual({ ok: false, reason: "mismatch" });
  });

  it("weist einen alten Aufruf zurück, damit er sich nicht wiederholen lässt", () => {
    const old = NOW - SIGNATURE_TOLERANCE_SECONDS - 1;
    expect(verify({ header: sign(BODY, SECRET, old) })).toEqual({
      ok: false,
      reason: "too_old",
    });
  });

  // Eine verstellte Uhr oder ein Versuch, das Zeitfenster zu umgehen.
  it("weist einen Aufruf aus der Zukunft zurück", () => {
    const future = NOW + SIGNATURE_TOLERANCE_SECONDS + 1;
    expect(verify({ header: sign(BODY, SECRET, future) })).toEqual({
      ok: false,
      reason: "too_old",
    });
  });

  it("nimmt eine gültige Signatur innerhalb des Zeitfensters an", () => {
    const edge = NOW - SIGNATURE_TOLERANCE_SECONDS;
    expect(verify({ header: sign(BODY, SECRET, edge) })).toEqual({ ok: true });
  });

  // Beim Rotieren hat ein Endpunkt kurzzeitig zwei Secrets.
  it("nimmt an, wenn eine von mehreren Signaturen passt", () => {
    const good = sign(BODY, SECRET, NOW).split("v1=")[1];
    const header = `t=${NOW},v1=${"0".repeat(64)},v1=${good}`;
    expect(verify({ header })).toEqual({ ok: true });
  });

  it("weist einen fehlenden oder unbrauchbaren Header zurück", () => {
    for (const header of [null, "", "unsinn", `t=${NOW}`, "v1=abc", `t=abc,v1=${"a".repeat(64)}`]) {
      expect(verify({ header })).toEqual({ ok: false, reason: "malformed" });
    }
  });

  // Eine zu kurze Signatur brächte timingSafeEqual zum Werfen, statt false
  // zu liefern — der Parser laesst sie deshalb gar nicht erst durch.
  it("weist eine Signatur mit falscher Länge zurück, ohne zu werfen", () => {
    expect(() => verify({ header: `t=${NOW},v1=abcd` })).not.toThrow();
    expect(verify({ header: `t=${NOW},v1=abcd` })).toEqual({ ok: false, reason: "malformed" });
  });

  // Ohne Secret darf nichts durchgehen: sonst waere ein vergessener
  // Schluessel ein offener Endpunkt.
  it("lässt ohne Secret nichts durch", () => {
    for (const secret of [undefined, "", "   "]) {
      expect(verify({ secret })).toEqual({ ok: false, reason: "not_configured" });
    }
  });

  it("liest Zeitstempel und Signaturen aus dem Header", () => {
    const parsed = parseSignatureHeader(`t=${NOW},v1=${"a".repeat(64)},v0=egal`);
    expect(parsed?.timestamp).toBe(NOW);
    expect(parsed?.signatures).toEqual(["a".repeat(64)]);
  });
});
