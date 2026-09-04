import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseFallbackBrief } from "@/lib/domain";
import {
  estimateExternalSearchTokenCeiling,
  extractSearchEvidence,
  candidatePreferenceRank,
  isDirectBookingUrl,
  isMarketplaceUrl,
  reconcileExternalCandidates,
  searchExternalFreelancers,
  urlMatchesCandidateIdentity,
  type ExternalSearchResponsesClient,
} from "@/lib/openai/external-freelancer-search";

const FIXED_NOW = new Date("2026-08-12T10:00:00.000Z");
const SAFETY_IDENTIFIER = "usr_4e8a57f0b51c";
const brief = parseFallbackBrief(
  "React und TypeScript erforderlich, deutsch, remote.",
  { now: FIXED_NOW },
);

function webOutput(urls: string[]) {
  return [
    {
      type: "web_search_call",
      action: {
        type: "search",
        queries: ["React freelancer direct booking"],
        sources: urls.map((url) => ({ type: "url", url })),
      },
      status: "completed",
    },
  ];
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Anna Beispiel",
    role: "React Freelancer",
    summary: "Öffentlich beschriebenes React-Profil.",
    matchedRequirements: ["React"],
    knownGaps: ["Verfügbarkeit nicht bestätigt"],
    profileUrl: "https://portfolio.example/anna-beispiel",
    bookingUrl: "https://calendly.com/annabeispiel/30min",
    linkedinUrl: null,
    websiteUrl: null,
    portfolioUrl: null,
    contactEmail: null,
    skills: [],
    activities: [],
    projects: [],
    sourceUrls: [
      "https://portfolio.example/anna-beispiel",
      "https://calendly.com/annabeispiel/30min",
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("external freelancer web search", () => {
  it("uses web_search, store=false, source inclusion and structured output", async () => {
    const parse = vi.fn<ExternalSearchResponsesClient["parse"]>().mockResolvedValue({
      id: "resp_web_1",
      model: "gpt-5.4-nano-2026-03-17",
      output_parsed: { candidates: [candidate()] },
      output: webOutput([
        "https://portfolio.example/anna-beispiel",
        "https://calendly.com/annabeispiel/30min",
      ]),
      usage: {
        input_tokens: 120,
        input_tokens_details: { cached_tokens: 20 },
        output_tokens: 80,
        total_tokens: 200,
      },
    });
    const result = await searchExternalFreelancers(
      { brief, safetyIdentifier: SAFETY_IDENTIFIER },
      { responsesClient: { parse } },
    );

    expect(result.mode).toBe("openai");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.verificationStatus).toBe(
      "external_unverified",
    );
    const [body, requestOptions] = parse.mock.calls[0]!;
    expect(body.store).toBe(false);
    expect(body.tools).toContainEqual(
      expect.objectContaining({ type: "web_search" }),
    );
    expect(body.tool_choice).toBe("required");
    expect(body.include).toContain("web_search_call.action.sources");
    expect(body.text?.format?.type).toBe("json_schema");
    expect(body.safety_identifier).toBe(SAFETY_IDENTIFIER);
    expect(requestOptions).toMatchObject({ maxRetries: 0, timeout: 30_000 });
    expect(body.reasoning).toEqual({ effort: "none" });
    expect((body as typeof body & { max_tool_calls?: number }).max_tool_calls).toBe(5);
    // Die Anfragen stehen im Auftrag, damit das Modell sie nicht selbst erfindet.
    const prompt = JSON.stringify(body.input);
    expect(prompt).toContain("site:linkedin.com/in");
    expect(prompt).toContain("-stellenangebot");
  });

  it("drops an invented booking URL but keeps the evidenced candidate", () => {
    const reconciled = reconcileExternalCandidates(
      { candidates: [candidate()] },
      webOutput(["https://portfolio.example/anna-beispiel"]),
    );

    expect(reconciled.evidence.urls).not.toContain(
      "https://calendly.com/annabeispiel/30min",
    );
    expect(reconciled.candidates).toHaveLength(1);
    expect(reconciled.candidates[0]?.bookingUrl).toBeNull();
  });

  it("rejects the whole candidate when the profile URL itself is invented", () => {
    const reconciled = reconcileExternalCandidates(
      { candidates: [candidate()] },
      webOutput(["https://calendly.com/annabeispiel/30min"]),
    );

    expect(reconciled.candidates).toEqual([]);
  });

  it("drops a contact page that the model called a booking link", () => {
    const contact = "https://portfolio.example/anna-beispiel/contact";
    const reconciled = reconcileExternalCandidates(
      {
        candidates: [
          candidate({ bookingUrl: contact, sourceUrls: [
            "https://portfolio.example/anna-beispiel",
            contact,
          ] }),
        ],
      },
      webOutput(["https://portfolio.example/anna-beispiel", contact]),
    );

    expect(isDirectBookingUrl(contact)).toBe(false);
    expect(reconciled.candidates).toHaveLength(1);
    expect(reconciled.candidates[0]?.bookingUrl).toBeNull();
  });

  it("drops a booking URL that belongs to another person", () => {
    const annaProfile = "https://portfolio.example/anna-beispiel";
    const bobBooking = "https://calendly.com/bob-smith/30min";
    const reconciled = reconcileExternalCandidates(
      {
        candidates: [
          candidate({
            profileUrl: annaProfile,
            bookingUrl: bobBooking,
            sourceUrls: [annaProfile, bobBooking],
          }),
        ],
      },
      webOutput([annaProfile, bobBooking]),
    );

    expect(reconciled.evidence.urls).toContain(bobBooking);
    expect(reconciled.candidates).toHaveLength(1);
    expect(reconciled.candidates[0]?.bookingUrl).toBeNull();
  });

  it("keeps only the researched links the search actually opened", () => {
    const profileUrl = "https://portfolio.example/anna-beispiel";
    const linkedin = "https://www.linkedin.com/in/anna-beispiel";
    const website = "https://anna-codes.example";
    const reconciled = reconcileExternalCandidates(
      {
        candidates: [
          candidate({
            profileUrl,
            bookingUrl: null,
            linkedinUrl: linkedin,
            websiteUrl: website,
            portfolioUrl: "https://erfunden.example/nie-geoeffnet",
            skills: ["React", "React", " PostgreSQL "],
            activities: ["Frontend-Architektur"],
            projects: ["Relaunch eines Shops"],
            sourceUrls: [profileUrl, linkedin, website],
          }),
        ],
      },
      webOutput([profileUrl, linkedin, website]),
    );

    const found = reconciled.candidates[0];
    expect(found?.linkedinUrl).toBe(linkedin);
    // Die Kanonisierung behält den Schrägstrich am Wurzelpfad.
    expect(found?.websiteUrl).toBe(`${website}/`);
    expect(found?.portfolioUrl).toBeNull();
    // Doppelte und ungetrimmte Einträge werden normalisiert, nicht übernommen.
    expect(found?.skills).toEqual(["React", "PostgreSQL"]);
    expect(found?.activities).toEqual(["Frontend-Architektur"]);
    expect(found?.projects).toEqual(["Relaunch eines Shops"]);
  });

  it("drops a LinkedIn URL that carries someone else's name", () => {
    const profileUrl = "https://portfolio.example/anna-beispiel";
    const foreign = "https://www.linkedin.com/in/bob-smith";
    const reconciled = reconcileExternalCandidates(
      {
        candidates: [
          candidate({
            profileUrl,
            bookingUrl: null,
            linkedinUrl: foreign,
            sourceUrls: [profileUrl, foreign],
          }),
        ],
      },
      webOutput([profileUrl, foreign]),
    );

    expect(reconciled.candidates[0]?.linkedinUrl).toBeNull();
  });

  it("accepts hyphenated and compact forms of the candidate's full name", () => {
    const profileUrl = "https://portfolio.example/anna-beispiel";
    const bookingUrl = "https://cal.com/annabeispiel/intro";
    const reconciled = reconcileExternalCandidates(
      {
        candidates: [
          candidate({ profileUrl, bookingUrl, sourceUrls: [profileUrl, bookingUrl] }),
        ],
      },
      webOutput([profileUrl, bookingUrl]),
    );

    expect(reconciled.candidates).toHaveLength(1);
    expect(reconciled.candidates[0]).toMatchObject({ profileUrl, bookingUrl });
  });

  it("returns at most three unique evidenced booking results", () => {
    const profileUrls = [1, 2, 3, 4].map(
      (index) => `https://portfolio.example/person-${index}`,
    );
    const bookingUrls = [1, 2, 3, 4].map(
      (index) => `https://cal.com/person-${index}/intro`,
    );
    const candidates = profileUrls.map((profileUrl, index) =>
      candidate({
        displayName: `Person ${index + 1}`,
        profileUrl,
        bookingUrl: bookingUrls[index],
        sourceUrls: [profileUrl, bookingUrls[index]],
      }),
    );
    const reconciled = reconcileExternalCandidates(
      { candidates: candidates.slice(0, 3) },
      webOutput([...profileUrls, ...bookingUrls]),
    );

    expect(reconciled.candidates).toHaveLength(3);
  });

  it("does not call the provider after quota denial", async () => {
    const parse = vi.fn<ExternalSearchResponsesClient["parse"]>();
    const result = await searchExternalFreelancers(
      {
        brief,
        safetyIdentifier: SAFETY_IDENTIFIER,
        allowProvider: false,
      },
      { responsesClient: { parse } },
    );

    expect(parse).not.toHaveBeenCalled();
    expect(result.fallbackReason).toBe("budget_denied");
    expect(result.providerAttempted).toBe(false);
  });

  it("requires a server key when no injected client is supplied", async () => {
    const result = await searchExternalFreelancers(
      { brief, safetyIdentifier: SAFETY_IDENTIFIER },
      { apiKey: null },
    );

    expect(result.fallbackReason).toBe("provider_unavailable");
    expect(result.providerAttempted).toBe(false);
  });

  it("extracts only HTTPS evidence and provides a bounded quota estimate", () => {
    const evidence = extractSearchEvidence(
      webOutput([
        "https://valid.example/profile",
        "http://insecure.example/profile",
      ]),
    );
    const estimate = estimateExternalSearchTokenCeiling({ brief });

    expect([...evidence.urls]).toEqual(["https://valid.example/profile"]);
    expect(evidence.queries).toEqual(["React freelancer direct booking"]);
    expect(estimate.inputTokens).toBeGreaterThan(0);
    expect(estimate.totalTokens).toBe(
      estimate.inputTokens + estimate.outputTokens,
    );
  });
});

describe("Rangfolge der Quellen", () => {
  const base = {
    profileUrl: "https://www.fiverr.com/annabeispiel/react",
    linkedinUrl: null,
    websiteUrl: null,
    portfolioUrl: null,
    contactEmail: null,
  };

  it("stuft eine eigene Website am höchsten ein", () => {
    expect(
      candidatePreferenceRank({ ...base, websiteUrl: "https://anna-beispiel.de" }),
    ).toBe(0);
  });

  it("wertet eine Marktplatz-Website nicht als eigene Seite", () => {
    expect(
      candidatePreferenceRank({ ...base, websiteUrl: "https://www.malt.de/profile/anna" }),
    ).toBe(3);
  });

  it("stuft LinkedIn über eine Marktplatz-Anzeige", () => {
    expect(
      candidatePreferenceRank({
        ...base,
        linkedinUrl: "https://www.linkedin.com/in/anna-beispiel",
      }),
    ).toBe(1);
  });

  it("erkennt ein Netzwerkprofil auch ohne separaten LinkedIn-Link", () => {
    expect(
      candidatePreferenceRank({
        ...base,
        profileUrl: "https://github.com/anna-beispiel",
      }),
    ).toBe(1);
  });

  it("stuft eine neutrale Seite über eine Marktplatz-Anzeige", () => {
    expect(
      candidatePreferenceRank({ ...base, profileUrl: "https://agentur.example/team/anna" }),
    ).toBe(2);
    expect(candidatePreferenceRank(base)).toBe(3);
  });

  it("erkennt Marktplätze auch auf Subdomains", () => {
    expect(isMarketplaceUrl("https://de.fiverr.com/anna/react")).toBe(true);
    expect(isMarketplaceUrl("https://anna-beispiel.de/react")).toBe(false);
  });

  it("sortiert eigene Seiten vor Marktplatz-Treffern", () => {
    const marketplace = "https://www.fiverr.com/bob-schmidt/react";
    const ownProfile = "https://anna-beispiel.de/ueber-mich";
    const ownSite = "https://anna-beispiel.de";
    const reconciled = reconcileExternalCandidates(
      {
        candidates: [
          candidate({
            displayName: "Bob Schmidt",
            profileUrl: marketplace,
            bookingUrl: null,
            sourceUrls: [marketplace],
          }),
          candidate({
            displayName: "Anna Beispiel",
            profileUrl: ownProfile,
            bookingUrl: null,
            websiteUrl: ownSite,
            sourceUrls: [ownProfile, ownSite],
          }),
        ],
      },
      webOutput([marketplace, ownProfile, ownSite]),
    );

    expect(reconciled.candidates.map((entry) => entry.displayName)).toEqual([
      "Anna Beispiel",
      "Bob Schmidt",
    ]);
  });
});

describe("Namensprüfung bei Netzwerkprofilen", () => {
  it("akzeptiert eine angehängte Kennung, wie Xing und LinkedIn sie vergeben", () => {
    expect(
      urlMatchesCandidateIdentity(
        "https://www.xing.com/profile/Marcel_Kowalski7",
        "Marcel Kowalski",
      ),
    ).toBe(true);
    expect(
      urlMatchesCandidateIdentity(
        "https://www.linkedin.com/in/anna-beispiel-1234",
        "Anna Beispiel",
      ),
    ).toBe(true);
  });

  it("akzeptiert die Kennung auch als eigenen Pfadbestandteil", () => {
    expect(
      urlMatchesCandidateIdentity(
        "https://www.linkedin.com/in/anna-beispiel-1a2b3c4",
        "Anna Beispiel",
      ),
    ).toBe(true);
  });

  it("lässt sich nicht auf einen anderen Namen ausdehnen", () => {
    expect(
      urlMatchesCandidateIdentity(
        "https://www.xing.com/profile/Marcel_Kowalskimann",
        "Marcel Kowalski",
      ),
    ).toBe(false);
    expect(
      urlMatchesCandidateIdentity(
        "https://www.xing.com/profile/Marcel7_Kowalski",
        "Marcel Kowalski",
      ),
    ).toBe(false);
  });

  it("akzeptiert weiterhin die kompakte Schreibweise mit Kennung", () => {
    expect(
      urlMatchesCandidateIdentity(
        "https://cal.com/annabeispiel2/intro",
        "Anna Beispiel",
      ),
    ).toBe(true);
  });
});

describe("Name aus der Adresse belegt", () => {
  it("behält einen Marktplatz-Treffer, kennzeichnet den Namen aber als unbelegt", () => {
    const profileUrl = "https://www.freelancermap.de/profil/freelance-it-support";
    const reconciled = reconcileExternalCandidates(
      {
        candidates: [
          candidate({
            displayName: "Daniel Kahr",
            profileUrl,
            bookingUrl: null,
            sourceUrls: [profileUrl],
          }),
        ],
      },
      webOutput([profileUrl]),
    );

    expect(reconciled.candidates).toHaveLength(1);
    expect(reconciled.candidates[0]?.nameVerified).toBe(false);
  });

  it("markiert einen Namen als belegt, wenn er in der Adresse steht", () => {
    const profileUrl = "https://www.xing.com/profile/Anna_Beispiel3";
    const reconciled = reconcileExternalCandidates(
      { candidates: [candidate({ profileUrl, bookingUrl: null, sourceUrls: [profileUrl] })] },
      webOutput([profileUrl]),
    );

    expect(reconciled.candidates[0]?.nameVerified).toBe(true);
  });

  it("sortiert belegte Namen vor unbelegten bei gleichem Rang", () => {
    const unverified = "https://www.xing.com/profile/it-support-spezialist";
    const verified = "https://www.xing.com/profile/Bob_Schmidt";
    const reconciled = reconcileExternalCandidates(
      {
        candidates: [
          candidate({ displayName: "Anna Beispiel", profileUrl: unverified, bookingUrl: null, sourceUrls: [unverified] }),
          candidate({ displayName: "Bob Schmidt", profileUrl: verified, bookingUrl: null, sourceUrls: [verified] }),
        ],
      },
      webOutput([unverified, verified]),
    );

    expect(reconciled.candidates.map((c) => c.displayName)).toEqual([
      "Bob Schmidt",
      "Anna Beispiel",
    ]);
  });
});
