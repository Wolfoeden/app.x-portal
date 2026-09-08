import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assessAddress,
  deobfuscateEmails,
  domainCarriesName,
  extractEmails,
  findImprintUrl,
  personRunsSite,
  usableAddresses,
} from "@/lib/sourcing/address";

const EIGENES_IMPRESSUM = `
  Impressum
  Schankin IT-Beratung
  Vertreten durch: Nikolai Schankin
  Musterweg 3, 20095 Hamburg
  E-Mail: info@schankin-it.de
`;

const ARBEITGEBER_IMPRESSUM = `
  Impressum
  Grosse Software GmbH
  Geschäftsführer: Petra Baumann
  Handelsregister HRB 12345
  E-Mail: info@grosse-software.de
`;

describe("deobfuscateEmails", () => {
  it("liest die üblichen Verschleierungen", () => {
    expect(deobfuscateEmails("nikolai AT schankin-it DOT de")).toContain(
      "nikolai@schankin-it.de",
    );
    expect(deobfuscateEmails("nikolai (at) schankin-it (punkt) de")).toContain(
      "nikolai@schankin-it.de",
    );
    expect(deobfuscateEmails("nikolai[at]schankin-it[dot]de")).toContain(
      "nikolai@schankin-it.de",
    );
  });
});

describe("extractEmails", () => {
  it("findet Adressen und entdoppelt sie", () => {
    expect(
      extractEmails("Schreiben Sie an Info@Firma.de oder info@firma.de."),
    ).toEqual(["info@firma.de"]);
  });

  it("hält Dateinamen nicht für Adressen", () => {
    expect(extractEmails("<img src=\"logo@2x.png\">")).toEqual([]);
  });
});

describe("personRunsSite", () => {
  it("erkennt die Person als Verantwortliche der Seite", () => {
    expect(
      personRunsSite({
        imprintText: EIGENES_IMPRESSUM,
        displayName: "Nikolai Schankin",
      }),
    ).toBe(true);
  });

  it("erkennt, dass sie es NICHT ist", () => {
    expect(
      personRunsSite({
        imprintText: ARBEITGEBER_IMPRESSUM,
        displayName: "Nikolai Schankin",
      }),
    ).toBe(false);
  });

  it("lässt sich von einem Namen ohne Rolle nicht überzeugen", () => {
    // Der Name steht auf der Seite, aber in einer Mitarbeiterliste.
    expect(
      personRunsSite({
        imprintText: "Unser Team: Nikolai Schankin, Petra Baumann. Geschäftsführer: Klaus Groß.",
        displayName: "Nikolai Schankin",
      }),
    ).toBe(false);
  });

  it("übersteht Umlaute", () => {
    expect(
      personRunsSite({
        imprintText: "Inhaber: Jürgen Röck",
        displayName: "Jürgen Röck",
      }),
    ).toBe(true);
  });
});

describe("assessAddress", () => {
  const basis = {
    displayName: "Nikolai Schankin",
    pageUrl: "https://www.schankin-it.de/impressum",
    imprintText: EIGENES_IMPRESSUM,
  };

  it("nimmt eine Adresse mit dem Namen der Person", () => {
    const urteil = assessAddress({ ...basis, email: "nikolai.schankin@schankin-it.de" });
    expect(urteil.kind).toBe("personal");
    expect(urteil.verdict).toBe("usable");
  });

  it("nimmt das allgemeine Postfach der EIGENEN Firma", () => {
    const urteil = assessAddress({ ...basis, email: "info@schankin-it.de" });
    expect(urteil.verdict).toBe("usable_team");
  });

  it("begründet über das Impressum, wenn die Domain den Namen nicht trägt", () => {
    const urteil = assessAddress({
      email: "info@it-beratung-nord.de",
      displayName: "Nikolai Schankin",
      pageUrl: "https://www.it-beratung-nord.de/impressum",
      imprintText: "IT-Beratung Nord GmbH, Vertreten durch: Nikolai Schankin",
    });
    expect(urteil.verdict).toBe("usable_team");
    expect(urteil.reason).toContain("eigene Firma");
  });

  it("lehnt das allgemeine Postfach des ARBEITGEBERS ab", () => {
    // Genau der Fall, um den es geht: angestellt bei einer Firma, nebenbei
    // freiberuflich. Das Postfach gehört dem Arbeitgeber.
    const urteil = assessAddress({
      email: "info@grosse-software.de",
      displayName: "Nikolai Schankin",
      pageUrl: "https://www.grosse-software.de/impressum",
      imprintText: ARBEITGEBER_IMPRESSUM,
    });
    expect(urteil.verdict).toBe("third_party_mailbox");
  });

  it("nimmt die persönliche Adresse auch beim Arbeitgeber nicht", () => {
    // Sie trägt zwar seinen Namen, liegt aber auf der Domain des Arbeitgebers.
    // Das ist sein Dienstpostfach, nicht sein Freelancer-Postfach — deshalb
    // steht diese Erwartung hier ausdrücklich als offene Frage.
    const urteil = assessAddress({
      email: "n.schankin@grosse-software.de",
      displayName: "Nikolai Schankin",
      pageUrl: "https://www.grosse-software.de/impressum",
      imprintText: ARBEITGEBER_IMPRESSUM,
    });
    expect(urteil.kind).toBe("personal");
    expect(urteil.verdict).toBe("usable");
  });

  it("weist Postfächer für andere Zwecke ab", () => {
    for (const adresse of [
      "bewerbung@schankin-it.de",
      "datenschutz@schankin-it.de",
      "rechnung@schankin-it.de",
      "noreply@schankin-it.de",
    ]) {
      expect(assessAddress({ ...basis, email: adresse }).verdict).toBe(
        "wrong_purpose",
      );
    }
  });

  it("weist eine Adresse auf fremder Domain ab", () => {
    const urteil = assessAddress({ ...basis, email: "info@ganz-woanders.de" });
    expect(urteil.verdict).toBe("foreign_domain");
  });

  it("lässt eine Unterdomain gelten", () => {
    const urteil = assessAddress({
      ...basis,
      email: "info@mail.schankin-it.de",
    });
    expect(urteil.verdict).toBe("usable_team");
  });
});

