import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { composeBriefUpdateMessage } from "@/components/chat/brief-editor";
import { parseCapacityPhrase, parseLanguageLevels, parseRatePhrase, parseStartPhrase, unreadConditions } from "@/lib/domain/brief-phrases";
import { applyConfirmedFields, confirmedFieldsFrom } from "@/lib/domain/confirmed-fields";
import { parseFallbackBrief } from "@/lib/domain/fallback-parser";
import { buildDeterministicBrief } from "@/lib/openai/brief";
import { presentBrief } from "@/lib/presentation/chat";

const now = new Date("2026-09-30T10:00:00.000Z");

// Der React-Brief aus dem Audit vom 30.09.2026, in zwei üblichen Schreibweisen.
const AUDIT_BRIEFS = [
  "Wir suchen einen Senior React Entwickler für unser SaaS-Frontend. Muss: React und TypeScript. Next.js ist optional. Deutsch C1 erforderlich. Start: 15.10.2026, Dauer 3 Monate, Budget max. 800 € netto/Tag, 3 Tage/Woche, remote.",
  "Senior React Developer (m/w/d) gesucht. React + TypeScript zwingend, Next.js wünschenswert. Deutschkenntnisse auf C1-Niveau. Projektstart am 15.10.2026, Laufzeit 3 Monate, Tagessatz bis 800 € netto, Auslastung 3 Tage pro Woche.",
];

describe("F01: the basic analysis keeps all seven conditions of the audit brief", () => {
  it.each(AUDIT_BRIEFS)("reads %s", (text) => {
    const brief = buildDeterministicBrief({ originalRequest: text }, now);
    expect(brief.requiredSkills).toEqual(["React", "TypeScript"]);
    expect(brief.optionalSkills).toEqual(["Next.js"]);
    expect(brief.startWindow).toMatchObject({ earliest: "2026-10-15", latest: "2026-10-15" });
    expect(brief.duration).toMatchObject({ value: 3, unit: "months" });
    expect(brief.rate).toEqual({ min: null, max: 800, currency: "EUR", unit: "day" });
    expect(brief.budget).toBeNull();
    expect(brief.language).toBe("German");
    expect(brief.constraints).toEqual(expect.arrayContaining(["3 Tage pro Woche", "Deutsch C1"]));
    expect(unreadConditions(brief.originalRequest, brief)).toEqual([]);
  });

  it("shows the language in German and with its level", () => {
    const brief = buildDeterministicBrief({ originalRequest: AUDIT_BRIEFS[0]! }, now);
    const presented = presentBrief(brief);
    expect(presented.languages).toEqual(["Deutsch C1"]);
    expect(presented.constraints).not.toContain("Deutsch C1");
  });
});

describe("German phrases", () => {
  it("reads start dates in the usual forms", () => {
    expect(parseStartPhrase("ab 1.11.26", now)).toMatchObject({ earliest: "2026-11-01" });
    expect(parseStartPhrase("Start Anfang November", now)).toMatchObject({ earliest: "2026-11-01", latest: "2026-11-10" });
    expect(parseStartPhrase("Projektstart im Januar", now)).toMatchObject({ earliest: "2027-01-01", latest: "2027-01-31" });
    expect(parseStartPhrase("Start: 15. Oktober 2026", now)).toMatchObject({ earliest: "2026-10-15" });
    expect(parseStartPhrase("Start Marketing-Kampagne", now)).toBeNull();
    expect(parseStartPhrase("Start: 31.02.2027", now)).toBeNull();
  });

  it("reads a rate and never mistakes it for a total budget", () => {
    expect(parseRatePhrase("max. 800 € netto/Tag")).toEqual({ min: null, max: 800, currency: "EUR", unit: "day" });
    expect(parseRatePhrase("700–800 EUR pro Tag")).toEqual({ min: 700, max: 800, currency: "EUR", unit: "day" });
    expect(parseRatePhrase("95 €/h")).toEqual({ min: 95, max: 95, currency: "EUR", unit: "hour" });
    expect(parseRatePhrase("Der maximale Tagessatz beträgt EUR 800.")).toMatchObject({ min: null, max: 800 });
    expect(parseFallbackBrief("Budget: 800 €/Tag, React", { now }).budget).toBeNull();
    expect(buildDeterministicBrief({ originalRequest: "Projektbudget: 50.000 € für React" }, now).budget).toMatchObject({ max: 50000 });
    expect(buildDeterministicBrief({ originalRequest: "Budget: 800 €/Tag für React" }, now).budget).toBeNull();
  });

  it("reads weekly scope and does not take it for a duration", () => {
    expect(parseCapacityPhrase("für 3 Tage pro Woche")).toBe("3 Tage pro Woche");
    expect(parseCapacityPhrase("24 Stunden/Woche")).toBe("24 Stunden pro Woche");
    expect(parseFallbackBrief("React für 3 Tage pro Woche", { now }).duration).toBeNull();
  });

  it("keeps language levels", () => {
    expect(parseLanguageLevels("verhandlungssicheres Deutsch und Englisch B2")).toEqual([
      { language: "German", requirement: "Deutsch verhandlungssicher" },
      { language: "English", requirement: "Englisch B2" },
    ]);
  });
});

