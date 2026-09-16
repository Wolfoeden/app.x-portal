import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260915143000_pricing_billing_v2.sql", import.meta.url),
  "utf8",
);
const quota = readFileSync(new URL("../../lib/ai/quota.ts", import.meta.url), "utf8");

describe("pricing billing v2 migration contract", () => {
  it("does not reinterpret existing Enterprise or regrant existing free accounts", () => {
    expect(migration).toContain("set plan_id = 'enterprise_legacy'");
    expect(migration).toContain("set plan_id = 'trial'");
    expect(migration).toContain("trial_granted_at = coalesce(trial_granted_at, created_at)");
    expect(migration).not.toMatch(/set\s+credits_total\s*=\s*300[\s\S]*where\s+plan_id\s*=\s*'free'/iu);
    expect(migration.indexOf("drop constraint if exists user_ai_credit_accounts_plan_check")).toBeLessThan(
      migration.indexOf("set plan_id = 'enterprise_legacy'"),
    );
  });

  it("refills only exact monthly plans", () => {
    expect(migration).toContain("when 'basic' then 500::bigint");
    expect(migration).toContain("when 'pro' then 1250::bigint");
    expect(migration).toContain("when 'business' then 4000::bigint");
    expect(migration).toContain("One-time trials advance their reporting window but never refill");
  });

  it("keeps actor and billing owner distinct for team usage", () => {
    expect(migration).toContain("actor_user_id uuid references auth.users");
    expect(migration).toContain("v_existing.actor_user_id is distinct from p_actor_user_id");
    expect(quota).toContain("p_actor_user_id: input.actorUserId");
    expect(quota).toContain('admin.rpc("consume_ai_quota_v2"');
  });

  it("marks only successful metered usage billable", () => {
    expect(migration).toContain("new.billing_model_at_reservation = 'metered'");
    expect(migration).toContain("new.outcome in ('succeeded', 'reconciled_estimate')");
    expect(migration).toContain("coalesce(new.actual_credits, 0) > 0");
  });

  it("prepares one exact integer-cent invoice and blocks unsettled periods", () => {
    expect(migration).toContain("constraint enterprise_usage_invoices_owner_period_key unique");
    expect(migration).toContain("enterprise usage period has unsettled requests");
    expect(migration).toContain("v_credits * 2");
    expect(migration).toContain("enterprise_invoice_id is null");
  });

  it("does not give metered plans an artificial credit allowance", () => {
    expect(migration).toContain("when a.plan_id = 'enterprise_flex' then 0");
    expect(migration).toContain("if v_plan <> 'enterprise_flex' then");
    expect(migration).not.toMatch(/enterprise_flex[^\n]*(100000|infinity|922337)/iu);
  });
});
