import { describe, expect, it } from "vitest";

import { BRIEF_ANALYSIS_CREDITS, CREDIT_PLANS, creditPlan, isCreditPlanId } from "@/lib/ai/credit-policy";
import { PUBLIC_PRICING_PLANS, START_CREDITS, meteredNetCents } from "@/lib/billing/plans";

describe("Pricing- und Billingmodell", () => {
  it("grants three free analyses on signup and keeps the larger card trial separate", () => {
    expect(CREDIT_PLANS.trial.billingModel).toBe("one_time");
    expect(CREDIT_PLANS.trial.grantCredits).toBe(90);
    expect(CREDIT_PLANS.trial.monthlyCredits).toBe(0);
    expect(CREDIT_PLANS.starter).toMatchObject({ billingModel: "one_time", grantCredits: 9, euro: 0 });
    expect(START_CREDITS).toBe(9);
    expect(CREDIT_PLANS.guest.grantCredits).toBe(0);
  });

  it("definiert die drei Monatspläne zentral", () => {
    expect(CREDIT_PLANS.basic).toMatchObject({ priceNetCents: 900, monthlyCredits: 500 });
    expect(CREDIT_PLANS.pro).toMatchObject({ priceNetCents: 1_900, monthlyCredits: 1_250, recommended: true });
    expect(CREDIT_PLANS.business).toMatchObject({ priceNetCents: 5_000, monthlyCredits: 4_000 });
  });

  it("berechnet Enterprise ohne Float-Arithmetik", () => {
    expect(CREDIT_PLANS.enterprise_flex).toMatchObject({ billingModel: "metered", monthlyBaseFeeCents: 0, euroPerCreditCents: 2 });
    expect(meteredNetCents(1)).toBe(2);
    expect(meteredNetCents(100)).toBe(200);
    expect(meteredNetCents(2_375)).toBe(4_750);
  });

  it("hält Legacy-Enterprise vom neuen Flex-Tarif getrennt", () => {
    expect(CREDIT_PLANS.enterprise_legacy).toMatchObject({ billingModel: "fixed_monthly", monthlyCredits: 3_000, euro: 50 });
    expect(CREDIT_PLANS.enterprise_flex.monthlyCredits).toBe(0);
  });

  it("zeigt den kostenlosen Einstieg links vor den Bezahlplänen", () => {
    expect(PUBLIC_PRICING_PLANS.map((plan) => plan.id)).toEqual(["starter", "basic", "pro", "business", "enterprise_flex"]);
    expect(Math.floor(CREDIT_PLANS.basic.monthlyCredits / BRIEF_ANALYSIS_CREDITS)).toBe(166);
  });

  it("fällt bei unbekannter Stufe konservativ auf Starter oder Gast zurück", () => {
    expect(creditPlan("etwas-neues", true).id).toBe("guest");
    expect(creditPlan("etwas-neues", false).id).toBe("starter");
    expect(isCreditPlanId("enterprise_flex")).toBe(true);
    expect(isCreditPlanId("starter")).toBe(true);
  });
});
