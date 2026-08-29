import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CONFIRMATION_TTL_HOURS,
  confirmationExpiresAt,
  confirmationHashMatches,
  confirmationMessage,
  confirmationUrl,
  hashConfirmationToken,
  isConfirmationTokenShape,
  mintConfirmationToken,
} from "@/lib/whitelist/confirmation";

describe("whitelist confirmation token", () => {
  it("never repeats a token", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => mintConfirmationToken().token),
    );

    expect(tokens.size).toBe(50);
  });

  it("stores only the hash, never the token itself", () => {
    const { token, hash } = mintConfirmationToken();

    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash).not.toContain(token);
    expect(hashConfirmationToken(token)).toBe(hash);
  });

  it("accepts the shape it mints and refuses everything else", () => {
    expect(isConfirmationTokenShape(mintConfirmationToken().token)).toBe(true);
    expect(isConfirmationTokenShape("kurz")).toBe(false);
    expect(isConfirmationTokenShape("a".repeat(200))).toBe(false);
    expect(isConfirmationTokenShape("hat leerzeichen und =")).toBe(false);
    expect(isConfirmationTokenShape(null)).toBe(false);
    expect(isConfirmationTokenShape(42)).toBe(false);
  });

  it("compares hashes without leaking length differences as a mismatch bug", () => {
    const { token, hash } = mintConfirmationToken();

    expect(confirmationHashMatches(hash, hashConfirmationToken(token))).toBe(true);
    expect(confirmationHashMatches(hash, "abc")).toBe(false);
    expect(
      confirmationHashMatches(hash, hashConfirmationToken("anderer-token")),
    ).toBe(false);
  });

  it("expires the link after the documented window", () => {
    const from = new Date("2026-08-28T10:00:00.000Z");

    expect(confirmationExpiresAt(from).toISOString()).toBe(
      new Date(
        from.getTime() + CONFIRMATION_TTL_HOURS * 3_600_000,
      ).toISOString(),
    );
  });

  it("builds a confirmation link on the application's own origin", () => {
    const url = confirmationUrl("https://x-portal.eu", "abc-token");

    expect(url).toBe("https://x-portal.eu/whitelist/confirm?token=abc-token");
  });

  it("writes a mail that names the sender and the way out", () => {
    const message = confirmationMessage({
      fullName: "Erika Mustermann",
      confirmUrl: "https://x-portal.eu/whitelist/confirm?token=x",
    });

    expect(message.subject).toContain("bestätigen");
    expect(message.text).toContain("Erika Mustermann");
    expect(message.text).toContain(
      "https://x-portal.eu/whitelist/confirm?token=x",
    );
    // Ohne Anbieterangabe wäre die Bestätigungsmail selbst angreifbar.
    expect(message.text).toContain("Kaufbeuren");
    expect(message.text).toContain("imprint");
    // Wer sich nicht eingetragen hat, muss nichts tun — und das muss dastehen.
    expect(message.text).toContain("ignorieren");
  });
});
