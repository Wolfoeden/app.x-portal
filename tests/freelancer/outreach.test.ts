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
    expect(body).toContain("Ohne Ihre ausdrückliche Zustimmung");
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
