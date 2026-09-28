import { describe, expect, it } from "vitest";

import { roleFamilies, roleFit } from "@/lib/domain/role-taxonomy";

/**
 * Die Titel stammen aus echten Anfragen, Ausschreibungen und Profilen
 * (September 2026). Geprüft wird vor allem, dass die Liste nichts behauptet,
 * was im Titel nicht steht — ein falscher Fund würde ein passendes Profil
 * aus der Empfehlung nehmen.
 */
describe("Rollenfamilien erkennen", () => {
  it.each([
    ["SAP Engineer (Joule/SAP AI)", ["ai", "sap"]],
    ["Testmanagement / QA", ["qa_test"]],
    ["SAP HCM / SuccessFactors / Testing", ["sap", "qa_test"]],
    ["Cloud Backend & Edge DevOps Engineer (m/f/x)", ["backend", "devops_cloud"]],
    ["Java Softwareentwicklung", ["backend", "software"]],
    ["IT Support (1st/2nd Level) – Helpdesk & Ticketbearbeitung", ["it_support"]],
    ["UX/UI Designer für B2B-Webanwendung / SaaS", ["ux_design"]],
    ["eCommerce Product Owner (m/f/d)", ["agile", "ecommerce"]],
    ["Requirements Engineer für Freelancer-Matching-Plattform", ["business_analysis"]],
    ["Projektleiter ITCS / ÖPNV (Freelance)", ["project_management"]],
    ["Baukoordinator Elektrotechnik & Stationsleittechnik (m/w/d)", ["hardware_engineering"]],
    ["KI / Full Stack / Cloud", ["fullstack", "devops_cloud", "ai"]],
    ["Data Scientist (Python, Directus, React)", ["data_science"]],
  ])("%s", (title, expected) => {
    expect(roleFamilies(title).sort()).toEqual([...expected].sort());
  });

  it.each([
    "KI-gestützter Hausverwaltungs-Copilot",
  ])("erkennt KI auch vor einem Bindestrich: %s", (title) => {
    expect(roleFamilies(title)).toContain("ai");
  });

  it.each([
    "Freelancer zur Einführung von Microsoft im Team",
    "IT Consultant Zahlungsverkehr / Banking Software",
    "AI-freie Skilehrer-Planung",
    "Neues Projekt (ID: 30669)",
  ])("erfindet keine Rolle, wo keine steht: %s", (title) => {
    const found = roleFamilies(title);
    expect(found).not.toContain("hr_coaching");
    expect(found).not.toContain("software");
    expect(found).not.toContain("qa_test");
  });

  it("liefert für leere Titel nichts", () => {
    expect(roleFamilies(null)).toEqual([]);
    expect(roleFamilies("   ")).toEqual([]);
  });
});

describe("Passt die Rolle?", () => {
  it("erkennt den Fall, der den Anlass gab", () => {
    expect(roleFit("SAP Engineer (Joule/SAP AI)", "Testmanagement / QA").kind).toBe("mismatch");
  });

  it("lässt ein SAP-Profil mit Testschwerpunkt für eine SAP-Rolle gelten", () => {
    expect(roleFit("SAP Engineer (Joule/SAP AI)", "SAP HCM / SuccessFactors / Testing").kind).toBe("match");
  });

  it("lässt Fullstack für Frontend und Backend gelten", () => {
    expect(roleFit("Frontend Engineer (m/w/d)", "Full Stack / KI").kind).toBe("match");
    expect(roleFit("Cloud Backend Engineer (m/f/x)", "KI / Full Stack / Cloud").kind).toBe("match");
  });

  it("lässt allgemeine Softwareentwicklung für jede Entwicklerrolle gelten", () => {
    expect(roleFit("Java Entwickler (m/w/d)", "Softwareentwickler").kind).toBe("match");
  });

  it("hält Projektleitung und Agile füreinander offen", () => {
    expect(roleFit("Scrum Master (SAFe)", "IT-Projektmanager & Berater für Anforderungsmanagement").kind).toBe("match");
  });

  it("trennt Marketing von Entwicklung", () => {
    expect(roleFit("Frontend Engineer (m/w/d)", "Performance Marketing").kind).toBe("mismatch");
  });

  it("liest ein Themenwort wie KI im Projekttitel als gesuchte Richtung", () => {
    expect(roleFit("KI-Automatisierung mit n8n", "Performance Marketing").kind).toBe("mismatch");
    expect(roleFit("KI-Automatisierung mit n8n", "Performance Marketing / KI").kind).toBe("match");
  });

  it("wirkt nicht, wenn die Anfrage keine Rolle nennt", () => {
    expect(roleFit("Neues Projekt", "Performance Marketing").kind).toBe("not_requested");
  });

  it("wirkt nicht, wenn das Profil keine erkennbare Rolle hat", () => {
    expect(roleFit("SAP FI/CO Berater", "Senior Blockchain-Spezialist").kind).toBe("unknown");
  });
});
