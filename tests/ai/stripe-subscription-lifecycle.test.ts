import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260916161917_stripe_subscription_lifecycle.sql",
    import.meta.url,
  ),
  "utf8",
);

const checkoutQualificationMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260916162027_qualify_stripe_checkout_account.sql",
    import.meta.url,
  ),
  "utf8",
);

const canonicalPricingMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260917072000_checkout_from_canonical_pricing.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Stripe subscription lifecycle migration contract", () => {
  it("extends the existing account and event ledger instead of adding billing tables", () => {
    expect(migration).toContain("alter table public.user_ai_credit_accounts");
    expect(migration).toContain("public.stripe_webhook_events");
    expect(migration).not.toMatch(/create\s+table/iu);
  });

  it("links checkout separately from paid invoice activation", () => {
    expect(migration).toContain("link_stripe_subscription_checkout");
    expect(migration).toContain("p_event_type <> 'checkout.session.completed'");
    expect(migration).toContain("p_event_type <> 'invoice.paid'");

    const checkoutFunction = migration.slice(
      migration.indexOf("create or replace function public.link_stripe_subscription_checkout"),
      migration.indexOf("drop function if exists public.activate_paid_plan"),
    );
    expect(checkoutFunction).not.toMatch(/credits_total\s*=\s*(500|1250|4000)/u);
  });

  it("sets exactly one plan allowance and uses Stripe's paid billing period", () => {
    expect(migration).toContain("p_plan_allowance is distinct from v_expected");
    expect(migration).toContain("period_start = p_period_start");
    expect(migration).toContain("period_end = p_period_end");
    expect(migration).toContain("credits_used = 0");
    expect(migration).toContain("stripe_latest_invoice_status = 'paid'");
  });

  it("never grants credits from failure, cancellation, or local calendar rollover", () => {
    expect(migration).toContain("record_stripe_subscription_status");
    expect(migration).toContain("credits_total = 0");
    expect(migration).toContain("a.plan_id not in ('basic', 'pro', 'business')");
    expect(migration).not.toMatch(/invoice\.payment_failed[\s\S]{0,800}credits_total\s*=/iu);
  });

  it("keeps every privileged RPC service-only", () => {
    for (const signature of [
      "link_stripe_subscription_checkout(text,text,uuid,text,text,text,text)",
      "activate_paid_plan(text,text,uuid,text,bigint,timestamptz,timestamptz,text,text,text)",
      "record_stripe_subscription_status(text,text,text,text,boolean,text,text)",
    ]) {
      expect(migration).toContain(`revoke all on function public.${signature}`);
      expect(migration).toContain(`grant execute on function public.${signature}`);
    }
  });

  it("qualifies account columns inside the checkout linker", () => {
    expect(checkoutQualificationMigration).toContain(
      "update public.user_ai_credit_accounts a",
    );
    expect(checkoutQualificationMigration).toContain("where a.user_id = p_user_id");
    expect(checkoutQualificationMigration).not.toMatch(/where\s+user_id\s*=\s*p_user_id/iu);
  });

  it("links checkout from the canonical pricing page without the removed dialog checkbox", () => {
    expect(canonicalPricingMigration).toContain("a.is_anonymous = false");
    expect(canonicalPricingMigration).not.toContain("business_confirmed_at is null");
    expect(canonicalPricingMigration).not.toContain("business_terms_version");
    expect(canonicalPricingMigration).toContain(
      "revoke all on function public.link_stripe_subscription_checkout",
    );
    expect(canonicalPricingMigration).toContain("to service_role");
  });
});
