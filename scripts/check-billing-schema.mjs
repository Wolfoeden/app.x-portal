import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Isolated PostgreSQL WASM verification, not a replacement for Supabase/Stripe
// staging acceptance. Install the pinned verifier outside the app checkout:
// npm install --prefix ../billing-verification --ignore-scripts @electric-sql/pglite@0.3.14
const modulePath = process.env.PGLITE_MODULE_PATH;
const imported = modulePath ? await import(pathToFileURL(modulePath).href)
  : await import("../../billing-verification/node_modules/@electric-sql/pglite/dist/index.js");
const db = new imported.PGlite();
const newer = "20261007174333_recruiting_subscription_trial.sql";
const user = "10000000-0000-4000-8000-000000000001";
const legacy = "10000000-0000-4000-8000-000000000002";
const anon = "10000000-0000-4000-8000-000000000003";
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private; create schema extensions;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
create function extensions.digest(value text,algorithm text) returns bytea language sql immutable as $$ select sha256(convert_to(value,'UTF8')) $$;
create table public.user_ai_credit_accounts(
  user_id uuid constraint user_ai_credit_accounts_pkey primary key references auth.users(id) on delete cascade,
  is_anonymous boolean not null,plan_id text not null default 'trial',credits_total bigint not null default 0,
  credits_used bigint not null default 0,credits_reserved bigint not null default 0,credits_self_limit bigint,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  period_start timestamptz not null default now(),period_end timestamptz not null default now()+interval '1 month',
  stripe_plan_id text,stripe_customer_id text,stripe_subscription_id text unique,stripe_subscription_status text,
  stripe_cancel_at_period_end boolean not null default false,stripe_latest_invoice_id text,stripe_latest_invoice_status text,
  stripe_checkout_completed_at timestamptz,business_terms_version text,business_confirmed_at timestamptz
);
create table public.stripe_webhook_events(event_id text primary key,event_type text not null,user_id uuid);
create function private.current_ai_credit_period_start() returns timestamptz language sql stable as $$ select date_trunc('month',now()) $$;
create function private.credit_plan_monthly_allowance(p_plan_id text) returns bigint language sql immutable as $$
  select case p_plan_id when 'basic' then 500 when 'pro' then 1250 when 'business' then 4000 when 'enterprise_legacy' then 3000 else null end::bigint $$;
create function public.consume_ai_quota_v2(text,text,text,boolean,integer,bigint,bigint,bigint,bigint,uuid,uuid,uuid,text,text,bigint,bigint,bigint,text,text)
returns table(allowed boolean,reason text,retry_after timestamptz,reservation_id uuid,credits_total bigint,credits_used bigint,credits_reserved bigint,credits_remaining bigint)
language sql as $$ select true,'delegated'::text,null::timestamptz,null::uuid,90::bigint,0::bigint,0::bigint,90::bigint $$;
insert into auth.users values('${user}','trial@example.com',now(),false),('${legacy}','legacy@example.com',now(),false),('${anon}',null,null,true);
insert into public.user_ai_credit_accounts(user_id,is_anonymous,plan_id,credits_total,credits_used)
 values('${legacy}',false,'trial',300,40);
