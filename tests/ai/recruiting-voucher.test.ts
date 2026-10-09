import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261009182257_recruiting_voucher_trial.sql",
  "utf8",
);

describe("limited recruiting voucher", () => {
  it("seeds the requested cardless trial and hard campaign cap", () => {
    expect(migration).toContain("'XPORTAL2026'");
    expect(migration).toMatch(/max_redemptions,\s*trial_days,\s*trial_credits[\s\S]*50,\s*14,\s*90/u);
    expect(migration).toContain("redemption_count <= max_redemptions");
  });

  it("serializes redemptions before checking and incrementing capacity", () => {
    const lock = migration.indexOf("where v.code_hash = v_hash\n   for update");
    const capacity = migration.indexOf("v_voucher.redemption_count >= v_voucher.max_redemptions");
    const increment = migration.indexOf("redemption_count = v.redemption_count + 1");
    expect(lock).toBeGreaterThan(0);
    expect(capacity).toBeGreaterThan(lock);
    expect(increment).toBeGreaterThan(capacity);
  });

  it("allows one redemption per account and keeps the privileged RPC server-only", () => {
    expect(migration).toContain("primary key (code_hash, user_id)");
    expect(migration).toContain("revoke all on function public.redeem_recruiting_voucher(uuid, text, text) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.redeem_recruiting_voucher(uuid, text, text) to service_role");
  });
});
