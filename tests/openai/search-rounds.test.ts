import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseFallbackBrief } from "@/lib/domain";
import {
  searchExternalFreelancers,
  type ExternalSearchResponsesClient,
} from "@/lib/openai/external-freelancer-search";

const SAFETY_IDENTIFIER = "usr_4e8a57f0b51c";
const brief = parseFallbackBrief(
  "React und TypeScript erforderlich, deutsch, remote.",
  { now: new Date("2026-08-25T10:00:00.000Z") },
);

function webOutput(urls: string[]) {
  return [
    {
      type: "web_search_call",
      action: { type: "search", queries: ["q"], sources: urls.map((url) => ({ type: "url", url })) },
      status: "completed",
    },
  ];
}

function candidate(name: string, profileUrl: string, extra: Record<string, unknown> = {}) {
  return {
    displayName: name,
    role: "IT-Support Freelancer",
    summary: "Öffentlich beschriebenes Profil.",
    matchedRequirements: ["IT-Support"],
    knownGaps: [],
    profileUrl,
    bookingUrl: null,
    linkedinUrl: null,
    websiteUrl: null,
    portfolioUrl: null,
    skills: ["Helpdesk"],
    activities: [],
    projects: [],
    sourceUrls: [profileUrl],
    ...extra,
  };
}

function clientReturning(
  responses: { candidates: unknown[]; urls: string[] }[],
): { parse: ExternalSearchResponsesClient["parse"]; bodies: unknown[] } {
  const bodies: unknown[] = [];
  let call = 0;
  const parse = vi.fn(async (body: unknown) => {
    bodies.push(body);
    const current = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    return {
      id: `resp_${call}`,
      model: "gpt-5.4-nano-2026-03-17",
      output_parsed: { candidates: current.candidates },
      output: webOutput(current.urls),
      usage: {
        input_tokens: 1_000,
        input_tokens_details: { cached_tokens: 100 },
        output_tokens: 200,
        total_tokens: 1_200,
      },
    };
  }) as unknown as ExternalSearchResponsesClient["parse"];
  return { parse, bodies };
}

describe("Zwei Runden", () => {
  it("stellt die geplanten Anfragen in den Auftrag", async () => {
    const { parse, bodies } = clientReturning([{ candidates: [], urls: [] }]);
    await searchExternalFreelancers(
      { brief, safetyIdentifier: SAFETY_IDENTIFIER },
      { responsesClient: { parse } },
    );
    const prompt = JSON.stringify(bodies[0]);
    expect(prompt).toContain("site:linkedin.com/in");
    expect(prompt).toContain("-stellenangebot");
  });

  it("hört nach Runde 1 auf, wenn zwei belastbare Treffer da sind", async () => {
    const a = "https://www.xing.com/profile/Anna_Beispiel";
    const b = "https://www.linkedin.com/in/bob-schmidt";
    const { parse } = clientReturning([
      {
        candidates: [
          candidate("Anna Beispiel", a, { linkedinUrl: null }),
          candidate("Bob Schmidt", b),
        ],
        urls: [a, b],
      },
    ]);
    const result = await searchExternalFreelancers(
      { brief, safetyIdentifier: SAFETY_IDENTIFIER },
      { responsesClient: { parse } },
    );
    expect(result.mode).toBe("openai");
    expect(result.candidates).toHaveLength(2);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("fasst nach, wenn Runde 1 zu wenig bringt", async () => {
    const weak = "https://www.freelancermap.de/profil/it-support";
    const strong = "https://www.xing.com/profile/Clara_Meyer";
    const { parse, bodies } = clientReturning([
      { candidates: [candidate("Daniel Kahr", weak)], urls: [weak] },
      { candidates: [candidate("Clara Meyer", strong)], urls: [strong] },
    ]);
    const result = await searchExternalFreelancers(
      { brief, safetyIdentifier: SAFETY_IDENTIFIER },
      { responsesClient: { parse } },
    );
    expect(parse).toHaveBeenCalledTimes(2);
    // Runde 2 fragt anders, nicht dasselbe noch einmal.
    expect(JSON.stringify(bodies[0])).not.toBe(JSON.stringify(bodies[1]));
    // Der belegte Treffer steht vor dem unbelegten Marktplatzprofil.
    expect(result.candidates.map((entry) => entry.displayName)).toEqual([
      "Clara Meyer",
      "Daniel Kahr",
    ]);
  });

  it("summiert Token und Suchaufrufe über beide Runden", async () => {
    const weak = "https://www.freelancermap.de/profil/it-support";
    const { parse } = clientReturning([{ candidates: [candidate("Daniel Kahr", weak)], urls: [weak] }]);
    const result = await searchExternalFreelancers(
      { brief, safetyIdentifier: SAFETY_IDENTIFIER },
      { responsesClient: { parse } },
    );
    expect(parse).toHaveBeenCalledTimes(2);
    expect(result.provider?.inputTokens).toBe(2_000);
    expect(result.provider?.outputTokens).toBe(400);
    expect(result.searchTrace.toolCallCount).toBe(2);
  });

  it("entdoppelt ein Profil, das in beiden Runden auftaucht", async () => {
    const same = "https://www.freelancermap.de/profil/it-support";
    const { parse } = clientReturning([{ candidates: [candidate("Daniel Kahr", same)], urls: [same] }]);
    const result = await searchExternalFreelancers(
      { brief, safetyIdentifier: SAFETY_IDENTIFIER },
      { responsesClient: { parse } },
    );
    expect(result.candidates).toHaveLength(1);
  });
});
