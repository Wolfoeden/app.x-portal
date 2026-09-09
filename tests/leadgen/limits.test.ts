import { describe, expect, it } from "vitest";

import {
  LEAD_BULK_SEND_LIMIT,
  LEAD_HOURLY_SEND_LIMIT,
  LEAD_SEND_WINDOW,
  LEAD_SEND_WINDOW_HOURS,
  PROVIDER_HOURLY_CEILING,
  isLeadScope,
  isLeadStatus,
  isWithinLeadSendWindow,
  leadDayStart,
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

  it("rechnet die Tagesmenge aus Stundenmenge und Fenster", () => {
    // Keine glatte Zahl von Hand: vierzig je Stunde über vier Stunden.
    // Vorher stand hier zwanzig, hergeleitet aus nichts — und die Kachel
    // meldete „25 von 20", während der Anbieter das Sechsfache verkraftet.
    expect(LEAD_SEND_WINDOW_HOURS).toBe(4);
    expect(LEAD_BULK_SEND_LIMIT).toBe(LEAD_HOURLY_SEND_LIMIT * 4);
    expect(LEAD_BULK_SEND_LIMIT).toBe(160);
  });

  it("bleibt in jeder Stunde des Fensters unter der Grenze des Anbieters", () => {
    // Die Tagesmenge darf die Stundenbremse nicht aushebeln: Sie verteilt
    // sich über das Fenster, statt in der ersten Stunde abzufließen.
    expect(LEAD_BULK_SEND_LIMIT / LEAD_SEND_WINDOW_HOURS).toBeLessThan(
      PROVIDER_HOURLY_CEILING,
    );
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

describe("Versandfenster", () => {
  it("steht auf 8 bis 12 Uhr an Werktagen", () => {
    expect(LEAD_SEND_WINDOW.startHour).toBe(8);
    expect(LEAD_SEND_WINDOW.endHour).toBe(12);
    expect([...LEAD_SEND_WINDOW.weekdays]).toEqual([1, 2, 3, 4, 5]);
  });

  // Sommerzeit: Berlin liegt zwei Stunden vor UTC.
  it("öffnet im Sommer um 6 Uhr UTC und schließt um 10 Uhr UTC", () => {
    // Montag, 7. September 2026.
    expect(isWithinLeadSendWindow(new Date("2026-09-07T05:59:00Z"))).toBe(false);
    expect(isWithinLeadSendWindow(new Date("2026-09-07T06:00:00Z"))).toBe(true);
    expect(isWithinLeadSendWindow(new Date("2026-09-07T09:59:00Z"))).toBe(true);
    expect(isWithinLeadSendWindow(new Date("2026-09-07T10:00:00Z"))).toBe(false);
  });

  // Winterzeit: eine Stunde vor UTC. Dieselben Ortszeiten, andere UTC-Zeiten —
  // genau der Grund, warum die Grenze nicht im Zeitplan der Datenbank steht.
  it("verschiebt sich im Winter um eine Stunde", () => {
    // Montag, 7. Dezember 2026.
    expect(isWithinLeadSendWindow(new Date("2026-12-07T06:59:00Z"))).toBe(false);
    expect(isWithinLeadSendWindow(new Date("2026-12-07T07:00:00Z"))).toBe(true);
    expect(isWithinLeadSendWindow(new Date("2026-12-07T10:59:00Z"))).toBe(true);
    expect(isWithinLeadSendWindow(new Date("2026-12-07T11:00:00Z"))).toBe(false);
  });

  it("bleibt am Wochenende zu", () => {
    // Samstag und Sonntag, mitten im Fenster.
    expect(isWithinLeadSendWindow(new Date("2026-09-05T08:00:00Z"))).toBe(false);
    expect(isWithinLeadSendWindow(new Date("2026-09-06T08:00:00Z"))).toBe(false);
  });
});

describe("leadDayStart", () => {
  it("liefert Mitternacht der Ortszeit und nicht Mitternacht UTC", () => {
    // 7. September 2026, 9 Uhr Ortszeit. Der Tag begann um 22 Uhr UTC am 6.
    expect(leadDayStart(new Date("2026-09-07T07:00:00Z")).toISOString()).toBe(
      "2026-09-06T22:00:00.000Z",
    );
  });

  it("rechnet im Winter mit dem anderen Abstand", () => {
    expect(leadDayStart(new Date("2026-12-07T07:00:00Z")).toISOString()).toBe(
      "2026-12-06T23:00:00.000Z",
    );
  });

  it("zählt eine Nachricht kurz nach Mitternacht zum neuen Tag", () => {
    // 00:30 Ortszeit ist 22:30 UTC des Vortags — vor der Korrektur fiel
    // dieser Zeitpunkt aus der Tageszählung heraus.
    const kurzNachMitternacht = new Date("2026-09-06T22:30:00Z");
    expect(leadDayStart(kurzNachMitternacht).toISOString()).toBe(
      "2026-09-06T22:00:00.000Z",
    );
  });
});
