# AI usage, free analyses and product credits

## Product boundary

XPORTAL has three deliberately separate meters:

1. `ai_usage_reservations` records provider usage, model metadata and locally
   calculated provider-cost estimates. It is an operational ledger, not a
   customer balance.
2. `ai_free_usage_accounts` grants normal GPT-5.4 Nano project analyses per
   calendar month: 10 successful analyses for a guest and 100 for an account.
3. `product_credit_accounts` stores purchased or operator-granted product
   credits. In V1, an external freelancer web search costs 30 credits.

`user_ai_credit_accounts` was previously a provider-control artifact that
could not gate a request: the application hardcoded both the credit hold and
the debit to zero. It is now the token-metered customer balance. A chat request
is charged from the real provider token counts of its own response, so a short
brief costs less than a long one.

The free monthly allowance is sized from the measured price of a brief:
5 requests for a guest and 50 for an account, at a measured p90 of 21 credits
per request. Both totals are environment-tunable through
`AI_CREDITS_GUEST_TOTAL` and `AI_CREDITS_USER_TOTAL` and reset on the UTC
calendar month.

Credits are still never converted into product credits, and product credits
keep their own pricing: external freelancer research is expected to move to a
different model and is metered separately.

The flat 10/100 counter that `ai_free_usage_accounts` implemented is no longer
read, written or displayed. The table and its RPCs remain for the historical
record and the account export; the balance above is the only meter.

## Models and matching

Normal project extraction and explicit external research are pinned in server
code to `gpt-5.4-nano-2026-03-17`. Environment variables cannot switch either
route to Pro, Luna, Terra or a gateway. Requests use the official OpenAI API,
`store=false`, reasoning effort `none`, no provider retry and bounded output:

- brief extraction: at most 600 output tokens;
- external research: at most 1,200 output tokens and three web-search calls.

OpenAI structures the customer's own text only. Curated freelancer profiles
are not sent to OpenAI. The internal shortlist is produced by the deterministic
and versioned TypeScript matcher. Only explicitly marked mandatory or exclusion
requirements are hard filters; absent profile facts remain visible gaps.

## Free monthly analysis lifecycle

1. The original user message and project are saved before provider work.
2. `reserve_monthly_ai_usage` atomically reserves one use for the current UTC
   calendar month and user identity.
3. A successful, schema-valid Nano analysis consumes one use.
4. Provider errors, timeout, invalid output and cancellation release the use.
5. Reload, idempotent replay and deterministic project reconstruction consume
   no additional use.
6. Reservations older than 15 minutes are released during the next snapshot,
   reserve or settle operation.

The lower-left account area displays this as `remaining / limit`. Guests never
see a label such as "Guest credits". Account users see this allowance and their
separate product-credit balance.

## Product credits and external research

The commercial definition is fixed for this release:

- 1 credit = EUR 25 / 1,500 = EUR 0.0166666667;
- one external freelancer search = 30 credits = EUR 0.50.

External research is account-only and starts only after an explicit button
confirmation. The server rechecks that the current curated shortlist is empty,
reserves 30 credits atomically and performs at most one provider request. A
completed search is charged even when no sufficiently evidenced candidate is
found. Technical failure, timeout or invalid response releases the 30 credits.
The request key is idempotent, and the paid result snapshot is stored so a lost
HTTP response can be recovered without a second charge.

Every external candidate must be supported by public source evidence, a public
profile URL and a direct HTTPS booking URL tied to the same identity. At most
three candidates are returned, separately labelled `external_unverified`.

V1 has no Stripe, bank-transfer or self-service credit purchase. A named
operator may grant credits only through the service-only
`grant_product_credits` RPC with an idempotency key, amount, reason and actor
reference. The append-only product-credit ledger records every grant and debit.

## Provider usage and cost reporting

Provider usage is reserved before the OpenAI call and settled with the actual
response ID, returned model and token counts when available. Exact integer
nano-USD calculations use the versioned model-price registry. A provider
estimate is not an OpenAI invoice and must be displayed separately from
confirmed usage. If usage is genuinely unknown after a timeout or process
failure, the conservative reservation remains for reconciliation; it is never
presented as confirmed spend.

The customer-facing 10/100 allowance and product credits do not depend on token
counts. Provider controls remain independent:

| Environment value | Default | Purpose |
|---|---:|---|
| `AI_REQUESTS_PER_MINUTE` | 6 | Per-user and per-IP burst protection |
| `AI_WEB_SEARCH_REQUESTS_PER_MINUTE` | 2 | Additional paid-search burst protection |
| `AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_GUEST` | 500,000 | Provider-only guest/IP safety ceiling |
| `AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_USER` | 5,000,000 | Provider-only account safety ceiling |
| `AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_ADMIN` | 10,000,000 | Provider-only operator safety ceiling |
| `AI_MONTHLY_PROVIDER_BUDGET_CENTS` | 5,000 | Provider-wide conservative hard stop |
| `AI_UNKNOWN_MODEL_ESTIMATED_COST_CENTS` | 100 | Unknown-model preflight fallback |

The daily provider ceilings are intentionally above the maximum normal monthly
Nano allowance and are not advertised as customer entitlements. Setting a
provider safety value or monthly budget to `0` is an operational hard stop.

## Privacy, access and operations

All quota and credit tables use RLS, have no browser mutation grants and are
changed only by service-role RPCs. User-bound settlement prevents one server
operation from settling another user's reservation. Account deletion cascades
active accounts and reservations; retained ledger rows lose the direct user
link and remain only as the approved financial/audit trace.

The account export includes the user's current monthly allowance, product
balance, product ledger and paid-search snapshots. No prompt body, raw IP,
identity token, API key or provider payload is written to usage logs.

`/chat/admin/ai-usage` separates:

- confirmed provider calls and locally calculated token cost;
- estimated or reconciled provider usage;
- successful monthly Nano uses;
- product-credit balance, reservations and ledger effects;
- historical token-weighted control data, clearly labelled as historical.

## Release verification

- Unit and route tests: `npm test` or the repository's documented desktop
  Vitest configuration.
- Database tests: `supabase test db` against an isolated local/staging project.
- Before production: Supabase migration dry-run, lint, typecheck, tests,
  production build, secret scan and one controlled live Nano request.
- After production: verify the GitHub `main` commit matches Netlify, `/chat`
  and `/api/health` return 200, the response reports the Nano snapshot and the
  OpenAI project shows exactly the controlled request.
