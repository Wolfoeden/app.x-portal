import { describe, expect, it } from "vitest";

import {
  ACCOUNT_MONTHLY_CREDITS,
  BRIEF_ANALYSIS_CREDITS,
  CREDIT_PLANS,
  creditPlan,
  GUEST_MONTHLY_CREDITS,
  isCreditPlanId,
} from "@/lib/ai/credit-policy";

describe("Stufenmodell", () => {
  it("gibt jeder Stufe das zugesagte Monatskontingent", () => {
    expect(CREDIT_PLANS.guest.monthlyCredits).toBe(100);
    expect(CREDIT_PLANS.free.monthlyCredits).toBe(300);
    expect(CREDIT_PLANS.enterprise.monthlyCredits).toBe(1_500);
    expect(GUEST_MONTHLY_CREDITS).toBe(100);
    expect(ACCOUNT_MONTHLY_CREDITS).toBe(300);
  });

  it("sperrt Agenten nur auf der Gaststufe", () => {
    expect(CREDIT_PLANS.guest.agents).toBe(false);
    expect(CREDIT_PLANS.free.agents).toBe(true);
    expect(CREDIT_PLANS.enterprise.agents).toBe(true);
  });

  it("rechnet die Stufen in Suchen um", () => {
    const searches = (credits: number) =>
      Math.floor(credits / BRIEF_ANALYSIS_CREDITS);
    expect(searches(CREDIT_PLANS.guest.monthlyCredits)).toBe(33);
    expect(searches(CREDIT_PLANS.free.monthlyCredits)).toBe(100);
    expect(searches(CREDIT_PLANS.enterprise.monthlyCredits)).toBe(500);
  });

  it("fällt bei unbekannter Stufe auf die richtige Gratisstufe zurück", () => {
    // Ein unbekannter Wert darf keinem Gast Agenten geben und keinem Konto
    // das Guthaben kürzen.
    expect(creditPlan("etwas-neues", true).id).toBe("guest");
    expect(creditPlan("etwas-neues", false).id).toBe("free");
    expect(creditPlan(null, true).agents).toBe(false);
    expect(creditPlan(undefined, false).agents).toBe(true);
  });

  it("erkennt nur die drei bekannten Stufen", () => {
    expect(isCreditPlanId("guest")).toBe(true);
    expect(isCreditPlanId("free")).toBe(true);
    expect(isCreditPlanId("enterprise")).toBe(true);
    expect(isCreditPlanId("starter")).toBe(false);
    expect(isCreditPlanId(null)).toBe(false);
  });

  it("hält nur die gekaufte Stufe für verkäuflich", () => {
    expect(CREDIT_PLANS.enterprise.purchasable).toBe(true);
    expect(CREDIT_PLANS.guest.purchasable).toBe(false);
    expect(CREDIT_PLANS.free.purchasable).toBe(false);
  });
});