`);
await db.exec(await readFile(new URL(`../supabase/migrations/${newer}`, import.meta.url), "utf8"));
let assertions = 0;
async function row(sql, params = []) { return (await db.query(sql, params)).rows[0]; }
function check(value, expected, message) { assert.deepEqual(value, expected, message); assertions++; }
async function rejects(sql, expression) { await assert.rejects(db.query(sql), expression); assertions++; }
try {
  check((await row(`select credits_remaining from public.get_ai_credit_snapshot('${user}',false,9999)`)).credits_remaining, 0, "No signup bonus even with caller-supplied allowance");
  check((await row(`select credits_remaining from public.get_ai_credit_snapshot('${anon}',true,9999)`)).credits_remaining, 0, "No guest bonus");
  check((await row(`select credits_remaining from public.get_ai_credit_snapshot('${legacy}',false,0)`)).credits_remaining, 260, "Existing legitimate balance preserved");
  check((await row(`select source from public.get_recruiting_entitlement('${legacy}')`)).source, "legacy", "Legacy account keeps entitlement");
  const attempt = await row(`select * from public.prepare_recruiting_checkout('${user}','pro')`);
  const repeat = await row(`select * from public.prepare_recruiting_checkout('${user}','basic')`);
  check(repeat.request_key, attempt.request_key, "Parallel/double-click attempts share one key");
  check(repeat.plan_id, "pro", "Concurrent plan choice cannot create another session");
  await db.exec(`select public.save_recruiting_checkout_customer('${user}','${attempt.request_key}','cus_Test');
    select public.save_recruiting_checkout_session('${user}','${attempt.request_key}','cs_Test','https://checkout.stripe.com/c/pay/cs_Test');`);
  async function sync(event, extra = {}) {
    const p = { status: "trialing", cancel: false, verified: true, card: true, amount: 0, invoice: "in_Trial", invoiceStatus: "paid", observed: new Date().toISOString(), ...extra };
    return await row(`select * from public.sync_recruiting_subscription($1,$2,'test',$3,$4,'pro',$5,$6,
      now()-interval '1 minute',now()+interval '14 days',$7,$8,'cs_Test',$9,90,$10,$11,$12,
      now(),now()+interval '1 month',$13)`, [user, event, "sub_Test", "cus_Test", p.status, p.cancel, p.card, p.verified, attempt.request_key, p.invoice, p.invoiceStatus, p.amount, p.observed]);
  }
  check((await sync("evt_NoCard", { card: false })).trial_activated, false, "No trial without actual card");
  const active = await sync("evt_Trial");
  check(active.trial_activated, true, "Verified checkout and card grant trial");
  check(active.paid_activated, false, "Zero trial invoice grants no paid credits");
  check((await row(`select credits_total from public.user_ai_credit_accounts where user_id='${user}'`)).credits_total, 90, "One total 90-credit grant");
  check((await sync("evt_Trial")).trial_activated, false, "Repeated event is idempotent");
  check((await sync("evt_TrialDuplicate")).trial_activated, false, "Distinct events cannot repeat trial");
  check((await row(`select source from public.get_recruiting_entitlement('${user}')`)).source, "trial", "Trial uses central entitlement");
  await db.exec(`select * from public.set_ai_credit_self_limit('${user}',null,1250);`);
  check((await row(`select credits_total from public.user_ai_credit_accounts where user_id='${user}'`)).credits_total, 90, "Self-limit reset cannot grant monthly credits during trial");
  await sync("evt_Cancel", { cancel: true });
  await sync("evt_LateUncancel", { cancel: false });
  check((await row(`select stripe_cancel_at_period_end from public.user_ai_credit_accounts where user_id='${user}'`)).stripe_cancel_at_period_end, true, "Delayed event cannot restore canceled renewal");
  const old = new Date(Date.now() - 60_000).toISOString();
  await sync("evt_StaleSnapshot", { status: "active", observed: old });
  check((await row(`select stripe_subscription_status from public.user_ai_credit_accounts where user_id='${user}'`)).stripe_subscription_status, "trialing", "Older concurrent canonical fetch cannot overwrite newer state");
  await db.exec(`update public.user_ai_credit_accounts set credits_used=90 where user_id='${user}'`);
  check((await row(`select can_run_ai from public.get_recruiting_entitlement('${user}')`)).can_run_ai, false, "Exhausted trial denies new AI run");
  check((await row(`select count(*)::integer as n from public.recruiting_billing_grants`)).n, 0, "Exhaustion never creates payment grant");
  const paid = await sync("evt_Paid", { status: "active", amount: 1900, invoice: "in_Paid" });
  check(paid.paid_activated, true, "Actual positive paid invoice grants monthly allowance");
  check(paid.first_payment, true, "Zero trial invoice did not count as first payment");
  await db.exec(`update public.user_ai_credit_accounts set credits_used=23 where user_id='${user}'`);
  await sync("evt_DuplicatePaid", { status: "active", amount: 1900, invoice: "in_Paid" });
  check((await row(`select credits_used from public.user_ai_credit_accounts where user_id='${user}'`)).credits_used, 23, "A new event for same invoice cannot reset usage");
  await db.exec(`update public.user_ai_credit_accounts set stripe_subscription_status='past_due',stripe_paid_through=now()-interval '1 second',period_end=now()-interval '1 second' where user_id='${user}'`);
  check((await row(`select can_run_ai from public.get_recruiting_entitlement('${user}')`)).can_run_ai, false, "Expired paid period blocks AI even on past_due");
  await rejects(`select * from public.prepare_recruiting_checkout('${anon}','pro')`, /email_not_verified/);
  await rejects(`select * from public.prepare_recruiting_checkout('${user}','pro')`, /subscription_exists/);
  check((await row(`select has_function_privilege('authenticated','public.get_recruiting_entitlement(uuid)','execute') as allowed`)).allowed, false, "Browser cannot call service-only entitlement RPC");
  check((await row(`select has_table_privilege('anon','public.recruiting_billing_grants','select') as allowed`)).allowed, false, "Grant ledger not public");
  console.log(`Billing migration verified in isolated PostgreSQL WASM fixture: ${assertions} assertions passed. No Supabase Docker stack or Stripe Test Clock was used.`);
} finally { await db.close(); }
