import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { VERIFIED_PRICE_IDS } from "@/lib/billing/payment-links";
import { BillingError, stripePriceForPlan } from "@/lib/billing/subscription";

afterEach(() => vi.unstubAllEnvs());

describe("price for a new recruiting checkout", () => {
  it("uses the configured price first", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_example");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_configured123");
    expect(stripePriceForPlan("pro")).toBe("price_configured123");
  });

  it("falls back to the verified live price with a live key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_example");
    vi.stubEnv("STRIPE_BASIC_PRICE_ID", "");
    expect(stripePriceForPlan("basic")).toBe(VERIFIED_PRICE_IDS.basic);
  });

  it("never sends a live price into a test-mode checkout", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "");
    expect(() => stripePriceForPlan("business")).toThrow(BillingError);
    expect(() => stripePriceForPlan("business")).toThrow("price_not_configured");
  });

  it("returns from Stripe directly to chat and lets Stripe choose configured payment methods", () => {
    const source = readFileSync(new URL("../../lib/billing/subscription.ts", import.meta.url), "utf8");
    expect(source).toContain('success_url: `${origin}/chat?billing=success`');
    expect(source).not.toContain("payment_method_types:");
  });
});
