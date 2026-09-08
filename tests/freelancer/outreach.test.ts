import { describe, expect, it } from "vitest";

import {
  buildOutreachDraft,
  DEFAULT_RETENTION_DAYS,
  LINKEDIN_CHARACTER_LIMIT,
  type OutreachCandidate,
} from "@/lib/freelancer/outreach";

const candidate: OutreachCandidate = {
  fullName: "Jörg Müller",
  roleTitle: "Senior TypeScript Engineer",
  sourceUrls: [
    "https://www.linkedin.com/in/joerg-mueller",
    "https://joerg-mueller.dev/projekte",
    "https://www.linkedin.com/in/joerg-mueller#skills",
  ],
};

function draft(overrides: Partial<Parameters<typeof buildOutreachDraft>[0]> = {}) {
  return buildOutreachDraft({
    channel: "email",
    candidate,
    inviteUrl: "https://x-portal.eu/freelancer/apply?einladung=abc123",
    senderName: "Roman Dering",
    senderEmail: "info@x-portal.eu",
    contactEmail: "joerg@example.com",
    projectHint: "React und PostgreSQL, remote, ab Oktober",
    ...overrides,
  });
}

describe("Art.-14-Pflichtangaben", () => {
  it("nennt Herkunft, Zweck, Speicherdauer und Widerspruchsrecht", () => {
    const body = draft().body;
    expect(body).toContain("öffentlich zugängliche Quellen");
    expect(body).toContain("Zweck");
    expect(body).toContain(`${DEFAULT_RETENTION_DAYS} Tage`);
    expect(body).toContain("Widerspruch");
    expect(body).toContain("ich lösche den Eintrag sofort");
  });

  it("bittet um den Lebenslauf und verlangt ausdrückliche Zustimmung", () => {
    const body = draft().body;
    expect(body).toContain("Lebenslauf");
    expect(body).toMatch(/ohne Ihre ausdrückliche Zustimmung/iu);
  });

  it("beschreibt XPORTAL als Portal, nicht als vermittelnde Person", () => {
    // Auf der Auftraggeberseite hat dieser Satz gefehlt, und ein Empfänger
    // hielt daraufhin den Suchassistenten für den Betreiber persönlich.
    const body = draft().body;
    expect(body).toContain("Suchportal");
    expect(body).not.toContain("Ich betreibe XPORTAL");
    expect(body).toContain("— XPORTAL");
  });

  it("setzt den Abmeldelink, sobald einer übergeben wird", () => {
    const body = draft({
      unsubscribeUrl: "https://x-portal.eu/unsubscribe?t=abc.def",
    }).body;
    expect(body).toContain("https://x-portal.eu/unsubscribe?t=abc.def");
  });

  it("kommt ohne Abmeldelink aus, ohne einen leeren Satz zu hinterlassen", () => {
    // Der Baustein muss für sich prüfbar bleiben; im Versand fehlt der Link
    // nie, weil deliverEmail() werbliche Post ohne ihn gar nicht durchlässt.
    expect(draft().body).not.toContain("Ein Klick:");
  });

  it("übernimmt eine abweichende Frist in den Text", () => {
    expect(draft({ retentionDays: 14 }).body).toContain("14 Tage");
  });
});

describe("Quellenangabe", () => {
  it("nennt jede Domain genau einmal, ohne www", () => {
    const body = draft().body;
    expect(body).toContain("linkedin.com, joerg-mueller.dev");
    expect(body).not.toContain("www.linkedin.com,");
  });

  it("überspringt unlesbare Quellen, statt sie zu erfinden", () => {
    const body = draft({
      candidate: { ...candidate, sourceUrls: ["kein-url", "https://example.org/x"] },
    }).body;
    expect(body).toContain("example.org");
    expect(body).not.toContain("kein-url");
  });

  it("kommt ohne jede Quelle aus, ohne leere Klammern zu hinterlassen", () => {
    const body = draft({ candidate: { ...candidate, sourceUrls: [] } }).body;
    expect(body).not.toContain("()");
    expect(body).toContain("öffentlich zugängliche Quellen");
  });
});

describe("Anrede und Projektbezug", () => {
  it("verwendet den Vornamen", () => {
    expect(draft().body.startsWith("Hallo Jörg,")).toBe(true);
  });

  it("fällt auf den vollen Namen zurück, wenn kein Vorname erkennbar ist", () => {
    const body = draft({
      candidate: { ...candidate, fullName: "A. Schmidt" },
    }).body;
    expect(body.startsWith("Hallo A. Schmidt,")).toBe(true);
  });

  it("bleibt ohne Projekthinweis allgemein, statt zu behaupten", () => {
    const body = draft({ projectHint: null }).body;
    expect(body).toContain("Unterstützung in Ihrem Fachgebiet");
    expect(body).not.toContain("Unterstützung für:");
  });
});

