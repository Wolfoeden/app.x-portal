# Recruiting SaaS billing — implementation and launch gates

The new offer is server-created Stripe Billing Checkout: Basic9€, Pro19€, Business50€ net/month, 14 days with a card, one total90-credit trial, then a monthly subscription. These values come from `lib/billing/plans.ts`. Account creation and guest sessions grant zero new credits. Change the shared catalogue to change the trial credit allowance; old `AI_CREDITS_*_TOTAL` settings cannot restore bonuses.

## Implemented flow

- A verified, permanent Supabase account chooses a server-allowlisted plan. A database row lock serializes parallel requests; one persisted Checkout attempt and Stripe idempotency key are reused. A normalized-email SHA256 identity survives account deletion/recreation to prevent another trial for that verified identity.
- `POST /api/billing/checkout {plan}` returns `{url}`. GET compatibility retains plan intent. Only explicit server `STRIPE_*_PRICE_ID` values create new sessions. The Stripe Price is checked for active EUR monthly pricing, exact catalogue amount and non-inclusive tax behavior. Checkout uses subscription mode, card-only collection, `payment_method_collection=always`, trial_period_days14 and cancellation if a payment method is unexpectedly missing. Project text is never in URLs or Stripe metadata.
- Trial activation requires fetched complete Checkout, matching customer/account/subscription/attempt, canonical card payment method, Stripe trial start/end, and an atomic first claim. The actual Stripe trial_end is authoritative. No browser success URL grants access.
- Webhook signatures use the raw body. Webhook, cancellation and reconciliation share canonical Subscription/latest Invoice fetches. An older concurrent fetch cannot overwrite a newer snapshot; cancellation is latched for the current subscription. Events and positive paid billing periods have separate unique ledgers. Zero invoices do not grant monthly credits or count as first payment. Failed or authentication-required current payment states grant no new credit period.
- `GET /api/billing/status` returns selected plan, status, actual trialEnd/periodEnd, cancellation, invoice state, central access and credit balances. POST portal returns an authenticated session URL after verifying the supplied portal configuration supports invoice history, payment updates and cancellation at_period_end. POST cancel confirms current Stripe cancellation and returns accessUntil/trialEnd. POST reconcile re-fetches a linked subscription or completed pending Checkout to recover missing webhooks.
- Backend AI reservations call the central entitlement rule inside the account lock. Existing read routes remain available; expired rights cannot launch another paid AI run. Recruitment contact routes use `userHasRecruitingAccess`, not a UI flag.

## Existing accounts

The migration archives existing account generation. Existing one-time guest/free/trial balances remain usable; no old balance is reduced to the new zero default. A later card trial preserves the unspent legacy amount alongside the new trial grant. New period consumption is charged before retained legacy balance. Expiry removes the expired grant and keeps remaining legacy credit. Existing paid Stripe periods are honored through their recorded paid period; local legacy Enterprise contracts keep their agreed allowance. No historic invoice, placement contract or profile data is deleted.

Historic Payment Links remain readable for settlement of issued purchases; public new Checkout uses server Sessions. Historical fee invoices retain their settlement path. The new recruiting workflow never generates those fees. A fixed plan/status string alone is not sufficient for entitlement; use the central database rule and billing status response.

## Environment and external configuration

Required server variables, without values/secrets:

- STRIPE_SECRET_KEY; STRIPE_WEBHOOK_SECRET; existing Supabase server secrets.
- STRIPE_BASIC_PRICE_ID; STRIPE_PRO_PRICE_ID; STRIPE_BUSINESS_PRICE_ID — recurring EUR, interval month, quantity1, net catalogue9/19/50€.
- STRIPE_RECRUITING_PORTAL_CONFIGURATION_ID — active configuration with payment_method_update, invoice_history, subscription_cancel enabled and cancellation mode at_period_end. Review portal reactivation/retention behavior in sandbox before launch.

The REST adapter keeps API version2024-06-20. Official Checkout docs still support the legacy Checkout trial parameters; the current Trial Offers API explicitly does not support Checkout, so it is not used. Do not enable automatic_tax without verified tax registrations/product behavior. VAT collection, invoice tax treatment and company details require an actual sandbox/operator check.

Relevant webhook events: checkout.session.completed and async_payment_succeeded; customer.subscription.created/updated/deleted/trial_will_end; invoice.paid/payment_failed/payment_action_required/finalization_failed. Current objects are fetched instead of trusting arrival order. Configure the endpoint and exact signing secret separately in each environment.

**Launch blocked pending actual configuration/verification:** SaaS terms are draft (`SAAS_TERMS_REVIEW.checkoutEnabled=false`). Live Checkout is blocked; only sk_test_/rk_test_ keys may exercise this implementation until terms are approved. Configure Stripe's trial-ending reminder7 days before first billing in the actual test/live account; the 3-day trial_will_end webhook is not proof of reminder setup. Verify one reminder/cancellation link and no duplicate email behavior. No dashboard reminder, tax or portal configuration was modified in this run.

## Verification evidence and remaining acceptance

`node scripts/check-billing-schema.mjs` executes the production migration in an isolated PostgreSQL WASM fixture with auth/account schemas:26 assertions passed for zero signup/guest grants, preserved balances, shared attempts, card requirement, one trial, zero invoice exclusion, replay safety, self-limit safety, cancellation latch, older snapshot rejection, exhaustion, positive payment, retry idempotency, expired rights and service-only access. The underlying older quota implementation is a fixture stub; this is **not** a full Supabase RLS suite or concurrency stress test.

Pinned verifier dependency is installed outside the app checkout: `npm install --prefix ../billing-verification --ignore-scripts @electric-sql/pglite@0.3.14`; optional PGLITE_MODULE_PATH points to its index.js. No app runtime dependency was added. Run the existing unit suite for route/signature logic and `pnpm typecheck`/build.

Docker/Podman are unavailable, confirmed by Supabase CLI status. No configured Stripe sandbox was used for real Checkout, Test Clocks, invoice transitions or card-network reminder checks. Therefore all11 required billing acceptance paths still need actual isolated Stripe+Supabase staging execution: successful/aborted checkout, concurrency, expiry, trial cancellation, failed/SCA payment, recovery, replay/order/zero invoice, exhaustion, retry trial and existing customers. Mocked routes and PostgreSQL fixture checks do not replace those tests.

Further operational gaps: reconciliation is user-triggered via the account API; a scheduled sweep for inactive accounts is not configured. Transaction confirmation email failures are logged for recovery; durable retry/outbox delivery and trial-confirmation/reminder delivery need acceptance verification. Do not claim those as completed.

## Apply/rollback

Do not apply this migration or deploy to production before staging acceptance and explicit release approval. Capture an account/grant snapshot; apply migration together with app code. A rollback should disable new Checkout and restore previous app behavior without dropping identity/grant ledgers or rewriting consumed credits. Reverting code alone after schema migration does not safely undo trial grants; reconcile active trial/subscription accounts against Stripe first. Never change ongoing customers' subscriptions to test rollback.

Official sources checked in this run: [Checkout trials](https://docs.stripe.com/payments/checkout/free-trials), [Checkout Session parameters](https://docs.stripe.com/api/checkout/sessions/create), [Trial Offer integration limitations](https://docs.stripe.com/billing/subscriptions/trials), [Customer portal configuration](https://docs.stripe.com/customer-management/configure-portal), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). These support API behavior; they do not verify this project's live setup.