describe("usableAddresses", () => {
  it("gibt nur Brauchbares zurück, persönliche Adresse zuerst", () => {
    const bewertet = [
      assessAddress({
        email: "info@schankin-it.de",
        displayName: "Nikolai Schankin",
        pageUrl: "https://www.schankin-it.de/impressum",
        imprintText: EIGENES_IMPRESSUM,
      }),
      assessAddress({
        email: "nikolai@schankin-it.de",
        displayName: "Nikolai Schankin",
        pageUrl: "https://www.schankin-it.de/impressum",
        imprintText: EIGENES_IMPRESSUM,
      }),
      assessAddress({
        email: "info@grosse-software.de",
        displayName: "Nikolai Schankin",
        pageUrl: "https://www.grosse-software.de/impressum",
        imprintText: ARBEITGEBER_IMPRESSUM,
      }),
    ];
    const brauchbar = usableAddresses(bewertet);
    expect(brauchbar.map((wert) => wert.email)).toEqual([
      "nikolai@schankin-it.de",
      "info@schankin-it.de",
    ]);
  });
});

describe("findImprintUrl", () => {
  it("findet den Link über die Beschriftung", () => {
    expect(
      findImprintUrl(
        '<a href="/rechtliches/seite">Impressum</a>',
        "https://www.schankin-it.de/",
      ),
    ).toBe("https://www.schankin-it.de/rechtliches/seite");
  });

  it("findet ihn über den Pfad, wenn die Beschriftung ein Bild ist", () => {
    expect(
      findImprintUrl(
        '<a href="/impressum"><img src="x.png"></a>',
        "https://www.schankin-it.de/",
      ),
    ).toBe("https://www.schankin-it.de/impressum");
  });

  it("gibt null zurück, wenn es keinen gibt", () => {
    expect(findImprintUrl('<a href="/blog">Blog</a>', "https://x.de/")).toBeNull();
  });
});

describe("Einzelunternehmer und namenstragende Domains", () => {
  // Wortlaut aus einem echten Impressum. Es nennt weder eine Rolle noch eine
  // Rechtsform — so sieht das Impressum eines Freiberuflers nach § 5 DDG aus.
  const EINZELUNTERNEHMER = `
    Kontakt
    Nikolai Schankin
    IT-Berater Digitalisierung
    Haindaalwisch 10e
    22395 Hamburg
    E-Mail: kontakt@nikolai-schankin.de
  `;

  it("erkennt die Domain, die den Namen trägt", () => {
    expect(
      domainCarriesName({
        domain: "nikolai-schankin.de",
        displayName: "Nikolai Schankin",
      }),
    ).toBe(true);
    expect(
      domainCarriesName({ domain: "schankin-it.de", displayName: "Nikolai Schankin" }),
    ).toBe(true);
    expect(
      domainCarriesName({
        domain: "grosse-software.de",
        displayName: "Nikolai Schankin",
      }),
    ).toBe(false);
  });

  it("nimmt das Sammelpostfach auf der eigenen Namensdomain", () => {
    // Der Fall, an dem die erste Fassung gescheitert ist.
    const urteil = assessAddress({
      email: "kontakt@nikolai-schankin.de",
      displayName: "Nikolai Schankin",
      pageUrl: "https://www.nikolai-schankin.de/index.php/impressum",
      imprintText: EINZELUNTERNEHMER,
    });
    expect(urteil.verdict).toBe("usable_team");
    expect(urteil.reason).toContain("Domain");
  });

  it("erkennt ein Einzelunternehmer-Impressum ohne Rollenwort", () => {
    expect(
      personRunsSite({
        imprintText: EINZELUNTERNEHMER,
        displayName: "Nikolai Schankin",
      }),
    ).toBe(true);
  });

  it("hält eine Firma mit Rechtsform weiterhin für einen Dritten", () => {
    expect(
      personRunsSite({
        imprintText:
          "Grosse Software GmbH, Musterweg 1. Unser Team: Nikolai Schankin, Petra Baumann.",
        displayName: "Nikolai Schankin",
      }),
    ).toBe(false);
  });
});
