import { describe, expect, it } from "vitest";

import {
  IMPRINT_EMAIL,
  PROVIDER_IMPRINT_LINES,
} from "@/lib/legal/policy";
import {
  buildLeadEmail,
  firmenname,
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

  /**
   * Die Importquelle fuehrt Doppelnennungen wie „Thryve (Thryve Consulting
   * GmbH)“. Daraus wurde eine Anrede, die den Firmennamen zweimal enthielt.
   */
  it("lässt den Klammerzusatz der Firma weg", () => {
    expect(salutation(null, "Thryve (Thryve Consulting GmbH)")).toBe(
      "Guten Tag Thryve Team,",
    );
    expect(salutation(null, "RED Global (RED Commerce GmbH)")).toBe(
      "Guten Tag RED Global Team,",
    );
  });

  it("entfernt die Rechtsform auch hinter einem Klammerzusatz", () => {
    expect(salutation(null, "Randstad Professional GmbH (vorm. GULP)")).toBe(
      "Guten Tag Randstad Professional Team,",
    );
  });

  it("gibt die Firma unverändert zurück, wenn nichts wegfällt", () => {
    expect(firmenname("VARIUS IT Informations-Technologien")).toBe(
      "VARIUS IT Informations-Technologien",
    );
  });

  it("fällt nie auf einen leeren Namen zurück", () => {
    expect(firmenname("(nur eine Klammer)")).toBe("(nur eine Klammer)");
    expect(firmenname("GmbH")).toBe("GmbH");
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

  /**
   * Die Kennzeichnung beginnt mit XPORTAL, führt aber weiterhin den
   * eingetragenen Namen: § 5 DDG verlangt ihn, und ein Fuß, der nur die
   * Marke nennt, erfüllt die Anbieterkennzeichnung nicht.
   */
  it("nennt die Anbieterkennzeichnung wörtlich", () => {
    for (const zeile of PROVIDER_IMPRINT_LINES) {
      expect(mail).toContain(zeile);
    }
  });

  it("nennt das Portal vor dem eingetragenen Namen", () => {
    expect(PROVIDER_IMPRINT_LINES[0].startsWith("XPORTAL")).toBe(true);
    expect(PROVIDER_IMPRINT_LINES[0]).toContain("Inhaber Roman Dering");
  });

  it("nennt die Impressumsadresse", () => {
    expect(mail).toContain(IMPRINT_EMAIL);
  });

  it("verlinkt das Impressum", () => {
    expect(mail).toContain("https://x-portal.eu/imprint");
  });

  it("nennt die Herkunft der Adresse konkret mit Quelle", () => {
    expect(mail).toContain(BASIS.sourceUrl);
    expect(mail).toContain("Ihre Kontaktdaten stammen aus");
  });

  /**
   * Zweck, Rechtsgrundlage, Speicherdauer und Betroffenenrechte stehen seit
   * September 2026 auf der Datenschutzseite und nicht mehr im Fuß. Der Test
   * prüft deshalb den Verweis, nicht den ausformulierten Text — und dass er
   * die vier Punkte benennt, damit der Link nicht ins Unbestimmte zeigt.
   */
  it("verweist für Zweck, Grundlage, Frist und Rechte auf die Datenschutzseite", () => {
    expect(mail).toContain(
      "Zweck, Rechtsgrundlage, Speicherdauer und Ihre Rechte auf Auskunft, Berichtigung, Löschung und Widerspruch: https://x-portal.eu/privacy",
    );
  });

  it("bietet den Abmeldeweg mit eigener Einleitung an", () => {
    expect(mail).toContain(
      "Wenn Sie keine weiteren E-Mails von uns erhalten möchten,",
    );
  });

  it("nennt ohne Abmeldelink die Antwortadresse als Abmeldeweg", () => {
    const ohneLink = buildLeadEmail({ ...BASIS, unsubscribeUrl: null });
    expect(ohneLink).toContain(
      `genügt eine formlose Antwort an ${BASIS.senderEmail}`,
    );
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
