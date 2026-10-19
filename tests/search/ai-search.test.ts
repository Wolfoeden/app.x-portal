import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizeChatResponse } from "@/components/ChatWorkspace";
import { mapFreelancerProfileRow, type FreelancerProfileRow } from "@/lib/data/freelancers";
import {
  AiEvaluationSnapshotSchema,
  aiEvaluationSnapshot,
  aiResearchAllowed,
  buildAiShortlist,
  effectiveResultStatus,
  isWeakAiResult,
  CandidateSnapshotSchema,
  PREFILTER_ONLY_GAP,
  type FreelancerProfile,
} from "@/lib/domain";
import type { BriefResponsesClient } from "@/lib/openai/brief";
import { picksFromOutput, rankingRequest, rankProfiles } from "@/lib/openai/profile-ranking";
import {
  lexicalPrefilter,
  profileEmbeddingHash,
  profileEmbeddingText,
  rankingCandidateText,
  termsSharedWithRequest,
} from "@/lib/search/profile-text";

// Die Skill-Liste vom 19.10.2026, so wie sie aus der Profilansicht kopiert
// in den Chat kam: mit dem „×“ der Entfernen-Knöpfe hinter jedem Eintrag.
const ISMS_SKILLS = [
  "ISO 27001 Audits",
  "ITSM-Implementierung",
  "IT-Compliance Beratung",
  "Informationssicherheit Datenschutz",
  "Business Continuity Management",
  "IT-Service-Management",
  "ISO/IEC 27001 Audits",
  "Train-the-Trainer",
  "Stakeholdermanagement",
  "Projekt- und Programmleitung",
  "Risikomanagement",
  "ISMS Aufbau",
  "Management Workshops",
  "ITIL PRINCE2 Beratung",
  "Konformitätsprüfungen",
  "ITSM",
  "ISO 27001",
  "ITIL®",
  "PRINCE2®",
  "Governance",
  "Audits",
  "Transformation",
];
const PASTED_REQUEST = ISMS_SKILLS.map((skill) => `${skill}×`).join("\n");

function row(overrides: Partial<FreelancerProfileRow> & { id: string; role_title: string; skill_tags: string[] }): FreelancerProfileRow {
  return {
    avatar_path: null,
    display_name: `Person ${overrides.id.slice(-2)}`,
    languages: ["German"],
    location_text: "Berlin",
    work_modes: ["remote"],
    experience_summary: "Projekterfahrung laut Profil.",
    verified_facts: [],
    self_reported_facts: [],
    verification_status: "unverified",
    hourly_rate_minor: null,
    day_rate_minor: null,
    currency: null,
    profile_status: "active",
    availability_status: "unknown",
    availability_from: null,
    availability_updated_at: "2026-10-14T10:16:49.000Z",
    intro_policy: "free",
    booking_url: null,
    demo_status: "real",
    version: 1,
    ...overrides,
  };
}

const ismsProfile = mapFreelancerProfileRow(
  row({
    id: "00000000-0000-4000-8000-0000000000a1",
    display_name: "Marc Beispiel",
    role_title: "Spezialist für Transformation, Training & Audit",
    skill_tags: [
      ...ISMS_SKILLS.map((skill) => `Skill: ${skill}`),
      "Industry: IT-Service-Management (ITSM)",
      "Industry: Informationssicherheit",
      "Industry: Behörden",
    ],
  }),
);
const reactProfile = mapFreelancerProfileRow(
  row({
    id: "00000000-0000-4000-8000-0000000000a2",
    role_title: "Senior React Engineer",
    skill_tags: ["Skill: React", "Skill: TypeScript", "Skill: Next.js"],
  }),
);
const sapProfile = mapFreelancerProfileRow(
  row({
    id: "00000000-0000-4000-8000-0000000000a3",
    role_title: "SAP FI/CO Berater",
    skill_tags: ["Skill: SAP FI", "Skill: SAP CO", "Skill: S/4HANA", "Skill: Projektleitung"],
  }),
);
const securityProfile = mapFreelancerProfileRow(
  row({
    id: "00000000-0000-4000-8000-0000000000a4",
    role_title: "Informationssicherheitsbeauftragter",
    skill_tags: ["Skill: ISMS", "Skill: BSI IT-Grundschutz", "Skill: Risikomanagement"],
  }),
);
const pool: FreelancerProfile[] = [reactProfile, sapProfile, securityProfile, ismsProfile];

