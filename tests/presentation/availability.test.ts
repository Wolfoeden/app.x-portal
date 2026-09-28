import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_CONFIRMED_REASON,
  AVAILABILITY_FRESH_DAYS,
  availabilityNotice,
} from "@/components/chat/availability";
import { automationBrief, automationProfiles } from "@/components/chat/preview-fixtures";
import { profilePresentation } from "@/components/chat/profile-presentation";
import { evaluateProfile, parseFallbackBrief } from "@/lib/domain";

import { profileFixtures } from "../domain/fixtures";

const NOW = new Date("2026-09-28T10:00:00.000Z");

describe("availability with its date", () => {
  it("dates a recent statement instead of calling it current", () => {
    expect(availabilityNotice("available", "2026-09-21T08:00:00.000Z", NOW)).toEqual({
      label: "Verfügbar · Stand 21.09.",
      tone: "available",
      title: "Angabe vom 21.09.2026",
      reason: "Als verfügbar angegeben am 21.09.2026.",
      openPoint: null,
    });
  });

  // Am 28.09.2026 stammte die Angabe bei 56 von 68 aktiven Profilen aus der
  // Zeit vor dem 14.08. Sie ist kein Nein, aber auch keine Zusage mehr.
  it(`marks a statement older than ${AVAILABILITY_FRESH_DAYS} days as one to confirm`, () => {
    const notice = availabilityNotice("available", "2026-08-08T12:00:00.000Z", NOW);

    expect(notice.label).toBe("Verfügbar · Stand 08.08.");
    expect(notice.tone).toBe("stale");
    expect(notice.reason).toBeNull();
    expect(notice.openPoint).toBe(
      "Verfügbarkeit zuletzt am 08.08.2026 angegeben; im Erstgespräch bestätigen lassen.",
    );
  });

  it("keeps the day that is exactly at the limit fresh", () => {
    const limit = new Date(NOW.getTime() - AVAILABILITY_FRESH_DAYS * 24 * 60 * 60 * 1000);

    expect(availabilityNotice("available", limit.toISOString(), NOW).tone).toBe("available");
  });

  it("names the year once the statement is from another year", () => {
    expect(availabilityNotice("limited", "2025-12-15T12:00:00.000Z", NOW).label).toBe(
      "Begrenzt verfügbar · Stand 15.12.2025",
    );
  });

  it("does not ask to confirm an old 'not available'", () => {
    const notice = availabilityNotice("unavailable", "2026-06-01T12:00:00.000Z", NOW);

    expect(notice.tone).toBe("unavailable");
    expect(notice.openPoint).toBeNull();
  });

  it("gives an open availability no date and stays cautious without one", () => {
    expect(availabilityNotice("unknown", "2026-09-21T08:00:00.000Z", NOW).label).toBe("Verfügbarkeit offen");
    expect(availabilityNotice("available", null, NOW)).toMatchObject({
      label: "Grundsätzlich verfügbar",
      reason: AVAILABILITY_CONFIRMED_REASON,
    });
    expect(availabilityNotice("available", "kein Datum", NOW).label).toBe("Grundsätzlich verfügbar");
  });
});

describe("availability on the profile card", () => {
  const [strategist] = automationProfiles;
  const withAvailability = (updatedAt: string) => ({
    ...strategist,
    availabilityStatus: "available" as const,
    availabilityUpdatedAt: updatedAt,
    matchReasons: ["Rolle passt: KI-Beraterin.", AVAILABILITY_CONFIRMED_REASON],
    knownGaps: [],
  });

  it("replaces the undated claim among the reasons with the dated one", () => {
    const result = profilePresentation(withAvailability("2026-09-21T08:00:00.000Z"), automationBrief, NOW);

    expect(result.reasons).toEqual([
      "Rolle passt: KI-Beraterin.",
      "Als verfügbar angegeben am 21.09.2026.",
    ]);
    expect(result.openPoints).toEqual([]);
  });

  it("moves an old statement from the reasons to the points for the first call", () => {
    const result = profilePresentation(withAvailability("2026-08-08T12:00:00.000Z"), automationBrief, NOW);

    expect(result.reasons).toEqual(["Rolle passt: KI-Beraterin."]);
    expect(result.openPoints).toEqual([
      "Verfügbarkeit zuletzt am 08.08.2026 angegeben; im Erstgespräch bestätigen lassen.",
    ]);
  });

  // Die Karte ersetzt den Satz wortgleich. Ändert das Matching ihn, muss die
  // Karte mitziehen — sonst stünde „aktuell bestätigt“ wieder ohne Datum da.
  it("matches the exact wording the matcher gives an available profile", () => {
    const brief = parseFallbackBrief("React freelancer, remote", { now: NOW });
    const evaluation = evaluateProfile(brief, profileFixtures[0]!);

    expect(profileFixtures[0]!.availability.status).toBe("available");
    expect(evaluation.matchReasons).toContain(AVAILABILITY_CONFIRMED_REASON);
  });
});
