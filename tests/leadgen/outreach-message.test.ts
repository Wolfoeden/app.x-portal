import { describe, expect, it } from "vitest";

import { IMPRINT_EMAIL } from "@/lib/legal/policy";
import {
  LEAD_RETENTION_DAYS,
  SENDER_IMPRINT_LINE,
  buildLeadEmail,
  salutation,
  stripSalutationAndSignoff,
  unattendedBodyIssue,
} from "@/lib/leadgen/outreach-message";

/**
 * Je Pflichtangabe ein eigener Test: fällt einer durch, steht im Namen, welche
 * Angabe fehlt. Eine einzelne Sammelprüfung würde nur sagen, dass irgendetwas
 * am Fuß nicht stimmt.
 */

const BASIS = {
  body: "Sie haben eine Rolle ausgeschrieben. Darf ich Ihnen ein Profil schicken?",
  recipientName: "Michel Corda",
  company: "Krongaard GmbH",
  senderEmail: "roman@dering.info",
  sourceUrl: "https://www.example.invalid/projekt/123",
};

describe("Anrede", () => {
  it("spricht einen vollständigen Namen persönlich an", () => {
    expect(salutation("Michel Corda", "Krongaard GmbH")).toBe(
      "Guten Tag Michel Corda,",
    );
  });

  it("fällt ohne Namen auf das Firmenteam zurück und lässt die Rechtsform weg", () => {
    expect(salutation(null, "Krongaard GmbH")).toBe("Guten Tag Krongaard Team,");
  });

  it("rät bei einem Kürzel keinen Namen", () => {
    expect(salutation("M.", "WestCo GmbH")).toBe("Guten Tag WestCo Team,");
  });

  it("bleibt förmlich, wenn weder Name noch Firma bekannt sind", () => {
    expect(salutation(null, null)).toBe("Sehr geehrte Damen und Herren,");
  });
});

describe("Modelltext entschärfen", () => {
  it("entfernt eine mitgelieferte Anrede", () => {
    expect(
      stripSalutationAndSignoff("Sehr geehrte Damen und Herren,\n\nText hier."),
    ).toBe("Text hier.");
  });

  it("entfernt eine mitgelieferte Grußformel samt Signatur", () => {
    expect(
      stripSalutationAndSignoff("Text hier.\n\nViele Grüße\nJemand Anderes"),
    ).toBe("Text hier.");
  });
});

describe("Pflichtangaben der Akquise-Mail", () => {
  const mail = buildLeadEmail(BASIS);

  it("nennt die Anschrift des Anbieters wörtlich", () => {
    expect(mail).toContain(SENDER_IMPRINT_LINE);
  });

  it("nennt die Impressumsadresse", () => {
    expect(mail).toContain(IMPRINT_EMAIL);
  });

  it("verlinkt das Impressum", () => {
    expect(mail).toContain("https://x-portal.eu/imprint");
  });

  it("nennt die Herkunft der Adresse konkret mit Quelle", () => {
    expect(mail).toContain(BASIS.sourceUrl);
    expect(mail).toContain("Woher ich Ihre Daten habe");
  });

  it("nennt die gespeicherten Datenkategorien", () => {
    expect(mail).toContain("Firmenname, Ansprechpartner und Kontaktadresse");
  });

  it("nennt die Rechtsgrundlage", () => {
    expect(mail).toContain("Art. 6 Abs. 1 lit. f DSGVO");
  });

  it("nennt die Speicherdauer in Tagen", () => {
    expect(mail).toContain(`nach ${LEAD_RETENTION_DAYS} Tagen`);
  });

  it("nennt Widerspruch, Auskunft, Berichtigung und Löschung", () => {
    expect(mail).toContain("widersprechen");
    expect(mail).toContain("Auskunft, Berichtigung oder Löschung");
  });

  it("sagt, an welche Adresse der Widerspruch geht", () => {
    expect(mail).toContain(BASIS.senderEmail);
  });

  it("verlinkt die Datenschutzerklärung", () => {
    expect(mail).toContain("https://x-portal.eu/privacy");
  });

  it("hängt Anrede und Grußformel genau einmal an", () => {
    expect(mail.startsWith("Guten Tag Michel Corda,")).toBe(true);
    expect(mail.split("Viele Grüße").length - 1).toBe(1);
  });

  it("kommt auch ohne bekannte Quelle mit einer Herkunftsangabe aus", () => {
    const ohneQuelle = buildLeadEmail({ ...BASIS, sourceUrl: null });
    expect(ohneQuelle).toContain("veröffentlichten Projektausschreibung");
  });
});

describe("Sperre für den unbeaufsichtigten Stapelversand", () => {
  const ABSENDER = "roman@dering.info";

  it("lässt einen Text ohne Adressen und Links durch", () => {
    expect(
      unattendedBodyIssue(
        "Sie haben eine Rolle ausgeschrieben. Darf ich Ihnen ein Profil schicken?",
        ABSENDER,
      ),
    ).toBeNull();
  });

  it("lässt einen Link auf die eigene Domain durch", () => {
    expect(
      unattendedBodyIssue("Mehr dazu unter https://x-portal.eu/chat", ABSENDER),
    ).toBeNull();
  });

  it("hält einen untergeschobenen fremden Link auf", () => {
    const issue = unattendedBodyIssue(
      "Bitte bestätigen Sie hier: https://boese.example/login",
      ABSENDER,
    );
    expect(issue).toContain("boese.example");
  });

  it("hält eine untergeschobene fremde Adresse auf", () => {
    const issue = unattendedBodyIssue(
      "Antworten Sie bitte an abrechnung@boese.example.",
      ABSENDER,
    );
    expect(issue).toContain("abrechnung@boese.example");
  });

  it("lässt die eigene Absenderadresse stehen", () => {
    expect(
      unattendedBodyIssue(`Schreiben Sie mir an ${ABSENDER}.`, ABSENDER),
    ).toBeNull();
  });
});
