import { describe, expect, it } from "vitest";

import {
  buildShortlist,
  evaluateProfile,
  parseFallbackBrief,
  type FreelancerProfile,
} from "../../lib/domain";
import { profileFixtures } from "./fixtures";

const now = new Date("2026-08-06T12:00:00.000Z");

/**
 * Regression suite for operator feedback, 20 August 2026:
 * "Dieselbe Person war bei knapper Anfrage 96 % Hauptvorschlag, bei
 * detaillierter nicht empfohlen."
 *
 * A stated project condition the catalogue had no data for used to score as a
 * partial miss (4_000) instead of dropping out of the weighted average, so
 * every extra sentence a client wrote cost the same candidate points.
 */

const SPARSE = "React Entwickler gesucht, remote.";
const DETAILED = "React Entwickler gesucht, remote. Budget bis 20000 EUR.";

/** Well qualified, but never published a minimum project budget. */
const silent: FreelancerProfile = {
  ...profileFixtures[0]!,
  minimumProjectBudget: null,
};

function score(request: string, profile: FreelancerProfile): number {
  return evaluateProfile(parseFallbackBrief(request, { now }), profile)
    .scoreBreakdown.fitScoreBasisPoints;
}

describe("stating more conditions must not lower a candidate's score", () => {
  it("scores the same candidate identically on a sparse and a detailed request", () => {
    expect(score(DETAILED, silent)).toBe(score(SPARSE, silent));
  });

  it("drops an unanswerable budget out of the average instead of scoring it 40%", () => {
    const evaluation = evaluateProfile(
      parseFallbackBrief(DETAILED, { now }),
      silent,
    );

    expect(evaluation.scoreBreakdown.commercialFitBasisPoints).toBeNull();
  });

  it("surfaces the unanswered condition as a gap rather than hiding it", () => {
    // Silence must stop costing points without becoming invisible — the
    // reviewer still has to see what remains to be clarified.
    const evaluation = evaluateProfile(
      parseFallbackBrief(DETAILED, { now }),
      silent,
    );

    expect(evaluation.knownGaps.join(" ")).toContain("Mindestprojektbudget");
  });

  it("still rewards a profile that confirms the stated budget", () => {
    const documented: FreelancerProfile = {
      ...profileFixtures[0]!,
      minimumProjectBudget: { amount: 3_000, currency: "EUR" },
    };
    const evaluation = evaluateProfile(
      parseFallbackBrief(DETAILED, { now }),
      documented,
    );

    expect(evaluation.scoreBreakdown.commercialFitBasisPoints).toBe(10_000);
  });

  it("does not let extra conditions push a candidate out of the recommendations", () => {
    const pool = [silent, ...profileFixtures.slice(1)];
    const names = (request: string) =>
      buildShortlist(parseFallbackBrief(request, { now }), pool).matches.map(
        (match) => match.profile.displayName,
      );

    expect(names(SPARSE)).toContain(silent.displayName);
    expect(names(DETAILED)).toContain(silent.displayName);
  });

  it("keeps a real conflict costly — silence is excused, contradiction is not", () => {
    // The guarantee is narrow on purpose: a profile whose documented rate
    // breaches the stated ceiling must still lose, otherwise the fix would
    // have swapped one wrong answer for another.
    const tooExpensive: FreelancerProfile = {
      ...profileFixtures[0]!,
      hourlyRate: { amount: 180, currency: "EUR" },
    };
    const capped = parseFallbackBrief(
      "React Entwickler gesucht, remote, maximaler Stundensatz 40 EUR.",
      { now },
    );

    expect(evaluateProfile(capped, tooExpensive).eligible).toBe(false);
  });
});
