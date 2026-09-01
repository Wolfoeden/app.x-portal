import { describe, expect, it } from "vitest";

import { IMPRINT_EMAIL } from "@/lib/legal/policy";
import { teamInvitationMessage } from "@/lib/team/messages";

/**
 * Bisher bekam jemand Zugriff auf fremdes Guthaben, ohne davon zu erfahren.
 * Die Nachricht muss deshalb drei Dinge sagen: wer sie hinzugefügt hat, was
 * das für das Guthaben bedeutet, und wie sie widersprechen können.
 */
describe("Team-Einladung", () => {
  it("nennt die Person, die hinzugefügt hat", () => {
    const message = teamInvitationMessage({ ownerEmail: "chefin@example.com" });

    expect(message.text).toContain("chefin@example.com");
  });

  it("kommt ohne bekannte Adresse des Inhabers aus", () => {
    const message = teamInvitationMessage({ ownerEmail: null });

    expect(message.text).toContain("Inhaber eines XPORTAL-Plans");
    expect(message.text).not.toContain("null");
  });

  it("sagt, dass das Guthaben geteilt wird", () => {
    const message = teamInvitationMessage({ ownerEmail: null });

    expect(message.text).toContain("Guthaben");
    expect(message.text).toContain("abgezogen");
  });

  it("nennt einen Weg zu widersprechen", () => {
    const message = teamInvitationMessage({ ownerEmail: null });

    expect(message.text).toContain(IMPRINT_EMAIL);
  });

  /**
   * Hinzugefuegt werden koennen nur Adressen, die schon ein Konto haben — die
   * Route weist alles andere mit `not_registered` ab. Die Nachricht darf
   * deshalb keine Registrierung verlangen, sonst schickt sie jemanden auf
   * einen Weg, den er nicht gehen muss.
   */
  it("verlangt keine Registrierung und keine Bestätigung", () => {
    const message = teamInvitationMessage({ ownerEmail: null });

    expect(message.text).toContain("nichts bestätigen");
    expect(message.text).not.toMatch(/registrieren|Konto anlegen/u);
  });
});
