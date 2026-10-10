import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ACCOUNT_MONTHLY_CREDITS,
  BRIEF_ANALYSIS_CREDITS,
  GUEST_MONTHLY_CREDITS,
} from "@/lib/ai/credit-policy";
import {
  calculateProviderCostCents,
  configuredDailyTokenLimit,
  ALLOWED_MONTHLY_CREDIT_TOTALS,
  configuredInitialCredits,
  configuredMonthlyProviderBudgetCents,
  configuredUnknownModelEstimatedCostCents,
} from "@/lib/ai/quota";

describe("provider cost reconciliation", () => {
  afterEach(() => {
    delete process.env.OPENAI_INPUT_USD_PER_MILLION;
    delete process.env.OPENAI_OUTPUT_USD_PER_MILLION;
    delete process.env.OPENAI_COST_MULTIPLIER;
    delete process.env.AI_CREDITS_GUEST_TOTAL;
    delete process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_GUEST;
    delete process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_USER;
    delete process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_ADMIN;
    delete process.env.AI_MONTHLY_PROVIDER_BUDGET_CENTS;
    delete process.env.AI_UNKNOWN_MODEL_ESTIMATED_COST_CENTS;
  });

  it("rounds a non-zero provider use up to the next cent", () => {
    expect(calculateProviderCostCents(10_000, 2_000)).toBe(5);
  });

  it("keeps a separate internal daily allowance for operators", () => {
    process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_USER = "5000000";
    process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_ADMIN = "10000000";

    expect(configuredDailyTokenLimit(false)).toBe(5_000_000);
    expect(configuredDailyTokenLimit(false, true)).toBe(10_000_000);
  });

  it("uses configurable model prices and residency multiplier", () => {
    process.env.OPENAI_INPUT_USD_PER_MILLION = "2";
    process.env.OPENAI_OUTPUT_USD_PER_MILLION = "12";
    process.env.OPENAI_COST_MULTIPLIER = "1.1";
    expect(calculateProviderCostCents(1_000_000, 1_000_000)).toBe(1540);
  });

  it("keeps guests at zero and gives registered accounts three analyses", () => {
    expect(GUEST_MONTHLY_CREDITS).toBe(0);
    expect(configuredInitialCredits(true)).toBe(0);
    expect(ACCOUNT_MONTHLY_CREDITS).toBe(9);
    expect(configuredInitialCredits(false)).toBe(9);
  });

  it("derives the three starter analyses from the registered allowance", () => {
    // Die Zahl, die in der Oberfläche steht, muss aus den Kontingenten
    // folgen — sonst verspricht die Seite etwas, das die Abrechnung nicht hält.
    expect(Math.floor(GUEST_MONTHLY_CREDITS / BRIEF_ANALYSIS_CREDITS)).toBe(0);
    expect(
      Math.floor(ACCOUNT_MONTHLY_CREDITS / BRIEF_ANALYSIS_CREDITS),
    ).toBe(3);
  });

  it("honors zero as an explicit hard-stop configuration", () => {
    process.env.AI_CREDITS_GUEST_TOTAL = "0";
    process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_GUEST = "0";
    process.env.AI_MONTHLY_PROVIDER_BUDGET_CENTS = "0";
    process.env.AI_UNKNOWN_MODEL_ESTIMATED_COST_CENTS = "0";

    expect(configuredInitialCredits(true)).toBe(0);
    expect(configuredDailyTokenLimit(true)).toBe(0);
    expect(configuredMonthlyProviderBudgetCents()).toBe(0);
    expect(configuredUnknownModelEstimatedCostCents()).toBe(0);
  });
});

/**
 * Am 04.09.2026 standen in der Produktion 1050 und 105. Beide Zahlen lehnt
 * `ai_free_usage_accounts_limit_check` ab, also ließ sich keine neue
 * Monatsperiode mehr anlegen — und weil alle Perioden am 1. September
 * abgelaufen waren, stand jede KI-Funktion still. Diese Tests halten die
 * Sicherung fest, die daraus folgt.
 */
describe("Kontingente, die die Datenbank auch annimmt", () => {
  afterEach(() => {
    delete process.env.AI_CREDITS_GUEST_TOTAL;
    delete process.env.AI_CREDITS_USER_TOTAL;
  });

  it("jede erlaubte Zahl ist auch in der Datenbank erlaubt", () => {
    // Die Aufzählung ist die Kopie einer Prüfregel im Schema. Ändert sie sich
    // dort, muss sie sich hier mitändern — dieser Test ist die Erinnerung.
    expect(ALLOWED_MONTHLY_CREDIT_TOTALS).toEqual([0, 9, 10, 30, 63, 90, 100, 300, 500, 1_250, 3_000, 4_000]);
    expect(ALLOWED_MONTHLY_CREDIT_TOTALS).toContain(ACCOUNT_MONTHLY_CREDITS);
    expect(ALLOWED_MONTHLY_CREDIT_TOTALS).toContain(GUEST_MONTHLY_CREDITS);
  });

  it("verwirft einen Wert, den die Datenbank ablehnen würde", () => {
    process.env.AI_CREDITS_USER_TOTAL = "1050";
    process.env.AI_CREDITS_GUEST_TOTAL = "105";

    expect(configuredInitialCredits(false)).toBe(ACCOUNT_MONTHLY_CREDITS);
    expect(configuredInitialCredits(true)).toBe(GUEST_MONTHLY_CREDITS);
  });

  it("ignores a historic environment override and keeps the starter allowance", () => {
    process.env.AI_CREDITS_USER_TOTAL = "90";
    expect(configuredInitialCredits(false)).toBe(9);
  });

  it("lässt das feste 90-Credit-Trial nicht per Umgebung erhöhen", () => {
    process.env.AI_CREDITS_USER_TOTAL = "300";
    expect(configuredInitialCredits(false)).toBe(9);
  });

  it("keeps registration separate from the Stripe verified trial", () => {
    // Das eine Guthaben trägt alles: Analyse zu 3, Websuche zu 30 Credits.
    expect(configuredInitialCredits(false)).toBe(9);
    expect(ACCOUNT_MONTHLY_CREDITS).toBe(9);
  });

  it("does not revive an old guest bonus environment override", () => {
    // Steht in Netlify noch AI_CREDITS_GUEST_TOTAL=100, gilt dieser Wert
    // weiter. Das kleinere Gastguthaben wirkt erst, wenn die Variable fehlt.
    process.env.AI_CREDITS_GUEST_TOTAL = "100";
    expect(configuredInitialCredits(true)).toBe(0);
    delete process.env.AI_CREDITS_GUEST_TOTAL;
    expect(configuredInitialCredits(true)).toBe(0);
  });
});