describe("Texte der Suche", () => {
  it("geben keinen Namen an den Anbieter", () => {
    expect(profileEmbeddingText(ismsProfile)).not.toContain("Marc");
    expect(rankingCandidateText("P1", ismsProfile)).not.toContain("Marc");
    expect(rankingCandidateText("P1", ismsProfile)).toMatch(/^\[P1\] Rolle: Spezialist/u);
  });

  it("nehmen Branchen als eigene Angabe in den Fingerabdruck", () => {
    expect(profileEmbeddingText(ismsProfile)).toContain("Branche: Informationssicherheit");
  });

  it("erneuern den Fingerabdruck, sobald sich Angaben oder Modell ändern", () => {
    const changed = { ...ismsProfile, role: "ISMS-Berater" };
    expect(profileEmbeddingHash(changed, "m")).not.toBe(profileEmbeddingHash(ismsProfile, "m"));
    expect(profileEmbeddingHash(ismsProfile, "a")).not.toBe(profileEmbeddingHash(ismsProfile, "b"));
    expect(profileEmbeddingHash(ismsProfile, "m")).toBe(profileEmbeddingHash(ismsProfile, "m"));
  });
});

describe("Vorauswahl über Fachwörter (Ersatzweg ohne Fingerabdruck)", () => {
  it("stellt das Profil mit genau den gesuchten Skills an die Spitze", () => {
    const candidates = lexicalPrefilter(PASTED_REQUEST, pool, 20);
    expect(candidates[0]?.profile.id).toBe(ismsProfile.id);
    expect(candidates[1]?.profile.id).toBe(securityProfile.id);
    // Großzügig: „Projekt-“ trifft auch „Projekterfahrung“. Das React-Profil
    // bleibt drin, aber hinter den beiden fachlich passenden.
    expect(candidates.findIndex(({ profile }) => profile.id === reactProfile.id)).toBeGreaterThan(1);
  });

  it("trifft auch zusammengesetzte Wörter", () => {
    const candidates = lexicalPrefilter("Wir suchen Informationssicherheit", pool, 20);
    expect(candidates.map(({ profile }) => profile.id)).toContain(securityProfile.id);
  });

  it("liefert nichts, wenn die Anfrage kein Fachwort enthält", () => {
    expect(lexicalPrefilter("Hallo!", pool, 20)).toEqual([]);
  });

  it("nennt nur Kompetenzen, die in Anfrage und Profil stehen", () => {
    expect(termsSharedWithRequest(PASTED_REQUEST, ismsProfile)).toEqual(ISMS_SKILLS.slice(0, 6));
    expect(termsSharedWithRequest(PASTED_REQUEST, reactProfile)).toEqual([]);
  });
});

describe("KI-Bewertung", () => {
  const candidates = [ismsProfile, securityProfile, sapProfile];

  it("schickt Kurzkennungen statt IDs und Namen", () => {
    const body = JSON.stringify(rankingRequest(PASTED_REQUEST, candidates, "model"));
    expect(body).toContain("[P1]");
    expect(body).toContain("[P3]");
    expect(body).not.toContain(ismsProfile.id);
    expect(body).not.toContain("Marc");
    expect(body).toContain('"store":false');
  });

  it("verwirft erfundene und doppelte Kennungen und begrenzt den Score", () => {
    const picks = picksFromOutput(
      {
        searchable: true,
        ranking: [
          { candidate: "P9", fitScore: 99, reasons: ["erfunden"], openPoints: [] },
          { candidate: "[P1]", fitScore: 140, reasons: ["ISO 27001 und ITIL belegt.", "ISO 27001 und ITIL belegt."], openPoints: [] },
          { candidate: "p1", fitScore: 50, reasons: ["doppelt"], openPoints: [] },
          { candidate: "P2", fitScore: -3, reasons: [], openPoints: ["ITIL nicht belegt."] },
        ],
      },
      candidates,
    );
    expect(picks).toEqual([
      { profileId: ismsProfile.id, fitScore: 100, reasons: ["ISO 27001 und ITIL belegt."], openPoints: [] },
      { profileId: securityProfile.id, fitScore: 0, reasons: [], openPoints: ["ITIL nicht belegt."] },
    ]);
  });

  function client(responses: Array<() => unknown>): BriefResponsesClient & { calls: number } {
    const fake = {
      calls: 0,
      async parse() {
        const next = responses[fake.calls++];
        const value = next ? next() : null;
        return {
          output_parsed: value,
          id: `resp_${fake.calls}`,
          model: "gpt-5.4-nano-2026-03-17",
          usage: { input_tokens: 5_000, output_tokens: 300, total_tokens: 5_300 },
        };
      },
    };
    return fake;
  }

  it("versucht es nach einem Fehler genau ein zweites Mal", async () => {
    const fake = client([
      () => {
        throw new Error("timeout");
      },
      () => ({ searchable: true, ranking: [{ candidate: "P1", fitScore: 92, reasons: ["Passt."], openPoints: [] }] }),
    ]);
    const result = await rankProfiles({ request: PASTED_REQUEST, candidates }, { responsesClient: fake });
    expect(fake.calls).toBe(2);
    expect(result).toMatchObject({ status: "ok", searchable: true, picks: [{ profileId: ismsProfile.id, fitScore: 92 }] });
  });

  it("meldet den Ausfall nach zwei unbrauchbaren Antworten", async () => {
    const fake = client([() => ({ nonsense: true }), () => ({ searchable: true, ranking: [] })]);
    const result = await rankProfiles({ request: PASTED_REQUEST, candidates }, { responsesClient: fake });
    expect(fake.calls).toBe(2);
    expect(result.status).toBe("failed");
    expect(result.usage).toHaveLength(2);
  });

  it("ruft ohne Kandidaten oder Schlüssel nichts auf", async () => {
    const fake = client([]);
    expect((await rankProfiles({ request: "x", candidates: [] }, { responsesClient: fake })).status).toBe("unavailable");
    expect((await rankProfiles({ request: "x", candidates }, { apiKey: null })).status).toBe("unavailable");
    expect(fake.calls).toBe(0);
  });
});

