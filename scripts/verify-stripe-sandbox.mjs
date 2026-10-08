// Real Stripe Sandbox/Test Clock checks. Does not claim browser or app/DB E2E acceptance.
// Usage: STRIPE_CLI=... STRIPE_CLI_CONFIG=... STRIPE_ACCEPTANCE_ACCOUNT=acct_...
// node scripts/verify-stripe-sandbox.mjs <output-directory>
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const execute = promisify(execFile);
const cli = process.env.STRIPE_CLI || "stripe";
const config = process.env.STRIPE_CLI_CONFIG;
const account = process.env.STRIPE_ACCEPTANCE_ACCOUNT;
if (!config || !account) throw new Error("Explicit Sandbox CLI config and account are required.");
const output = resolve(process.argv[2] || "../stripe-acceptance-results");
await mkdir(output, { recursive: true });
const run = randomUUID();
const results = [];
async function command(args) {
  const result = await execute(cli, ["--config", config, "--color", "off", ...args], { maxBuffer: 4_000_000, timeout: 60_000 });
  const json = result.stdout.slice(result.stdout.search(/^\{/m));
  const parsed = JSON.parse(json);
  if (parsed.error) throw new Error(`Stripe ${parsed.error.type}: ${parsed.error.code || "request failed"}`);
  return parsed;
}
async function api(method, path, params = {}, key) {
  const args = [method, `/v1${path}`, "--stripe-version", "2024-06-20"];
  for (const [name, value] of Object.entries(params)) args.push("-d", `${name}=${value}`);
  if (key) args.push("--idempotency", key);
  const result = await command(args);
  if (result.livemode !== undefined) assert.equal(result.livemode, false, "Only Sandbox objects allowed");
  return result;
}
async function check(name, work) {
  try { const evidence = await work(); results.push({ name, passed: true, evidence }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
  await writeFile(resolve(output, "report.json"), JSON.stringify({ run, account, mode: "sandbox", apiVersion: "2024-06-20", scope: "Actual Stripe API and Test Clocks; app/browser/DB integration is a separate gate", results }, null, 2));
}
async function advance(clock, timestamp) {
  await api("post", `/test_helpers/test_clocks/${clock}/advance`, { frozen_time: timestamp });
  for (let attempt = 0; attempt < 60; attempt++) {
    const current = await api("get", `/test_helpers/test_clocks/${clock}`);
    if (current.status === "ready") return;
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error("Test Clock did not become ready");
}
const identity = await command(["whoami", "--format", "json"]);
assert.equal(identity.account_id, account, "CLI must target the explicitly authorized Sandbox");
const product = await api("post", "/products", { name: `XPORTAL acceptance ${run}`, "metadata[acceptance_run]": run });
const price = await api("post", "/prices", { product: product.id, currency: "eur", unit_amount: 1900, "recurring[interval]": "month", tax_behavior: "exclusive" });

async function fixture(method = "pm_card_visa") {
  const clock = await api("post", "/test_helpers/test_clocks", { name: `XPORTAL ${run}`, frozen_time: Math.floor(Date.now() / 1000) });
  const customer = await api("post", "/customers", { test_clock: clock.id, email: `acceptance-${randomUUID()}@example.invalid`, "metadata[acceptance_run]": run });
  const payment = await api("post", `/payment_methods/${method}/attach`, { customer: customer.id });
  await api("post", `/customers/${customer.id}`, { "invoice_settings[default_payment_method]": payment.id });
  const subscription = await api("post", "/subscriptions", { customer: customer.id, "items[0][price]": price.id, trial_period_days: 14, default_payment_method: payment.id, "trial_settings[end_behavior][missing_payment_method]": "cancel", "metadata[acceptance_run]": run });
  assert.equal(subscription.status, "trialing");
  assert.equal(subscription.trial_end - subscription.trial_start, 14 * 86400);
  const invoice = await api("get", `/invoices/${subscription.latest_invoice}`);
  assert.equal(invoice.amount_paid, 0); assert.equal(invoice.total, 0);
  return { clock, customer, subscription, invoice };
}

await check("14-day card trial, zero invoice, paid monthly renewal", async () => {
  const f = await fixture();
  await advance(f.clock.id, f.subscription.trial_end + 3600);
  let current = await api("get", `/subscriptions/${f.subscription.id}`);
  let invoice = await api("get", `/invoices/${current.latest_invoice}`);
  // Stripe's clock processes the invoice-finalization delay separately.
  if (invoice.status === "draft") {
    await advance(f.clock.id, f.subscription.trial_end + 7200);
    current = await api("get", `/subscriptions/${f.subscription.id}`);
    invoice = await api("get", `/invoices/${current.latest_invoice}`);
  }
  assert.equal(invoice.status, "paid"); assert.equal(invoice.amount_paid, 1900);
  assert.equal(current.status, "active");
  return { clock: f.clock.id, subscription: current.id, trialInvoice: f.invoice.id, paidInvoice: invoice.id, amountPaid: invoice.amount_paid };
});

await check("cancellation before trial end prevents first paid invoice", async () => {
  const f = await fixture();
  await api("post", `/subscriptions/${f.subscription.id}`, { cancel_at_period_end: true });
  await advance(f.clock.id, f.subscription.trial_end + 7200);
  const current = await api("get", `/subscriptions/${f.subscription.id}`);
  assert.equal(current.status, "canceled");
  const invoices = await api("get", "/invoices", { customer: f.customer.id });
  assert.ok(invoices.data.every(item => item.amount_paid === 0 && item.total === 0));
  return { subscription: current.id, status: current.status, paidInvoices: 0 };
});

for (const [name, paymentMethod, expectedIntent] of [
  ["failed payment and recovery", "pm_card_chargeCustomerFail", "requires_payment_method"],
  ["authentication required and recovery", "pm_card_authenticationRequired", "requires_action"],
]) await check(name, async () => {
  const f = await fixture(paymentMethod);
  await advance(f.clock.id, f.subscription.trial_end + 7200);
  const current = await api("get", `/subscriptions/${f.subscription.id}`);
  let invoice = await api("get", `/invoices/${current.latest_invoice}`, { "expand[0]": "payment_intent" });
  if (invoice.status === "draft") {
    await advance(f.clock.id, f.subscription.trial_end + 10800);
    invoice = await api("get", `/invoices/${current.latest_invoice}`, { "expand[0]": "payment_intent" });
  }
  assert.equal(invoice.status, "open"); assert.equal(invoice.amount_paid, 0);
  assert.equal(invoice.payment_intent.status, expectedIntent);
  const replacement = await api("post", "/payment_methods/pm_card_visa/attach", { customer: f.customer.id });
  await api("post", `/subscriptions/${f.subscription.id}`, { default_payment_method: replacement.id });
  const paid = await api("post", `/invoices/${invoice.id}/pay`, { payment_method: replacement.id });
  assert.equal(paid.status, "paid"); assert.equal(paid.amount_paid, 1900);
  const recovered = await api("get", `/subscriptions/${f.subscription.id}`);
  assert.equal(recovered.status, "active");
  return { subscription: current.id, invoice: invoice.id, failedIntentStatus: expectedIntent, recovered: recovered.status };
});

await check("abandoned checkout and duplicate creation", async () => {
  const customer = await api("post", "/customers", { email: `checkout-${run}@example.invalid` });
  const params = { mode: "subscription", customer: customer.id, "line_items[0][price]": price.id, "line_items[0][quantity]": 1,
    payment_method_collection: "always", "subscription_data[trial_period_days]": 14, success_url: "https://example.invalid/success", cancel_url: "https://example.invalid/cancel" };
  const key = `xportal-acceptance-${run}`;
  const first = await api("post", "/checkout/sessions", params, key);
  const second = await api("post", "/checkout/sessions", params, key);
  assert.equal(first.id, second.id); assert.equal(first.status, "open"); assert.equal(first.subscription, null);
  const expired = await api("post", `/checkout/sessions/${first.id}/expire`);
  assert.equal(expired.status, "expired"); assert.equal(expired.subscription, null);
  return { session: first.id, singleSession: true, expiredWithoutSubscription: true };
});
if (results.some(item => !item.passed)) process.exitCode = 1;
