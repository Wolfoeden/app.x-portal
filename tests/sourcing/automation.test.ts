import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isPaused,
  SOURCING_AUTOMATION_DEFAULT,
} from "@/lib/sourcing/automation";

describe("SOURCING_AUTOMATION_DEFAULT", () => {
  it("hat alles aus", () => {
    // Die Vorgabe ist die Antwort auf die Frage, was passiert, wenn niemand
    // etwas entscheidet — und dann soll nichts passieren. Auch ein Ausfall
    // der Datenbank fällt auf diesen Wert zurück.
    expect(SOURCING_AUTOMATION_DEFAULT.absorbUserSearches).toBe(false);
    expect(SOURCING_AUTOMATION_DEFAULT.resolveAddresses).toBe(false);
    expect(SOURCING_AUTOMATION_DEFAULT.autoInvite).toBe(false);
  });

  it("begrenzt die Adresssuche auch dann", () => {
    expect(SOURCING_AUTOMATION_DEFAULT.dailyAddressBudget).toBeGreaterThan(0);
    expect(SOURCING_AUTOMATION_DEFAULT.dailyAddressBudget).toBeLessThanOrEqual(500);
  });
});

describe("isPaused", () => {
  const jetzt = new Date("2026-09-08T12:00:00.000Z");

  it("hält an, solange die Frist läuft", () => {
    expect(
      isPaused(
        { ...SOURCING_AUTOMATION_DEFAULT, pausedUntil: "2026-09-09T06:00:00.000Z" },
        jetzt,
      ),
    ).toBe(true);
  });

  it("läuft weiter, wenn sie abgelaufen ist", () => {
    expect(
      isPaused(
        { ...SOURCING_AUTOMATION_DEFAULT, pausedUntil: "2026-09-08T06:00:00.000Z" },
        jetzt,
      ),
    ).toBe(false);
  });

  it("hält ohne Frist nicht an", () => {
    expect(isPaused(SOURCING_AUTOMATION_DEFAULT, jetzt)).toBe(false);
  });

  it("hält bei unlesbarer Frist nicht an, statt für immer zu ruhen", () => {
    expect(
      isPaused({ ...SOURCING_AUTOMATION_DEFAULT, pausedUntil: "kaputt" }, jetzt),
    ).toBe(false);
  });
});