describe("Ergebnis aus Vorauswahl und Bewertung", () => {
  const prefilter = [
    { profile: securityProfile, similarity: 0.61 },
    { profile: ismsProfile, similarity: 0.58 },
    { profile: sapProfile, similarity: 0.31 },
    { profile: reactProfile, similarity: 0.12 },
  ];
  const sharedTerms = (profile: FreelancerProfile) => termsSharedWithRequest(PASTED_REQUEST, profile);

  it("stellt die Wahl der KI oben hin und behält die ganze Vorauswahl", () => {
    const result = buildAiShortlist({
      poolSize: 68,
      prefilter,
      ranking: {
        searchable: true,
        picks: [
          { profileId: ismsProfile.id, fitScore: 96, reasons: ["Alle 22 Skills im Profil."], openPoints: [] },
          { profileId: securityProfile.id, fitScore: 55, reasons: ["ISMS und Risikomanagement."], openPoints: ["ITIL nicht belegt."] },
        ],
      },
      sharedTerms,
    });
    expect(result.rankedBy).toBe("ai");
    expect(result.shortlist.status).toBe("ranked");
    expect(result.shortlist.ruleVersion).toBe("freelancer-ai-rank-v1");
    expect(result.shortlist.matches.map((match) => [match.profile.id, match.recommendationRole, match.fitScore])).toEqual([
      [ismsProfile.id, "primary", 96],
      [securityProfile.id, "alternative", 55],
    ]);
    expect(result.shortlist.matches[1]?.knownGaps).toEqual(["ITIL nicht belegt."]);
    expect(result.candidateOrder).toEqual([
      { profileId: ismsProfile.id, similarity: 0.58, rank: 1 },
      { profileId: securityProfile.id, similarity: 0.61, rank: 2 },
      { profileId: sapProfile.id, similarity: 0.31, rank: null },
      { profileId: reactProfile.id, similarity: 0.12, rank: null },
    ]);
    expect(CandidateSnapshotSchema.parse(result.candidateOrder)).toHaveLength(4);
    const snapshot = aiEvaluationSnapshot(result.shortlist.matches[0]!, result.rankedBy);
    expect(AiEvaluationSnapshotSchema.parse(snapshot)).toEqual({
      schemaVersion: 1,
      kind: "ai_ranking",
      rankedBy: "ai",
      recommendationRole: "primary",
      fitScore: 96,
    });
  });

  it("zeigt bei Ausfall der KI die nächsten drei, ausdrücklich unbewertet", () => {
    const result = buildAiShortlist({ poolSize: 68, prefilter, ranking: null, sharedTerms });
    expect(result.rankedBy).toBe("prefilter");
    expect(result.shortlist.status).toBe("ranked");
    expect(result.shortlist.matches).toHaveLength(3);
    expect(result.shortlist.matches[0]?.fitScore).toBeUndefined();
    expect(result.shortlist.matches[0]?.knownGaps).toEqual([PREFILTER_ONLY_GAP]);
    expect(result.shortlist.matches[1]?.matchReasons[0]).toMatch(/^In Anfrage und Profil genannt: ISO 27001 Audits/u);
    expect(result.candidateOrder.map((entry) => entry.rank)).toEqual([1, 2, 3, null]);
  });

  it("fragt nach, wenn die KI keine fachliche Anforderung erkennt", () => {
    const result = buildAiShortlist({ poolSize: 68, prefilter, ranking: { searchable: false, picks: [] }, sharedTerms });
    expect(result.shortlist.status).toBe("needs_clarification");
    expect(result.shortlist.clarificationCode).toBe("no_extractable_requirement");
    expect(result.candidateOrder).toEqual([]);
  });

  it("meldet einen leeren Pool nicht als unklare Anfrage", () => {
    const result = buildAiShortlist({ poolSize: 0, prefilter: [], ranking: null, sharedTerms });
    expect(result.shortlist.status).toBe("no_reliable_match");
  });
});

