import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { stripeId } from "@/lib/billing/subscription";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261008225217_allow_stripe_checkout_session_underscores.sql", import.meta.url),
  "utf8",
);

describe("Stripe Checkout Session IDs", () => {
  it.each(["cs_live_a1B2c3", "cs_test_Z9y8X7", "cs_Legacy1"])("accepts %s", (id) => {
    expect(stripeId(id, "cs")).toBe(id);
  });

  it.each(["cs_", "cs_live_", "cs__live", "cs_live__a1", "cs-live-a1", "sub_live_a1"])("rejects malformed %s", (id) => {
    expect(stripeId(id, "cs")).toBeNull();
  });

  it("keeps the database RPC aligned with the server validator", () => {
    expect(migration).toContain("^cs_[A-Za-z0-9]+(_[A-Za-z0-9]+)*$");
    expect(migration).toContain("save_recruiting_checkout_session(uuid,uuid,text,text)");
    expect(migration).toContain("to service_role");
  });
});
