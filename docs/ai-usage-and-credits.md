# AI usage and XPORTAL credits

## Boundary

`ai_usage_reservations` is the canonical provider-request ledger. A request is
reserved before OpenAI is called and settled exactly once with the actual model,
token details, estimated provider cost and internal credit consumption.
`ai_usage_events` is only a service-role, settled-row view over that table; it
does not duplicate usage records.

XPORTAL AI credits are versioned internal product units. They are not OpenAI
tokens, currency, stored value or a payment instrument. This release has no
purchase, transfer, refund or cash-redemption path.

## Current policy

The policy in `lib/ai/credit-policy.ts` counts weighted token work:

| Usage | Weighted units per token |
|---|---:|
| Cached input | 1 |
| Uncached input | 10 |
| Output | 60 |

One XPORTAL AI credit covers 1,000 weighted units, rounded up per settled
request. Purpose/model multipliers are explicit, centralized and versioned; the
current MVP multipliers are 1.0. Never infer a historical balance using a newer
policy version: every reservation stores its own `credit_policy_version`.

The provider-price registry in `lib/ai/model-pricing.ts` is independent of this
policy. It stores exact integer nano-USD rates and the source/check date. Cached
input is a subset of input. The actual provider-returned model takes precedence
over the requested model. Explicit dated `gpt-5.6-luna-YYYY-MM-DD` snapshots use
the reviewed Luna family price; other unknown models still record token/credit
usage but leave precise cost null rather than inventing a rate.

## Default controls

| Environment value | Default | Purpose |
|---|---:|---|
| `AI_CREDITS_GUEST_TOTAL` | 500 | Initial internal guest allocation |
| `AI_CREDITS_USER_TOTAL` | 50,000 | Initial internal account allocation |
| `AI_DAILY_TOKEN_LIMIT_GUEST` | 20,000 | Daily provider-token ceiling per anonymous user and HMAC IP |
| `AI_DAILY_TOKEN_LIMIT_USER` | 100,000 | Daily provider-token ceiling per account |
| `AI_REQUESTS_PER_MINUTE` | 6 | Per-user and per-IP burst limit |
| `AI_MONTHLY_PROVIDER_BUDGET_CENTS` | 5,000 | Conservative provider-wide monthly hard stop |
| `AI_UNKNOWN_MODEL_ESTIMATED_COST_CENTS` | 100 | Conservative preflight reservation when requested-model pricing is unknown |

Defaults initialize new credit accounts; they do not overwrite existing
balances. Guest identities are Supabase anonymous users. Their raw IP address is
never stored: the server derives a rotating HMAC value, which also prevents a
fresh browser session from trivially bypassing the anonymous daily-IP limit.
Setting a credit total, daily-token limit or monthly provider budget to `0` is
an explicit hard stop; invalid or missing values use the documented defaults.

## Request lifecycle

1. The server validates and persists the original project request.
2. It estimates the request-specific input/output ceiling.
3. `consume_ai_quota` atomically checks minute/day/provider caps and reserves
   the estimated XPORTAL credits.
4. Only an allowed reservation may reach OpenAI; the request uses `store=false`.
5. `record_ai_usage` settles actual input, cached input, output, total tokens,
   actual model, response ID, precise known cost and actual credits.
6. Provider failure/timeout is settled with reported usage when it is available.
   Zero is recorded only when the server can prove that no provider request was
   attempted. Missing or invalid usage remains reserved and fail-closed.
7. Replaying an identical request key never triggers a second provider call;
   conflicting ownership or metadata returns `request_key_conflict` without a
   credit snapshot.
8. Every five minutes, `reconcile_stale_ai_usage` closes reservations older than
   15 minutes with their conservative estimate and outcome
   `reconciled_estimate`. This prevents both free unmetered calls and permanently
   stranded credit reservations after a process timeout or deployment.

The deterministic brief fallback always retains the original request and keeps
the project usable when quota, credits, provider budget or OpenAI fails.

## User and administrator views

The `/chat` header shows only internal credit total/used/reserved/remaining. It
does not expose provider cost or call credits “tokens”. The snapshot endpoint
derives the current Supabase identity server-side and accepts no user ID.

`/chat/admin/ai-usage` is a protected, read-only report for named,
non-anonymous administrators. It shows totals, model breakdown, user balances
and recent settled interactions without chat bodies, raw IPs, secrets, identity
tokens or provider payloads. Access requires `app_metadata.role=admin` (or the
server-only `ADMIN_USER_IDS` allow-list) and must be paired with MFA. The
sensitive view fails closed when its required database audit entry cannot be
stored.

Profile maintenance remains in Supabase Studio; the usage page is not a general
admin system.

## Operations and reconciliation

- Do not edit reservations, counters or settled usage rows manually.
- Alert on provider hard-stop proximity, insufficient-credit spikes, failed
  reconciliation jobs and any reservation still unsettled after 20 minutes.
- The service-only `reconcile_stale_ai_usage(interval, integer)` function is the
  approved stale-request procedure. It must retain the preflight estimate when
  actual provider usage is unavailable; never replace possible usage with zero.
- For an approved allowance correction, update only
  `user_ai_credit_accounts.credits_total` in staging first, never below
  `credits_used + credits_reserved`; record approver, reason and before/after
  values outside customer-visible data.
- The approved application deletion path conservatively settles in-flight
  reservations as `reconciled_estimate`, then removes direct/HMAC associations
  before deleting the Auth user. The database trigger applies the same safe
  closure if an Auth user is deleted directly. Aggregate settled facts may
  remain only under the approved retention schedule.

## Verification

- Unit: `tests/ai/model-pricing.test.ts`, `tests/ai/credit-policy.test.ts`,
  `tests/ai/gateway.test.ts`.
- Database: `supabase/tests/database/ai_credits.test.sql` in isolated local or
  staging Supabase. It covers service-only access, atomic reserve/settle,
  idempotency, cross-user conflicts, guest/IP limits and deletion unlinking.
- Release: run lint, typecheck, unit tests, production build and the database
  suite before applying the migration to production.

Usage history starts when migration
`20260810120000_ai_usage_credits.sql` is applied. There is no fabricated
backfill for earlier provider calls.