describe("Chat-Antwort im Browser", () => {
  it("behält einen Treffer ohne Terminlink und die ganze Vorauswahl", () => {
    const profile = {
      id: ismsProfile.id,
      demoStatus: "real",
      bookingUrl: null,
      displayName: "Marc Beispiel",
      role: ismsProfile.role,
      skillTags: ISMS_SKILLS,
      recommendationRole: "primary",
      fitScore: 96,
      rankedBy: "ai",
      matchReasons: ["Alle Skills im Profil."],
      knownGaps: [],
      introPolicy: { type: "premium", label: "Aktuell nicht direkt buchbar" },
    };
    const response = normalizeChatResponse(
      {
        matches: [profile],
        partialMatches: [],
        candidates: [{ ...profile, candidateRank: 1 }, { ...profile, id: securityProfile.id, candidateRank: null }],
        matchingStatus: "ranked",
      },
      "Test",
    );
    expect(response.matches.map((match) => [match.id, match.bookingUrl, match.rankedBy, match.fitScore])).toEqual([
      [ismsProfile.id, null, "ai", 96],
    ]);
    expect(response.candidates?.map((candidate) => [candidate.id, candidate.candidateRank])).toEqual([
      [ismsProfile.id, 1],
      [securityProfile.id, undefined],
    ]);
  });
});

describe("Schwelle der KI-Einschätzung (70)", () => {
  const prefilter = [
    { profile: ismsProfile, similarity: 0.6 },
    { profile: securityProfile, similarity: 0.5 },
  ];
  const sharedTerms = () => [];
  const decisionFor = (scores: number[]) =>
    buildAiShortlist({
      poolSize: 68,
      prefilter,
      ranking: {
        searchable: true,
        picks: scores.map((fitScore, index) => ({
          profileId: prefilter[index]!.profile.id,
          fitScore,
          reasons: ["Passt."],
          openPoints: [],
        })),
      },
      sharedTerms,
    }).shortlist.decisionSnapshot;

  it("speichert die beste Einschätzung und die Profile oben", () => {
    const decision = decisionFor([64, 52]);
    expect(decision.bestFitScore).toBe(64);
    expect(decision.rankedProfileIds).toEqual([ismsProfile.id, securityProfile.id]);
    expect(buildAiShortlist({ poolSize: 68, prefilter, ranking: null, sharedTerms }).shortlist.decisionSnapshot.bestFitScore).toBeNull();
  });

  it("zählt ein schwaches Ergebnis als Kataloglücke, ein tragendes nicht", () => {
    expect(effectiveResultStatus("ranked", decisionFor([64]))).toBe("no_reliable_match");
    expect(effectiveResultStatus("ranked", decisionFor([70]))).toBe("ranked");
    expect(effectiveResultStatus("ranked", buildAiShortlist({ poolSize: 68, prefilter, ranking: null, sharedTerms }).shortlist.decisionSnapshot)).toBe("no_reliable_match");
    // Ältere Suchen ohne KI-Feld bleiben, wie sie waren.
    const legacy = { ...decisionFor([95]) };
    delete (legacy as { bestFitScore?: unknown }).bestFitScore;
    expect(effectiveResultStatus("ranked", legacy)).toBe("ranked");
    expect(effectiveResultStatus("needs_clarification", decisionFor([10]))).toBe("needs_clarification");
  });

  it("gibt die Recherche bei schwachem Ergebnis oder verworfenen Profilen frei", () => {
    const strong = decisionFor([88, 75]);
    expect(isWeakAiResult(strong)).toBe(false);
    expect(aiResearchAllowed("ranked", strong, new Set())).toBe(false);
    expect(aiResearchAllowed("ranked", strong, new Set([ismsProfile.id]))).toBe(false);
    expect(aiResearchAllowed("ranked", strong, new Set([ismsProfile.id, securityProfile.id]))).toBe(true);
    expect(aiResearchAllowed("ranked", decisionFor([60]), new Set())).toBe(true);
    expect(aiResearchAllowed("needs_clarification", decisionFor([60]), new Set())).toBe(false);
    expect(aiResearchAllowed("no_reliable_match", null, new Set())).toBe(true);
  });
});
