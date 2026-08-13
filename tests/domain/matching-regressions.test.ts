import { describe, expect, it } from "vitest";

import {
  applyBriefPatch,
  buildShortlist,
  evaluateProfile,
  parseFallbackBrief,
} from "../../lib/domain";
import { profileFixtures } from "./fixtures";

const now = new Date("2026-08-06T12:00:00.000Z");
const base = profileFixtures[0]!;

/** Same profile in every respect except the field under test. */
const variant = (id: string, name: string, overrides: Partial<typeof base>) => ({
  ...base,
  id,
  displayName: name,
  ...overrides,
});

describe("regression: an unspecific request must not produce a shortlist", () => {
  it("returns no matches and asks for clarification instead of ranking alphabetically", () => {
    // A brief with neither required nor optional skills carries no evidence for
    // relevance. Ranking against it falls through every skill criterion down to
    // the display name, so the shortlist becomes "the first three profiles
    // alphabetically" while still claiming they match. For a product whose
    // value is traceable evidence, that is the worst possible failure mode.
    const brief = parseFallbackBrief("Hallo, ich brauche Hilfe.", { now });
    const unrelated = [
      variant("00000000-0000-4000-8000-0000000000a1", "Adam Gaertner", {
        role: "Gärtner",
        skillTags: [{ value: "Gartenbau", source: "verified" as const }],
      }),
      variant("00000000-0000-4000-8000-0000000000a2", "Mia Hufschmied", {
        role: "Hufschmiedin",
        skillTags: [{ value: "Hufbeschlag", source: "verified" as const }],
      }),
      variant("00000000-0000-4000-8000-0000000000a3", "Zoe Sterndeuter", {
        role: "Astrologin",
        skillTags: [{ value: "Astrologie", source: "verified" as const }],
      }),
    ];

    const shortlist = buildShortlist(brief, unrelated);

    expect(shortlist.matches).toEqual([]);
    expect(shortlist.status).toBe("needs_clarification");
    expect(shortlist.clarificationCode).toBe("no_extractable_requirement");
  });

  it("still ranks normally as soon as a single optional skill is known", () => {
    // The clarification path must trigger on "no requirement at all", not on
    // "no *required* skill" — otherwise every soft-worded brief loses its
    // shortlist.
    const brief = applyBriefPatch(parseFallbackBrief("Ich brauche Hilfe.", { now }), {
      optionalSkills: ["React"],
    });

    const shortlist = buildShortlist(brief, [base]);

    expect(shortlist.status).toBe("ranked");
    expect(shortlist.clarificationCode).toBeNull();
    expect(shortlist.matches).toHaveLength(1);
  });
});

describe("regression: a documented profile must not lose to an undocumented one", () => {
  // The rejections below used to depend on whether the profile happened to
  // carry data in the field at all. A profile that filled the field in and did
  // not match was rejected; a profile that left it empty passed as a "gap".
  // That systematically punishes the best-documented freelancers.
  //
  // The invariant each test pins down is EQUAL TREATMENT. The concrete outcome
  // is a per-field policy (see UNMET_HARD_REQUIREMENT) and is asserted second,
  // so a deliberate policy change reads as a one-line diff rather than as a
  // broken invariant.

  it("contractual requirements: hard requirement is a gap for both, documented or not", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("React Entwickler gesucht.\nMuss zwingend: NDA unterzeichnen.", { now }),
      { requiredSkills: ["React"], contractualRequirements: ["NDA"] },
    );
    const documented = variant("00000000-0000-4000-8000-0000000000b1", "Bea Dokumentiert", {
      contractualCapabilities: [{ value: "Werkvertrag", source: "verified" as const }],
    });
    const sparse = variant("00000000-0000-4000-8000-0000000000b2", "Sam Sparsam", {
      contractualCapabilities: [],
    });

    const documentedResult = evaluateProfile(brief, documented);
    const sparseResult = evaluateProfile(brief, sparse);

    // Policy: gap, because `contractual_capabilities` has no source column and
    // is empty on every production row. Rejecting would empty every shortlist
    // that states a contractual must-have.
    expect(documentedResult.eligible).toBe(sparseResult.eligible);
    expect(documentedResult.eligible).toBe(true);
    expect(documentedResult.knownGaps.some((gap) => gap.includes("NDA"))).toBe(true);
  });

  it("language: hard requirement rejects both, documented or not", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("React Entwickler.\nMuss zwingend: Deutsch sprechen.", { now }),
      { requiredSkills: ["React"], language: "German" },
    );
    const documented = variant("00000000-0000-4000-8000-0000000000b3", "Bea Dokumentiert", {
      languages: [{ value: "Spanish", source: "verified" as const }],
    });
    const sparse = variant("00000000-0000-4000-8000-0000000000b4", "Sam Sparsam", {
      languages: [],
    });

    const documentedResult = evaluateProfile(brief, documented);
    const sparseResult = evaluateProfile(brief, sparse);

    // Policy: reject. Languages are collected and populated on every production
    // row, so an explicit must-have mismatch is a real knockout, not a gap.
    expect(documentedResult.eligible).toBe(sparseResult.eligible);
    expect(documentedResult.eligible).toBe(false);
  });

  it("location: hard requirement rejects both, documented or not", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("React Entwickler.\nMuss zwingend: vor Ort in Hamburg.", { now }),
      { requiredSkills: ["React"], location: "Hamburg", workMode: "on_site" },
    );
    const documented = variant("00000000-0000-4000-8000-0000000000b5", "Bea Dokumentiert", {
      location: { value: "Berlin, Germany", source: "verified" as const },
      workModes: ["on_site" as const],
    });
    const sparse = variant("00000000-0000-4000-8000-0000000000b6", "Sam Sparsam", {
      location: null,
      workModes: ["on_site" as const],
    });

    const documentedResult = evaluateProfile(brief, documented);
    const sparseResult = evaluateProfile(brief, sparse);

    // Policy: reject. location_text is populated on every production row.
    expect(documentedResult.eligible).toBe(sparseResult.eligible);
    expect(documentedResult.eligible).toBe(false);
  });
});

