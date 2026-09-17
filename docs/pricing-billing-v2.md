# Pricing and billing v2

## Commercial source of truth

`lib/billing/plans.ts` is the application source for plan ids, billing models,
net prices and allowances. UI, checkout activation, quota code and order
confirmation import this catalogue. `CREDIT_PRICES` in
`lib/ai/credit-policy.ts` remains the sole source for action prices.

| Plan id | Billing | Net price | Credits |
|---|---|---:|---:|
| `trial` | one-time grant | EUR 0 | 300 once |
| `basic` | fixed monthly | EUR 9 | 500/month |
| `pro` | fixed monthly | EUR 19 | 1,250/month |
| `business` | fixed monthly | EUR 50 | 4,000/month |
| `enterprise_flex` | metered | EUR 0 base fee | EUR 0.02/consumed credit |

`guest` remains a small technical one-time allowance and is not a public
tariff. `free` and `enterprise` stay readable compatibility ids. The migration
changes active `free` rows to `trial` without granting credits and changes
active `enterprise` rows to `enterprise_legacy`. The latter retains the exact
historic EUR 50 / 3,000-credit contract.

## Renewal and one-time grants

The migration `20260916161917_stripe_subscription_lifecycle.sql` binds Basic,
Pro and Business to Stripe's real subscription period. Checkout completion
stores only the customer/subscription mapping. Credits are set to the exact
plan allowance only by a signed, allow-listed `invoice.paid` event. A local
calendar rollover never creates a paid entitlement: after `period_end` the
balance becomes zero until the next paid invoice arrives. Failed payments and
subscription updates change status without resetting already-paid credits.

Trial and guest periods remain one-time grants. Their reporting period may
advance, but usage is not cleared and no new grant is made. `trial_granted_at`
is permanent evidence that the entitlement was created. Converting an
anonymous guest into a real account creates the account trial once; later
login and snapshot calls preserve it. Historical `enterprise_legacy` accounts
retain their pre-existing calendar renewal behaviour.

## Enterprise Flex ledger and invoicing

The existing `ai_usage_reservations` table remains the ledger of record. V2
adds the actor, billing owner, snapshotted billing model/rate, billing period,
billable flag and invoice link. `consume_ai_quota_v2` preserves request-key
idempotency and provider safety limits. It skips only the prepaid credit
ceiling for `enterprise_flex`; it does not create a fictitious allowance.

`record_ai_usage_v2` marks metered usage billable only when credits are greater
than zero and the outcome is `succeeded` or `reconciled_estimate`. Provider
errors, cancelled calls and zero-credit outcomes do not enter an invoice.
Team calls keep the executing `actor_user_id`, while `user_id` remains the
billing owner selected by the established team resolution.

`prepare_enterprise_usage_invoice` refuses a closed period with unsettled
requests, locks the owner/period, sums only billable and unassigned entries,
creates one unique invoice record and links every included ledger row in the
same transaction. A retry returns the same invoice. Net amount is exact integer
arithmetic: `consumed_credits * 2` cents.

## Stripe subscription configuration

The three supplied Stripe URLs, their Payment-Link IDs and their recurring
Price IDs are assigned to Basic, Pro and Business in
`lib/billing/payment-links.ts` and `.env.example`.

- `NEXT_PUBLIC_STRIPE_BASIC_PAYMENT_LINK` + `STRIPE_BASIC_PAYMENT_LINK_ID`
- `NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK` + `STRIPE_PRO_PAYMENT_LINK_ID`
- `NEXT_PUBLIC_STRIPE_BUSINESS_PAYMENT_LINK` + `STRIPE_BUSINESS_PAYMENT_LINK_ID`
- `STRIPE_BASIC_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_BUSINESS_PRICE_ID`
- `NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL`

The marketing CTA first establishes an authenticated XPORTAL account, then
opens the selected Stripe link with its non-secret account UUID as
`client_reference_id`. There is no contact-form fallback. The two independent
fail-closed switches `NEXT_PUBLIC_STRIPE_FIXED_PLANS_CHECKOUT_ENABLED=true`
and `STRIPE_FIXED_PLANS_ACTIVATION_ENABLED=true` remain off until all three
links are recurring monthly subscriptions, Price IDs are allow-listed, the
customer portal is active, and the webhook listens to the five lifecycle
events used by the route.

The webhook maps checkout only from the server-side Payment-Link-ID allow list
and grants credits only from the separate Price-ID allow list. Its five events
are `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
`customer.subscription.updated` and `customer.subscription.deleted`. Unknown
prices never activate an account; a known event that arrives before its
checkout mapping returns 503 so Stripe retries it.

Invoices, payment methods and cancellation stay in Stripe's hosted customer
portal. XPORTAL stores only the identifiers and lifecycle status required for
entitlements; it does not duplicate Stripe's invoice history.

Enterprise Flex is available only by email to `roman@dering.info` until the external invoicing,
tax/VAT, retention and Stripe metered-billing workflow has been configured and
commercially verified. Internal usage measurement and exact monthly net totals
do not claim that Stripe invoicing is already automated.
