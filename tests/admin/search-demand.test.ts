import { describe, expect, it } from "vitest";

import { buildSearchDemandReport, type SearchDemandSourceRow } from "@/lib/admin/search-demand-analysis";
import { createProjectBriefV2 } from "@/lib/domain/brief";

function brief(skills: string[], input: { optional?: string[]; workMode?: "remote" | "hybrid" | "on_site"; location?: string } = {}) {
  return createProjectBriefV2({
    originalRequest: `${skills.join(" und ")} sind erforderlich.`,
    projectTitle: `${skills.join(" / ")} Unterstützung`,
    summary: `Gesucht wird Unterstützung für ${skills.join(" und ")}.`,
    requiredSkills: skills,
    optionalSkills: input.optional ?? null,
    excludedSkills: null,
    language: "German",
    workMode: input.workMode ?? "remote",
    location: input.location ?? null,
    startWindow: null,
    duration: null,
    budget: null,
    rate: null,
    constraints: null,
    qualifications: null,
    availabilityRequirement: null,
    contractualRequirements: null,
  });
}

function row(input: {
  id: string;
  project: string;
  user?: string;
  at: string;
  skills?: string[];
  result?: SearchDemandSourceRow["result_status"];
  count?: number;
}): SearchDemandSourceRow {
  const result = input.result === undefined ? "ranked" : input.result;
  return {
    id: input.id,
    source: "user_search",
    project_id: input.project,
    owner_user_id: input.user ?? "customer-1",
    lead_id: null,
    demand_actor: input.user ?? "customer-1",
    brief_snapshot: brief(input.skills ?? ["React", "TypeScript"]),
    decision_snapshot: null,
    result_count: input.count ?? (result === "ranked" ? 2 : 0),
    result_status: result,
    created_at: input.at,
  };
}

/** Eine Zeile, wie der Lead-Abgleich sie schreibt: kein Projekt, kein Konto. */
function leadRow(input: {
  id: string;
  lead: number;
  actor?: string;
  at: string;
  skills?: string[];
  result?: SearchDemandSourceRow["result_status"];
}): SearchDemandSourceRow {
  const result = input.result === undefined ? "no_reliable_match" : input.result;
  return {
    id: input.id,
    source: "lead",
    project_id: null,
    owner_user_id: null,
    lead_id: input.lead,
    demand_actor: input.actor ?? "pseudonym-agentur-1",
    brief_snapshot: brief(input.skills ?? ["Kubernetes"]),
    decision_snapshot: null,
    result_count: result === "ranked" ? 2 : 0,
    result_status: result,
    created_at: input.at,
  };
}

const now = new Date("2026-09-04T12:00:00.000Z");

describe("search demand analysis", () => {
  it("counts the latest matching per project and removes internal usage before aggregation", () => {
    const report = buildSearchDemandReport({
      now,
      period: 90,
      excludedUserIds: new Set(["roman-id"]),
      rows: [
        row({ id: "old", project: "project-1", at: "2026-09-01T09:00:00.000Z", result: "no_reliable_match" }),
        row({ id: "new", project: "project-1", at: "2026-09-01T10:00:00.000Z", result: "ranked", count: 3 }),
        row({ id: "internal", project: "project-2", user: "roman-id", at: "2026-09-02T10:00:00.000Z", result: "no_reliable_match" }),
      ],
    });

    expect(report.totals).toMatchObject({
      searches: 1,
      ranked: 1,
      noReliableMatch: 0,
      excludedSearches: 1,
      excludedAccounts: 1,
    });
    expect(report.profiles[0]).toMatchObject({ searches: 1, averageResults: 3 });
  });

  it("merges reordered canonical core skills into one competency profile", () => {
    const report = buildSearchDemandReport({
      now,
      period: 90,
      rows: [
        row({ id: "a", project: "project-a", user: "customer-a", at: "2026-09-02T10:00:00.000Z", skills: ["React", "TypeScript"] }),
        row({ id: "b", project: "project-b", user: "customer-b", at: "2026-09-03T10:00:00.000Z", skills: ["typescript", "react"] }),
      ],
    });

    expect(report.profiles).toHaveLength(1);
    expect(report.profiles[0]).toMatchObject({
      label: "React + TypeScript",
      searches: 2,
      uniqueUsers: 2,
    });
  });

  it("keeps clarification and legacy unknowns out of the true gap rate", () => {
    const report = buildSearchDemandReport({
      now,
      period: 90,
      rows: [
        row({ id: "ranked", project: "ranked", at: "2026-09-01T10:00:00.000Z", result: "ranked", count: 1 }),
        row({ id: "gap", project: "gap", at: "2026-09-02T10:00:00.000Z", result: "no_reliable_match" }),
        row({ id: "clarify", project: "clarify", at: "2026-09-03T10:00:00.000Z", result: "needs_clarification" }),
        row({ id: "legacy", project: "legacy", at: "2026-09-04T10:00:00.000Z", result: null }),
      ],
    });

    expect(report.totals).toMatchObject({
      searches: 4,
      measurableOutcomes: 2,
      noReliableMatch: 1,
      needsClarification: 1,
      unknownOutcome: 1,
      noReliableMatchRate: 0.5,
    });
  });

  it("compares each profile with the equally long previous window", () => {
    const report = buildSearchDemandReport({
      now,
      period: 30,
      rows: [
        row({ id: "previous", project: "previous", at: "2026-07-25T10:00:00.000Z" }),
        row({ id: "current-a", project: "current-a", at: "2026-08-20T10:00:00.000Z" }),
        row({ id: "current-b", project: "current-b", at: "2026-09-02T10:00:00.000Z" }),
      ],
    });

    expect(report.profiles[0]).toMatchObject({
      searches: 2,
      previousSearches: 1,
      trendPercent: 100,
      isNewDemand: false,
    });
  });

  it("surfaces invalid and skill-less briefs as data-quality issues", () => {
    const noSkills = brief([]);
    const report = buildSearchDemandReport({
      now,
      period: 90,
      rows: [
        { ...row({ id: "invalid", project: "invalid", at: "2026-09-01T10:00:00.000Z" }), brief_snapshot: { broken: true } },
        { ...row({ id: "unclassified", project: "unclassified", at: "2026-09-02T10:00:00.000Z" }), brief_snapshot: noSkills },
      ],
    });

    expect(report.totals).toMatchObject({
      searches: 1,
      invalidBriefs: 1,
      unclassifiedSearches: 1,
    });
    expect(report.profiles).toHaveLength(0);
  });
});