describe("regression: a hard requirement must be recognised in either language", () => {
  // requirementStrength recognised only German and English as language terms.
  // A hard French requirement written as "Französisch" was therefore not
  // detected as hard at all.
  //
  // Since an unmet language requirement is a gap rather than a rejection, this
  // is not visible in `eligible` — it is visible in whether the gap is marked
  // as a must-have. That marking is what a caller, the ranking weights and the
  // rerank stage all depend on, so that is what these tests pin down.

  const hardFrench = () =>
    applyBriefPatch(
      parseFallbackBrief("React Entwickler.\nMuss zwingend: Französisch sprechen.", { now }),
      { requiredSkills: ["React"], language: "French" },
    );
  const softFrench = () =>
    applyBriefPatch(
      parseFallbackBrief("React Entwickler.\nNice to have: Französisch sprechen.", { now }),
      { requiredSkills: ["React"], language: "French" },
    );

  const evaluateWith = (
    brief: ReturnType<typeof hardFrench>,
    languages: typeof base.languages,
  ) =>
    evaluateProfile(
      brief,
      variant("00000000-0000-4000-8000-0000000000c1", "Kandidat", { languages }),
    );

  const germanOnly = [{ value: "German", source: "verified" as const }];
  const speaksFrench = [{ value: "French", source: "verified" as const }];

  it("rejects on a hard French requirement written in German prose", () => {
    // Before the fix `Französisch` was not recognised as referring to `French`,
    // the requirement was scored neutral, and the profile stayed eligible with
    // nothing but a soft gap to show for it.
    const result = evaluateWith(hardFrench(), germanOnly);

    expect(result.eligible).toBe(false);
    expect(result.rejectionReasons.some((reason) => reason.includes("French"))).toBe(true);
  });

  it("leaves a soft French requirement a gap", () => {
    const result = evaluateWith(softFrench(), germanOnly);

    expect(result.eligible).toBe(true);
    expect(result.knownGaps.some((gap) => gap.includes("French"))).toBe(true);
  });

  it("treats documented and undocumented profiles the same way", () => {
    expect(evaluateWith(hardFrench(), germanOnly).eligible).toBe(
      evaluateWith(hardFrench(), []).eligible,
    );
  });

  it("recognises the umlaut-free spelling German keyboards produce", () => {
    // `searchText` folds "ö" to "o" but leaves the "oe" transliteration alone,
    // so "Franzoesisch" and "Französisch" do not normalise to the same string.
    const brief = applyBriefPatch(
      parseFallbackBrief("React Entwickler.\nMuss zwingend: Franzoesisch sprechen.", { now }),
      { requiredSkills: ["React"], language: "French" },
    );

    expect(evaluateWith(brief, germanOnly).eligible).toBe(false);
  });

  it("raises nothing when the language is actually covered", () => {
    const result = evaluateWith(hardFrench(), speaksFrench);

    expect(result.eligible).toBe(true);
    expect(result.knownGaps.some((gap) => gap.includes("French"))).toBe(false);
  });
});

describe("regression: German skill terms reach the same families as English ones", () => {
  // The skill families carried no German aliases, so a brief extracted in
  // German matched almost nothing: measured on the 65-row production export,
  // the reference posting went from 18 eligible profiles in English to 2 in
  // German, and ranked a QA test manager first.
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ["Anforderungsmanagement", "requirements management"],
    ["Anforderungsanalyse", "requirements analysis"],
    ["Geschäftsprozessanalyse", "process analysis"],
    ["Prozessoptimierung", "process optimization"],
    ["Projektmanagement", "project management"],
    ["Informationssicherheit", "information security"],
  ];

  for (const [german, english] of pairs) {
    it(`treats "${german}" as "${english}"`, () => {
      const profile = variant("00000000-0000-4000-8000-0000000000d1", "Kandidat", {
        skillTags: [{ value: english, source: "self_reported" as const }],
      });
      const briefFor = (skill: string) =>
        applyBriefPatch(parseFallbackBrief(`${skill} gesucht, remote.`, { now }), {
          requiredSkills: [skill],
          workMode: "remote",
        });

      expect(evaluateProfile(briefFor(german), profile).coreSkillMatches).toEqual([german]);
      expect(evaluateProfile(briefFor(english), profile).coreSkillMatches).toEqual([english]);
    });
  }
});
