import { beforeAll, describe, expect, it } from "vitest";

import { goldenCases } from "./cases";
import {
  actualShortlist,
  explainMismatch,
  isSnapshotRun,
  readExpected,
  snapshotAll,
  writeExpected,
} from "./runner";

/**
 * Golden set. Runs every case against a fixed synthetic profile pool and
 * compares the resulting shortlist to the recorded baseline.
 *
 * Re-baseline after a deliberate behaviour change:
 *   GOLDEN_SNAPSHOT=1 npx vitest run tests/golden
 * and commit the resulting expected.json in the same PR as the change, so the
 * diff shows what the change did to real shortlists.
 */
describe("golden set", () => {
  beforeAll(() => {
    if (isSnapshotRun()) writeExpected(snapshotAll());
  });

  const expected = () => readExpected();

  it("has an expectation recorded for every case", () => {
    const recorded = expected();
    const missing = goldenCases.filter((goldenCase) => !(goldenCase.id in recorded));
    expect(
      missing.map((goldenCase) => goldenCase.id),
      "cases without a baseline — run GOLDEN_SNAPSHOT=1 npx vitest run tests/golden",
    ).toEqual([]);
  });

  it("has no stale expectations for removed cases", () => {
    const ids = new Set(goldenCases.map((goldenCase) => goldenCase.id));
    expect(Object.keys(expected()).filter((id) => !ids.has(id))).toEqual([]);
  });

  for (const goldenCase of goldenCases) {
    it(`matches the recorded shortlist: ${goldenCase.id}`, () => {
      const recorded = expected()[goldenCase.id] ?? [];
      const actual = actualShortlist(goldenCase);
      expect(actual, explainMismatch(goldenCase, recorded, actual)).toEqual(recorded);
    });
  }

  /**
   * Was a known defect until the ordering rule stopped comparing raw strings.
   * Promoted from `it.fails` to a normal assertion the moment it started
   * passing, which is what the `it.fails` marker existed to force.
   */
  it("the German and the English variant of the reference posting agree", () => {
    const de = actualShortlist(goldenCases.find((c) => c.id === "business-engineer-de")!);
    const en = actualShortlist(goldenCases.find((c) => c.id === "business-engineer-en")!);
    expect(
      de,
      "The same posting must produce the same shortlist regardless of whether the extraction " +
        "emitted German or English skill terms. A divergence here is the skill-family language " +
        "dependency, not a ranking problem.",
    ).toEqual(en);
  });
});