describe("Nachfrage aus Leads", () => {
  /**
   * Der eigentliche Zweck: Eine Ausschreibung, zu der der Katalog niemanden
   * führt, muss in derselben Auswertung auftauchen wie eine Nutzersuche
   * ohne Treffer. Sonst bliebe die Lücke unsichtbar, die sie beschreibt.
   */
  it("zählt eine Ausschreibung ohne Treffer als Nachfrage", () => {
    const report = buildSearchDemandReport({
      now,
      period: 90,
      rows: [
        leadRow({ id: "l1", lead: 1, at: "2026-09-01T09:00:00.000Z", skills: ["Kubernetes"] }),
      ],
    });
    expect(report.totals.searches).toBe(1);
    expect(report.totals.noReliableMatch).toBe(1);
    expect(report.totals.uniqueUsers).toBe(1);
  });

  /**
   * Dieselbe Agentur schreibt mehrfach aus — K-Recruiting steht vierzehnmal
   * in der Warteschlange. Das sind vierzehn Anlässe, aber ein Suchender.
   */
  it("zählt dieselbe Agentur als einen Akteur", () => {
    const report = buildSearchDemandReport({
      now,
      period: 90,
      rows: [
        leadRow({ id: "l1", lead: 1, actor: "agentur", at: "2026-09-01T09:00:00.000Z" }),
        leadRow({ id: "l2", lead: 2, actor: "agentur", at: "2026-09-02T09:00:00.000Z" }),
        leadRow({ id: "l3", lead: 3, actor: "agentur", at: "2026-09-03T09:00:00.000Z" }),
      ],
    });
    expect(report.totals.searches).toBe(3);
    expect(report.totals.uniqueUsers).toBe(1);
  });

  /**
   * Ohne eigenen Schlüssel fielen alle Lead-Zeilen in einen Eimer, weil ihr
   * project_id leer ist — aus drei Ausschreibungen würde eine.
   */
  it("wirft Leads nicht in denselben Eimer wie ein fehlendes Projekt", () => {
    const report = buildSearchDemandReport({
      now,
      period: 90,
      rows: [
        leadRow({ id: "l1", lead: 1, at: "2026-09-01T09:00:00.000Z", skills: ["Kubernetes"] }),
        leadRow({ id: "l2", lead: 2, at: "2026-09-02T09:00:00.000Z", skills: ["SAP FICO"] }),
        row({ id: "s1", project: "p1", at: "2026-09-03T09:00:00.000Z" }),
      ],
    });
    expect(report.totals.searches).toBe(3);
  });

  /**
   * Der Ausschluss eigener Konten darf einen Lead nicht treffen: Er trägt
   * kein Konto und kann deshalb auch nicht das eigene sein.
   */
  it("schließt Leads nicht über die Konten-Ausschlussliste aus", () => {
    const report = buildSearchDemandReport({
      now,
      period: 90,
      excludedUserIds: new Set(["betreiber"]),
      rows: [
        leadRow({ id: "l1", lead: 1, at: "2026-09-01T09:00:00.000Z" }),
        row({ id: "s1", project: "p1", user: "betreiber", at: "2026-09-02T09:00:00.000Z" }),
      ],
    });
    expect(report.totals.searches).toBe(1);
  });
});

