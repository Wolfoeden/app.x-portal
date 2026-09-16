import { describe, expect, it } from "vitest";

import { CREDIT_PLANS } from "@/lib/ai/credit-policy";
import { planPriceSuffix } from "@/components/chat/account";

describe("plan price suffix", () => {
  it("names the tax on every price that is actually charged", () => {
    // XPORTAL richtet sich nur an Unternehmer, deshalb sind Nettopreise
    // zulässig — aber nur mit dem Zusatz.
    expect(planPriceSuffix(CREDIT_PLANS.business.euro)).toBe(
      "pro Monat, zzgl. USt.",
    );
  });

  it("leaves the free tiers without a pointless tax note", () => {
    expect(planPriceSuffix(CREDIT_PLANS.trial.euro)).toBe("ohne Grundgebühr");
    expect(planPriceSuffix(CREDIT_PLANS.guest.euro)).toBe("ohne Grundgebühr");
  });

  it("covers every purchasable plan", () => {
    for (const plan of Object.values(CREDIT_PLANS)) {
      if (!plan.purchasable) continue;
      expect(plan.euro).toBeGreaterThan(0);
      expect(planPriceSuffix(plan.euro)).toContain("zzgl. USt.");
    }
  });
});
