import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  parseSelfLimit,
  SELF_LIMIT_MAX,
  SELF_LIMIT_MAX_EURO,
} from "@/lib/ai/self-limit";
import { CREDIT_PLANS } from "@/lib/ai/credit-policy";

describe("selbst gesetztes Limit", () => {
  /**
   * `null` heisst ausdruecklich "kein Limit" und ist etwas anderes als 0 — die
   * Null waere ein Konto, das nichts mehr darf. Wer das Feld nur leert, meint
   * fast immer das Gegenteil.
   */
  it("haelt 'kein Limit' und 'null Credits' auseinander", () => {
    expect(parseSelfLimit(null)).toBeNull();
    expect(parseSelfLimit(0)).toBe(0);
  });

  it("nimmt jede Zahl innerhalb des Kontingents an", () => {
    expect(parseSelfLimit(1)).toBe(1);
    expect(parseSelfLimit(500)).toBe(500);
    expect(parseSelfLimit(SELF_LIMIT_MAX)).toBe(SELF_LIMIT_MAX);
  });

  it("weist alles zurueck, was kein ganzes Kontingent sein kann", () => {
    for (const bad of [-1, 1.5, SELF_LIMIT_MAX + 1, "500", true, {}, undefined, NaN]) {
      expect(parseSelfLimit(bad)).toBe("invalid");
    }
  });

  // Die Obergrenze haengt an der Stufe und nicht an einer zweiten Zahl, die
  // irgendwann davon abweicht.
  it("leitet die Obergrenze aus dem Plan ab", () => {
    expect(SELF_LIMIT_MAX).toBe(CREDIT_PLANS.enterprise.monthlyCredits);
    expect(SELF_LIMIT_MAX).toBe(3_000);
  });

  it("nennt, was das volle Kontingent hoechstens kostet", () => {
    expect(SELF_LIMIT_MAX_EURO).toBe(50);
  });
});
