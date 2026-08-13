import { readFileSync, writeFileSync } from "node:fs";

import { buildShortlist, evaluateProfile } from "../../lib/domain";
import { type GoldenCase, goldenCases } from "./cases";
import { goldenProfileName, goldenProfiles } from "./pool";

const EXPECTED_PATH = new URL("./expected.json", import.meta.url);

export type ExpectedShortlists = Record<string, string[]>;

export const readExpected = (): ExpectedShortlists => {
  try {
    return JSON.parse(readFileSync(EXPECTED_PATH, "utf8")) as ExpectedShortlists;
  } catch {
    return {};
  }
};

export const writeExpected = (value: ExpectedShortlists): void => {
  writeFileSync(EXPECTED_PATH, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const isSnapshotRun = (): boolean =>
  process.env.GOLDEN_SNAPSHOT === "1" || process.env.GOLDEN_SNAPSHOT === "true";

export const actualShortlist = (goldenCase: GoldenCase): string[] =>
  buildShortlist(goldenCase.brief, goldenProfiles).matches.map((match) => match.profile.id);

/**
 * Renders a mismatch so the failure says what changed, not just that something
 * did. Includes the rejection reasons for profiles that were expected but did
 * not survive eligibility — that is almost always the actual cause.
 */
export const explainMismatch = (
  goldenCase: GoldenCase,
  expected: readonly string[],
  actual: readonly string[],
): string => {
  const lines: string[] = [
    `case: ${goldenCase.id}`,
    `note: ${goldenCase.note}`,
    ...(goldenCase.knownDefect
      ? [
          `NOTE: the recorded baseline for this case is known to be wrong (${goldenCase.knownDefect}).`,
          "If your change fixes it, re-baseline with GOLDEN_SNAPSHOT=1 and drop the knownDefect marker.",
        ]
      : []),
    `expected: [${expected.map(goldenProfileName).join(", ") || "—"}]`,
    `actual:   [${actual.map(goldenProfileName).join(", ") || "—"}]`,
  ];

  // A shortlist that short-circuited on clarification never ranked anything, so
  // per-profile eligibility below would be misleading on its own.
  const shortlist = buildShortlist(goldenCase.brief, goldenProfiles);
  if (shortlist.status !== "ranked") {
    lines.push(
      `  the shortlist did not rank at all: status=${shortlist.status} code=${shortlist.clarificationCode}`,
    );
    return lines.join("\n");
  }

  const missing = expected.filter((id) => !actual.includes(id));
  for (const id of missing) {
    const profile = goldenProfiles.find((candidate) => candidate.id === id);
    if (!profile) {
      lines.push(`  ${id}: not in the pool at all`);
      continue;
    }
    const evaluation = evaluateProfile(goldenCase.brief, profile);
    lines.push(
      `  missing ${profile.displayName}: ${
        evaluation.eligible
          ? "eligible but ranked out of the top 3"
          : `rejected — ${evaluation.rejectionReasons.join(" | ")}`
      }`,
    );
  }

  const added = actual.filter((id) => !expected.includes(id));
  for (const id of added) {
    lines.push(`  unexpected ${goldenProfileName(id)}`);
  }

  return lines.join("\n");
};

/** Recomputes every expectation. Used by the GOLDEN_SNAPSHOT re-baseline path. */
export const snapshotAll = (): ExpectedShortlists =>
  Object.fromEntries(goldenCases.map((goldenCase) => [goldenCase.id, actualShortlist(goldenCase)]));
