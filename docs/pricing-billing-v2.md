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

The migration `20260915143000_pricing_billing_v2.sql` makes rollover depend on
the stored plan id. Basic, Pro, Business and Enterprise Legacy reset to their
exact allowance at a new UTC month; unused included credits are not added.
Trial and guest periods advance for reporting but usage is not cleared and no
new grant is made. `trial_granted_at` is permanent evidence that the one-time
entitlement was created. Converting an anonymous guest into a real account
creates the account trial once; later login and snapshot calls preserve it.

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

## Stripe configuration still required

The three supplied Stripe URLs and the Payment-Link ids exposed by their
public checkout metadata are assigned to Basic, Pro and Business in
`lib/billing/payment-links.ts` and repeated in `.env.example` as deploy-time
overrides.

- `NEXT_PUBLIC_STRIPE_BASIC_PAYMENT_LINK` + `STRIPE_BASIC_PAYMENT_LINK_ID`
- `NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK` + `STRIPE_PRO_PAYMENT_LINK_ID`
- `NEXT_PUBLIC_STRIPE_BUSINESS_PAYMENT_LINK` + `STRIPE_BUSINESS_PAYMENT_LINK_ID`

URLs and ids alone do not enable checkout. On 2026-09-15, live read-only checks
showed that Business is a recurring monthly subscription, while Basic and Pro
are configured as one-time payments and still contain "XPORTAL Enterprise" in
their product description. The two independent fail-closed
switches `NEXT_PUBLIC_STRIPE_FIXED_PLANS_CHECKOUT_ENABLED=true` and
`STRIPE_FIXED_PLANS_ACTIVATION_ENABLED=true` may be set only after the external
subscription lifecycle (including corrected recurring Basic/Pro prices,
renewal, cancellation, failed payment, tax/VAT and documents) has been
configured and verified. Until then every fixed-plan CTA goes to an inquiry
and the webhook refuses plan activation.

The webhook selects a plan only from the server-side Payment-Link-id allow
list. An unknown or missing id is acknowledged but never activates an account.

Enterprise Flex is available only by email to `roman@dering.info` until the external invoicing,
tax/VAT, retention and Stripe metered-billing workflow has been configured and
commercially verified. Internal usage measurement and exact monthly net totals
do not claim that Stripe invoicing is already automated.
