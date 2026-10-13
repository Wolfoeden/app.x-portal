import { describe, expect, it } from "vitest";

import { buildLeadEmail } from "@/lib/leadgen/outreach-message";
import { SIGNATURE_LINES } from "@/lib/email/signature";

// Oktober 2026: Mails unterschreibt Roman Dering als Produktmanager.
describe("Grußformel", () => {
  it("nennt Name und Funktion", () => {
    expect(SIGNATURE_LINES).toEqual(["Viele Grüße", "Roman Dering", "Produktmanager · XPORTAL"]);
  });

  it("steht so unter der Lead-Mail, über dem Impressumsblock", () => {
    const body = buildLeadEmail({
      body: "Wir haben passende Freelancer.",
      recipientName: null,
      company: "Beispiel GmbH",
      senderEmail: "info@x-portal.eu",
      sourceUrl: null,
      unsubscribeUrl: "https://x-portal.eu/abmelden?t=x",
    });
    expect(body).toContain("Viele Grüße\nRoman Dering\nProduktmanager · XPORTAL\n");
    expect(body).not.toContain("Inhaber");
  });
});
