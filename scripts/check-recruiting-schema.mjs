// Isolated PostgreSQL fixture, no hosted credentials/network or real emails.
// Install pinned @electric-sql/pglite@0.5.8 outside the repository, then set
// PGLITE_MODULE_PATH to that package's dist/index.js and run this file.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : "@electric-sql/pglite");
const db = new PGlite();
const ids = {
  owner: "11111111-1111-4111-8111-111111111111",
  project: "22222222-2222-4222-8222-222222222222",
  profile: "33333333-3333-4333-8333-333333333333",
  oldIntro: "44444444-4444-4444-8444-444444444444",
  oldEngagement: "55555555-5555-4555-8555-555555555555",
  mandate: "66666666-6666-4666-8666-666666666666",
};
let checks = 0;
async function rejects(sql, match) { await assert.rejects(() => db.exec(sql), match); checks++; }
async function row(sql) { return (await db.query(sql)).rows[0]; }
const newIntro = (suffix, extra = "") => `insert into public.intro_bookings(id,owner_user_id,project_id,freelancer_profile_id,intro_policy_snapshot,status${extra ? "," + extra.split("=")[0] : ""}) values('a0000000-0000-4000-8000-${suffix.padStart(12, "0")}', '${ids.owner}', '${ids.project}', '${ids.profile}', 'freelancer_consent', 'requested'${extra ? "," + extra.split("=")[1] : ""})`;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.search_mandates(id uuid primary key, owner_user_id uuid not null, project_id uuid not null);
    create table public.intro_bookings(id uuid primary key, owner_user_id uuid not null, project_id uuid not null,
      freelancer_profile_id uuid not null, intro_policy_snapshot text not null, status text not null,
      booking_url text, booking_provider text, confirmed_at timestamptz, cancelled_at timestamptz,
      constraint intro_bookings_intro_policy_check check(intro_policy_snapshot in ('free','manual_approval')));
    create table public.engagements(id uuid primary key default gen_random_uuid(), owner_user_id uuid not null,
      project_id uuid not null, intro_booking_id uuid references public.intro_bookings(id), fee_minor bigint,
      fee_status text, stripe_invoice_id text, invoice_reference text, terms_version text);
    insert into public.search_mandates values('${ids.mandate}', '${ids.owner}', '${ids.project}');
    insert into public.intro_bookings(id,owner_user_id,project_id,freelancer_profile_id,intro_policy_snapshot,status)
      values('${ids.oldIntro}','${ids.owner}','${ids.project}','${ids.profile}','manual_approval','ready_to_book');
    insert into public.engagements(id,owner_user_id,project_id,intro_booking_id,fee_minor,fee_status,stripe_invoice_id,terms_version)
      values('${ids.oldEngagement}','${ids.owner}','${ids.project}','${ids.oldIntro}',123456,'invoiced','in_historical','historical-version');
  `);
  const first = await readFile(new URL("../supabase/migrations/20261007174234_recruiting_no_fee_contacts.sql", import.meta.url), "utf8");
  const delivery = await readFile(new URL("../supabase/migrations/20261007210832_recruiting_contact_delivery.sql", import.meta.url), "utf8");
  await db.exec(first);
  assert.deepEqual(await row(`select commercial_model, fee_minor, stripe_invoice_id, terms_version from engagements where id='${ids.oldEngagement}'`), { commercial_model: "legacy_placement", fee_minor: 123456, stripe_invoice_id: "in_historical", terms_version: "historical-version" }); checks++;
  await db.exec(delivery);
  await db.exec(newIntro("1"));
  assert.equal((await row("select commercial_model from intro_bookings where id='a0000000-0000-4000-8000-000000000001'")).commercial_model, "no_fee"); checks++;
  assert.equal((await row("select count(*)::int as n from recruiting_contact_deliveries")).n, 1); checks++;
  await rejects(newIntro("2"), /duplicate key/);
  await rejects(`update intro_bookings set commercial_model='legacy_placement' where id='a0000000-0000-4000-8000-000000000001'`, /immutable/);
  await rejects(`update engagements set commercial_model='no_fee' where id='${ids.oldEngagement}'`, /immutable/);
  await rejects(`update search_mandates set commercial_model='no_fee' where id='${ids.mandate}'`, /immutable/);
  await rejects(newIntro("3", "commercial_model='legacy_placement'"), /must use no_fee/);
  await rejects(`insert into engagements(owner_user_id,project_id,intro_booking_id,fee_minor,fee_status,commercial_model) values('${ids.owner}','${ids.project}','a0000000-0000-4000-8000-000000000001',999,'open','legacy_placement')`, /no_fee_check/);
  await db.exec(`insert into engagements(owner_user_id,project_id,intro_booking_id,fee_minor,fee_status) values('${ids.owner}','${ids.project}','a0000000-0000-4000-8000-000000000001',0,'waived')`);
  await rejects(`update engagements set stripe_invoice_id='in_forged' where commercial_model='no_fee'`, /no_fee_check/);
  await db.exec(`insert into intro_bookings(id,owner_user_id,project_id,freelancer_profile_id,intro_policy_snapshot,status,commercial_model,legacy_mandate_id) values('a0000000-0000-4000-8000-000000000004','${ids.owner}','${ids.project}','${ids.profile}','manual_approval','manual_review','legacy_placement','${ids.mandate}')`);
  assert.equal((await row("select commercial_model from intro_bookings where id='a0000000-0000-4000-8000-000000000004'")).commercial_model, "legacy_placement"); checks++;
  const job = await row("select id from recruiting_contact_deliveries limit 1");
  const claim = await row(`select * from claim_recruiting_contact_delivery('${job.id}')`);
  assert.equal(claim.status, "sending"); checks++;
  assert.equal((await db.query(`select * from claim_recruiting_contact_delivery('${job.id}')`)).rows.length, 0); checks++;
  assert.equal((await row(`select respond_recruiting_contact('a0000000-0000-4000-8000-000000000001', true, 'client@example.invalid', 'freelancer@example.invalid', 'Example', 'Project', null) as accepted`)).accepted, true); checks++;
  assert.equal((await row(`select respond_recruiting_contact('a0000000-0000-4000-8000-000000000001', true, 'client@example.invalid', 'freelancer@example.invalid', 'Example', 'Project', null) as accepted`)).accepted, false); checks++;
  assert.equal((await row("select count(*)::int as n from recruiting_contact_deliveries where kind like 'confirmation_%'")).n, 2); checks++;
  await db.exec("set role authenticated");
  await rejects("select * from recruiting_contact_deliveries", /permission denied/);
  await rejects(`select * from claim_recruiting_contact_delivery('${job.id}')`, /permission denied/);
  await rejects(`select respond_recruiting_contact('${ids.oldIntro}', true, 'x', 'y', 'z', 'p', null)`, /permission denied/);
  await db.exec("reset role");
  console.log(JSON.stringify({ status: "passed", checks, engine: "PGlite PostgreSQL isolated fixture", limitations: "Hosted Supabase/RLS ownership policies and whole historical migration chain not executed." }));
} finally { await db.close(); }
