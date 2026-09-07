import { describe, expect, it } from "vitest";

import {
  LEAD_BULK_SEND_LIMIT,
  isLeadScope,
  isLeadStatus,
  leadHeadline,
  leadSourceUrl,
} from "@/lib/leadgen/limits";

describe("Lead-Konstanten", () => {
  it("erkennt nur die vier Zustände, die die Datenbank zulässt", () => {
    expect(isLeadStatus("new")).toBe(true);
    expect(isLeadStatus("contacted")).toBe(true);
    expect(isLeadStatus("replied")).toBe(true);
    expect(isLeadStatus("dismissed")).toBe(true);
    expect(isLeadStatus("archived")).toBe(false);
    expect(isLeadStatus(null)).toBe(false);
  });

  it("erkennt nur die drei Ansichten", () => {
    expect(isLeadScope("open")).toBe(true);
    expect(isLeadScope("archived")).toBe(true);
    expect(isLeadScope("all")).toBe(true);
    expect(isLeadScope("offen")).toBe(false);
  });

  it("hält den Stapelversand bei der Tagesmenge eines Postfachs", () => {
    expect(LEAD_BULK_SEND_LIMIT).toBe(20);
  });
});

describe("leadHeadline", () => {
  it("nimmt den Titel vor dem ersten Gedankenstrich", () => {
    expect(
      leadHeadline(
        "Senior DevOps Engineer – Kubernetes | Remote — Baut CI/CD auf. — https://example.invalid/x",
      ),
    ).toBe("Senior DevOps Engineer – Kubernetes | Remote");
  });

  it("gibt den ganzen Text zurück, wenn kein Trenner vorkommt", () => {
    expect(leadHeadline("Projektmanager gesucht")).toBe(
      "Projektmanager gesucht",
    );
  });
});

describe("leadHeadline kürzt, was nicht in einen Betreff passt", () => {
  /**
   * Der Fall aus der Produktion: Lead 244 trennt mit senkrechten Strichen
   * statt mit dem Gedankenstrich des Importwerkzeugs. Ungekürzt landete die
   * ganze Zeile mitsamt Adresse im Betreff.
   */
  it("schneidet an einem Zweittrenner, wenn der Haupttrenner fehlt", () => {
    expect(
      leadHeadline(
        "Project Manager with AI/software within Finance Industry | 100% remote, 3 Monate (verlängerbar), technisches PM für zwei fusionierte AI/Finance-Projekte | https://example.invalid/x",
      ),
    ).toBe("Project Manager with AI/software within Finance Industry");
  });

  it("lässt die Adresse nie stehen", () => {
    expect(leadHeadline("Lead Architect https://example.invalid/x")).toBe(
      "Lead Architect",
    );
  });

  /**
   * Die Geschlechterkennzeichnung gehört zur Ausschreibung, nicht zur Rolle.
   * Als Suchbegriff im Portal ist sie schädlich: kein Profil trägt sie.
   */
  it("entfernt die Geschlechterkennzeichnung", () => {
    expect(
      leadHeadline("SAP FICO Senior Solution Lead/Architect (m/f/x) - Remote work within Germany or European Union"),
    ).toBe("SAP FICO Senior Solution Lead/Architect");
    expect(leadHeadline("Consultant (m/w/d) ISO 27001")).toBe(
      "Consultant ISO 27001",
    );
  });

  it("hält auch ohne jeden Trenner die Grenze ein", () => {
    const lang = "Senior ".repeat(30) + "Engineer";
    const headline = leadHeadline(lang);
    expect(headline.length).toBeLessThanOrEqual(80);
    expect(headline.endsWith(" ")).toBe(false);
  });

  /**
   * Ein Zweittrenner darf einen kurzen Titel nicht zerlegen: der Strich in
   * „Senior AI Engineer – LLM / Agents“ gehoert zum Titel, er trennt nichts ab.
   */
  it("lässt einen kurzen Titel unangetastet", () => {
    expect(leadHeadline("Senior AI Engineer – LLM / Agents / MCP")).toBe(
      "Senior AI Engineer – LLM / Agents / MCP",
    );
  });
});

describe("leadSourceUrl", () => {
  it("findet die Adresse am Ende der Zeile", () => {
    expect(
      leadSourceUrl("Rolle — Beschreibung — https://www.example.invalid/p/123"),
    ).toBe("https://www.example.invalid/p/123");
  });

  it("lässt ein Satzzeichen am Ende weg, statt es mitzunehmen", () => {
    expect(leadSourceUrl("Rolle — siehe https://example.invalid/p/9.")).toBe(
      "https://example.invalid/p/9",
    );
  });

  it("gibt null zurück, wenn keine Adresse enthalten ist", () => {
    expect(leadSourceUrl("Rolle — Beschreibung ohne Link")).toBeNull();
  });
});
