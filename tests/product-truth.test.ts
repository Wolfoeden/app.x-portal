import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CREDIT_PLANS } from "@/lib/ai/credit-policy";
import { ENTERPRISE_BILLING, ENTERPRISE_START_EURO } from "@/lib/billing/payment-links";
import { TERMS_REVIEW, TERMS_STATUS } from "@/lib/legal/policy";

const publicContractFiles = [
  "components/chat/account.tsx",
  "components/chat/credit-limit.tsx",
  "lib/billing/order-confirmation.ts",
  "lib/billing/payment-links.ts",
  "app/terms/page.tsx",
  "docs/processor-register.md",
] as const;

describe("zentrale Produktwahrheit", () => {
  it("hält den historischen Enterprise-Vertrag getrennt", () => {
    expect(ENTERPRISE_START_EURO).toBe(CREDIT_PLANS.enterprise_legacy.euro);
    expect(ENTERPRISE_BILLING).toMatchObject({
      model: "fixed_monthly",
      priceNetEuro: CREDIT_PLANS.enterprise_legacy.euro,
      interval: "month",
    });
    expect(CREDIT_PLANS.enterprise_legacy.monthlyCredits).toBe(3_000);
    expect(CREDIT_PLANS.enterprise_flex.billingModel).toBe("metered");
    expect(CREDIT_PLANS.enterprise_flex.euroPerCreditCents).toBe(2);
  });

  it("veröffentlicht keine alten Ein-Euro- oder Credit-Kauf-Verträge", () => {
    const source = publicContractFiles
      .map((file) => readFileSync(new URL("../" + file, import.meta.url), "utf8"))
      .join("\n");
    for (const stale of [
      /ein Euro/iu,
      /one euro/iu,
      /einzeln erworbene Credits/iu,
      /senkt die Rechnung/iu,
    ]) expect(source).not.toMatch(stale);
  });

  it("schaltet den anwaltlich freigegebenen AGB-Stand für den Bestellweg frei", () => {
    expect(TERMS_STATUS).toBe("approved");
    expect(TERMS_REVIEW.checkoutEnabled).toBe(true);
    expect(TERMS_REVIEW.label).toBe("Rechtlich geprüft");
  });
});