describe("F01: values confirmed in the form stay confirmed", () => {
  const edit = composeBriefUpdateMessage([
    { field: "startWindow", label: "Start", value: "15.10.2026" },
    { field: "budgetOrRate", label: "Budget oder Satz", value: "max. 800 € netto/Tag" },
    { field: "availabilityRequirement", label: "Verfügbarkeit", value: "3 Tage/Woche" },
    { field: "languages", label: "Sprachen", value: "Deutsch C1" },
  ]);

  it("reads only messages from the form", () => {
    expect(confirmedFieldsFrom(edit)?.get("Start")).toBe("15.10.2026");
    expect(confirmedFieldsFrom("- Start: 15.10.2026")).toBeNull();
  });

  it("applies them after the basic analysis, through a later search and a reload", () => {
    const first = buildDeterministicBrief({ originalRequest: "React und TypeScript für SaaS, Next.js optional, remote." }, now);
    const edited = buildDeterministicBrief({ originalRequest: first.originalRequest, latestMessage: edit, previousBrief: first }, now);
    const later = buildDeterministicBrief({ originalRequest: edited.originalRequest, latestMessage: "Bitte nochmal suchen.", previousBrief: edited }, now);
    for (const brief of [edited, later]) {
      expect(brief.startWindow).toMatchObject({ earliest: "2026-10-15" });
      expect(brief.rate).toMatchObject({ max: 800, unit: "day" });
      expect(brief.availabilityRequirement).toBe("3 Tage/Woche");
      expect(brief.constraints).toEqual(expect.arrayContaining(["3 Tage pro Woche", "Deutsch C1"]));
      expect(brief.language).toBe("German");
    }
  });

  it("replaces an earlier scope and language level instead of adding a second one", () => {
    const base = buildDeterministicBrief({ originalRequest: AUDIT_BRIEFS[0]! }, now);
    const changed = applyConfirmedFields(
      base,
      composeBriefUpdateMessage([
        { field: "availabilityRequirement", label: "Verfügbarkeit", value: "4 Tage pro Woche" },
        { field: "languages", label: "Sprachen", value: "Englisch B2" },
      ]),
      now,
    );
    expect(changed.constraints).toContain("4 Tage pro Woche");
    expect(changed.constraints).not.toContain("3 Tage pro Woche");
    expect(changed.constraints).toContain("Englisch B2");
    expect(changed.constraints).not.toContain("Deutsch C1");
    expect(changed.language).toBe("English");
  });

  it("removes a field the form cleared", () => {
    const base = buildDeterministicBrief({ originalRequest: AUDIT_BRIEFS[0]! }, now);
    const cleared = applyConfirmedFields(base, composeBriefUpdateMessage([{ field: "startWindow", label: "Start", value: "" }]), now);
    expect(cleared.startWindow).toBeNull();
  });
});

describe("F01: unread conditions are named after a basic analysis", () => {
  it("lists what the text contains but the brief does not", () => {
    const brief = { startWindow: null, duration: null, rate: null, budget: null, constraints: null };
    expect(unreadConditions("Start 15.10.2026, Laufzeit 3 Monate, 800 €, 3 Tage/Woche, Deutsch C1", brief)).toEqual([
      "Startdatum",
      "Dauer",
      "Budget oder Tagessatz",
      "Wochenumfang",
      "Sprachniveau",
    ]);
    expect(unreadConditions("React und TypeScript, remote", brief)).toEqual([]);
  });
});