describe("Kanäle", () => {
  it("liefert für E-Mail einen Betreff und einen mailto-Link", () => {
    const result = draft();
    expect(result.subject).toContain("XPORTAL");
    expect(result.mailtoUrl).toContain("mailto:joerg%40example.com");
    expect(result.mailtoUrl).toContain("subject=");
    expect(result.mailtoUrl).toContain("body=");
  });

  it("erzeugt keinen mailto-Link ohne bekannte Adresse", () => {
    expect(draft({ contactEmail: null }).mailtoUrl).toBeNull();
  });

  it("bleibt bei LinkedIn ohne Betreff und innerhalb der Längengrenze", () => {
    const result = draft({ channel: "linkedin" });
    expect(result.subject).toBeNull();
    expect(result.mailtoUrl).toBeNull();
    expect(result.characters).toBeLessThanOrEqual(LINKEDIN_CHARACTER_LIMIT);
    expect(result.withinChannelLimit).toBe(true);
  });

  it("nennt auch die Kurzfassung Frist, Widerspruch und Einladungslink", () => {
    const body = draft({ channel: "linkedin" }).body;
    expect(body).toContain(`${DEFAULT_RETENTION_DAYS} Tagen`);
    expect(body).toContain("widersprechen");
    expect(body).toContain("einladung=abc123");
  });

  it("meldet eine Überlänge, statt sie stillschweigend zu senden", () => {
    const result = draft({
      channel: "linkedin",
      projectHint: "x".repeat(LINKEDIN_CHARACTER_LIMIT),
    });
    expect(result.withinChannelLimit).toBe(false);
  });
});

describe("Bedarf in der Nachricht", () => {
  const demand = {
    headline: "Datenmigration nach PostgreSQL",
    workMode: "hybrid" as const,
    location: "Frankfurt am Main",
    matchingSkills: ["PostgreSQL", "ETL", "Airflow"],
    otherSkills: ["Kubernetes"],
  };

  it("nennt Thema und Arbeitsform in einem Satz", () => {
    const body = draft({ demand }).body;
    expect(body).toContain(
      "Unterstützung im Bereich Datenmigration nach PostgreSQL — hybrid, teils vor Ort in Frankfurt am Main.",
    );
  });

  it("benennt die gefragten Erfahrungen, die auch auf dem Profil stehen", () => {
    const body = draft({ demand }).body;
    expect(body).toContain(
      "Gefragt ist unter anderem Erfahrung mit PostgreSQL, ETL und Airflow — das steht so auch auf Ihrem Profil.",
    );
    expect(body).toContain("Daneben geht es um Kubernetes.");
  });

  it("behauptet keine Arbeitsform, die nicht feststeht", () => {
    const body = draft({
      demand: { ...demand, workMode: "unknown" as const },
    }).body;
    expect(body).toContain("Unterstützung im Bereich Datenmigration nach PostgreSQL.");
    expect(body).not.toContain("Arbeitsform");
  });

  it("lässt den Satz zur Überschneidung weg, wenn es keine gibt", () => {
    const body = draft({
      demand: { ...demand, matchingSkills: [], otherSkills: [] },
    }).body;
    expect(body).not.toContain("auch auf Ihrem Profil");
    expect(body).not.toContain("Daneben geht es um");
  });

  it("nennt den Ort nur, wo er zur Arbeitsform gehört", () => {
    const remote = draft({
      demand: { ...demand, workMode: "remote" as const },
    }).body;
    expect(remote).toContain("— remote.");
    expect(remote).not.toContain("Frankfurt am Main");

    const vorOrt = draft({
      demand: { ...demand, workMode: "on_site" as const },
    }).body;
    expect(vorOrt).toContain("— vor Ort in Frankfurt am Main.");
  });

  it("bleibt beim einfachen Satz, wenn kein Thema dasteht", () => {
    const body = draft({
      demand: { ...demand, headline: "   " },
      projectHint: "React und PostgreSQL",
    }).body;
    expect(body).toContain("Ein Unternehmen sucht gerade Unterstützung für: React und PostgreSQL.");
  });

  it("trägt Thema und Überschneidung auch in die LinkedIn-Kurzfassung", () => {
    const entwurf = draft({ channel: "linkedin", demand });
    expect(entwurf.body).toContain("Datenmigration nach PostgreSQL");
    expect(entwurf.body).toContain("auch auf Ihrem Profil");
    expect(entwurf.withinChannelLimit).toBe(true);
  });
});

describe("Nachfrage in der Nachricht", () => {
  const basis = {
    headline: "Datenmigration nach PostgreSQL",
    workMode: "remote" as const,
    location: null,
    matchingSkills: ["PostgreSQL"],
    otherSkills: [],
  };

  it("nennt die Nachfrage erst, wenn sie ein Argument ist", () => {
    // Unter der Schwelle liest sich die Zahl wie eine Entschuldigung.
    const wenig = draft({ demand: { ...basis, searches: 7, uniqueSeekers: 4 } }).body;
    expect(wenig).not.toContain("Das ist kein Einzelfall");

    const viel = draft({ demand: { ...basis, searches: 14, uniqueSeekers: 6 } }).body;
    expect(viel).toContain(
      "In den letzten 90 Tagen gab es dazu 14 Anfragen von 6 verschiedenen Auftraggebern.",
    );
  });

  it("behauptet keine Auftraggeber, wo nur einer suchte", () => {
    const body = draft({ demand: { ...basis, searches: 12, uniqueSeekers: 1 } }).body;
    expect(body).toContain("gab es dazu 12 Anfragen.");
    expect(body).not.toContain("Auftraggebern");
  });

  it("schweigt ohne Zahl", () => {
    expect(draft({ demand: basis }).body).not.toContain("Das ist kein Einzelfall");
  });
});
