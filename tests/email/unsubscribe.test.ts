import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { maskEmail, normalizeEmail } from "@/lib/email/address";
import {
  mintUnsubscribeToken,
  readUnsubscribeToken,
  unsubscribeConfigured,
  unsubscribeHeaders,
  unsubscribeUrl,
} from "@/lib/email/unsubscribe";

const SECRET = "s".repeat(48);
const OTHER_SECRET = "t".repeat(48);

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", SECRET);
});

describe("die Vergleichsform einer Adresse", () => {
  it("führt Schreibweisen derselben Adresse zusammen", () => {
    // Ohne diesen Schritt wäre die Sperrliste löchrig: Wer als
    // "Dominik@Firma.de" abbestellt, bekäme unter "dominik@firma.de" weiter
    // Post, und niemand würde es merken — die Mail geht ja raus.
    expect(normalizeEmail("  Dominik@Firma.DE ")).toBe("dominik@firma.de");
  });

  it("wirft Plus-Zusätze nicht weg", () => {
    // Bei einer Firmenadresse sind das zwei verschiedene Postfächer. Sie
    // zusammenzuwerfen hieße, beim Widerspruch des einen das andere
    // stillschweigend mitzusperren.
    expect(normalizeEmail("info+xportal@firma.de")).toBe(
      "info+xportal@firma.de",
    );
  });

  it("weist zurück, was keine Adresse ist", () => {
    for (const wert of ["", "kein-postfach", "a@b", "zwei@@at.de", null, 7]) {
      expect(normalizeEmail(wert)).toBeNull();
    }
  });

  it("maskiert für die Ansicht, ohne die Adresse preiszugeben", () => {
    expect(maskEmail("dominik@firma.de")).toBe("d***k@firma.de");
    expect(maskEmail("ab@firma.de")).toBe("**@firma.de");
  });
});

describe("der Abmeldelink", () => {
  it("liest die Adresse zurück, die signiert wurde", () => {
    const token = mintUnsubscribeToken("Dominik@Firma.de");
    expect(token).not.toBeNull();
    expect(readUnsubscribeToken(token)).toBe("dominik@firma.de");
  });

  it("läuft nicht ab", () => {
    // Kein Ablaufdatum im Token, also auch keins, das prüfbar wäre. Der Test
    // hält die Entscheidung fest: eine archivierte Mail, Monate später
    // geöffnet, muss noch einen einlösbaren Widerspruch enthalten.
    const token = mintUnsubscribeToken("dominik@firma.de");
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    expect(readUnsubscribeToken(token)).toBe("dominik@firma.de");
    vi.useRealTimers();
  });

  it("weist einen Token mit ausgetauschter Adresse ab", () => {
    // Der eigentliche Angriff: wer einen gültigen Link hat, soll damit nicht
    // fremde Adressen austragen können.
    const token = mintUnsubscribeToken("dominik@firma.de") ?? "";
    const signatur = token.slice(token.indexOf(".") + 1);
    const fremd = Buffer.from("chef@firma.de", "utf8").toString("base64url");

    expect(readUnsubscribeToken(`${fremd}.${signatur}`)).toBeNull();
  });

  it("weist eine veränderte Signatur ab", () => {
    const token = mintUnsubscribeToken("dominik@firma.de") ?? "";
    expect(readUnsubscribeToken(`${token}x`)).toBeNull();
    expect(readUnsubscribeToken(token.replace(/.$/u, "A"))).toBeNull();
  });

  it("weist einen Token aus einem anderen Geheimnis ab", () => {
    const token = mintUnsubscribeToken("dominik@firma.de");
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", OTHER_SECRET);
    expect(readUnsubscribeToken(token)).toBeNull();
  });

  it("weist Unsinn ab, statt zu raten", () => {
    for (const wert of ["", ".", "abc", "abc.", ".abc", "a".repeat(600), null]) {
      expect(readUnsubscribeToken(wert)).toBeNull();
    }
  });

  it("gilt ohne Geheimnis als nicht eingerichtet", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");
    expect(unsubscribeConfigured()).toBe(false);
    expect(mintUnsubscribeToken("dominik@firma.de")).toBeNull();
    expect(unsubscribeUrl("https://x-portal.eu", "dominik@firma.de")).toBeNull();
  });

  it("lässt ein zu kurzes Geheimnis nicht als eingerichtet durchgehen", () => {
    // Es sähe eingerichtet aus und wäre zu erraten — schlechter als gar keins,
    // weil dann werbliche Post mit einem wertlosen Link rausginge.
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "kurz");
    expect(unsubscribeConfigured()).toBe(false);
  });

  it("baut eine Adresse auf der eigenen Domain", () => {
    const url = unsubscribeUrl("https://x-portal.eu", "dominik@firma.de") ?? "";
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://x-portal.eu");
    expect(parsed.pathname).toBe("/unsubscribe");
    expect(readUnsubscribeToken(parsed.searchParams.get("t"))).toBe(
      "dominik@firma.de",
    );
  });

  it("nennt in den Kopfzeilen beide Wege", () => {
    const headers = unsubscribeHeaders({
      url: "https://x-portal.eu/unsubscribe?t=abc.def",
      mailto: "info@x-portal.eu",
    });

    expect(headers["List-Unsubscribe"]).toBe(
      "<https://x-portal.eu/unsubscribe?t=abc.def>, <mailto:info@x-portal.eu?subject=unsubscribe>",
    );
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
