# Monthly AI usage and product-credit RPC contracts

This contract separates three concepts:

- `ai_free_usage_accounts`: successful normal Nano analyses per UTC calendar
  month (guest: 10, permanent account: 100).
- `product_credit_accounts`: purchased product-credit balance. One credit has
  the commercial list value configured by the application; the database stores
  integer credits, never euros or card/bank data.
- `user_ai_credit_accounts`: the pre-existing technical/provider ledger. It is
  historical and must not be converted into either of the balances above.

All functions below are executable only by `service_role`. The server must use
the Supabase user ID established by the authenticated or anonymous session; it
must never accept a client-supplied user ID as authority.

## Free monthly Nano analysis

```text
get_monthly_ai_usage_snapshot(
  p_user_id uuid,
  p_is_anonymous boolean
) -> user_id, is_anonymous, period_start, period_end,
     usage_limit, used, reserved, remaining
```

The period is a UTC calendar month. The function creates the current period on
first access and releases reservations older than 15 minutes.

```text
reserve_monthly_ai_usage(
  p_user_id uuid,
  p_is_anonymous boolean,
  p_request_key text
) -> allowed, reason, reservation_id, period_start, period_end,
     usage_limit, used, reserved, remaining
```

Caller behavior by `reason`:

| Reason | Provider call permitted? | Meaning |
|---|---:|---|
| `reserved` | yes | First reservation; exactly one call may start. |
| `monthly_limit` | no | Run deterministic fallback/matching; no Nano call. |
| `already_reserved` | no | Request is in flight; never call twice. |
| `already_consumed` | no | Request already succeeded and consumed one use. |
| `already_released` | no | Terminal failed/expired request; use a new request key only for an explicit retry. |
| `request_key_conflict` | no | Key belongs to another identity. Fail closed. |
| `invalid_input` | no | Reject the request. |

```text
settle_monthly_ai_usage(
  p_user_id uuid,
  p_request_key text,
  p_outcome text
) -> recorded, reason, period_start, period_end,
     usage_limit, used, reserved, remaining
```

`succeeded` moves exactly one unit from reserved to used. `provider_error`,
`timeout`, `invalid_response` and `cancelled` release it without increasing
used. Settlement is user-bound and idempotent.

## Purchased product credits

```text
get_product_credit_snapshot(p_user_id uuid)
  -> user_id, balance, reserved, available
```

Only a permanent authenticated account is valid. Anonymous users cannot own or
spend purchased credits.

For the pilot, a named operator grants credits through the RPC below rather
than editing account rows in Studio:

```text
grant_product_credits(
  p_user_id uuid,
  p_idempotency_key text,
  p_amount bigint,
  p_reason text,
  p_actor_reference text
) -> recorded, reason, ledger_entry_id, balance, reserved, available
```

Use an opaque stable server reference as `p_idempotency_key` (for example an
HMAC of a confirmed bank-transfer reference, never the raw reference) and a
non-secret named operator reference. Exact
replay returns `already_recorded`; changed data under the same key returns
`idempotency_conflict`. Every successful grant creates an immutable ledger and
redacted audit record.

```text
reserve_product_credits(
  p_user_id uuid,
  p_request_key text,
  p_purpose text,
  p_amount bigint default 30
) -> allowed, reason, reservation_id, balance, reserved, available
```

For `external_freelancer_search`, the database enforces exactly 30 credits.
`insufficient_credits`, exact replay and key conflicts all return
`allowed=false`; the provider must not be called. Open reservations expire and
release after 15 minutes.

Technical failure is settled with:

```text
settle_product_credit_reservation(
  p_user_id uuid,
  p_request_key text,
  p_outcome text
) -> recorded, reason, balance, reserved, available
```

For external search, only `technical_error`, `timeout`, `invalid_response` or
`cancelled` are valid through this path and release all 30 credits. Successful
external search must use the atomic result function below. A direct successful
settlement returns `result_snapshot_required` without charging.

## Retryable paid external-search result

Before a provider call, the server may check for an already completed result:

```text
get_external_search_result(
  p_user_id uuid,
  p_project_id uuid,
  p_request_key text
) -> result_found, result_count, result_snapshot,
     provider_response_id, actual_model, created_at
```

After server-side schema/evidence validation and capping to at most three public
candidate cards, commit result and charge in one transaction:

```text
complete_external_search(
  p_user_id uuid,
  p_project_id uuid,
  p_request_key text,
  p_result_snapshot jsonb,
  p_provider_response_id text,
  p_actual_model text
) -> recorded, reason, result_count, result_snapshot,
     balance, reserved, available
```

A zero-result array is a completed research operation and charges 30 credits.
Exact retry returns `already_completed` plus the stored result and never debits
again. The result belongs to both the authenticated owner and their project.
It is not inserted into the curated internal freelancer catalogue.

## Retention, deletion and access

- Browser roles receive no direct table or RPC mutation grants; RLS owner
  policies remain as defense in depth.
- Auth-user deletion cascades current accounts, reservations and external
  result snapshots. The minimal product-credit ledger unlinks its owner and
  retains financial amounts/reasons for the controller-approved period.
- `run_credit_retention_cleanup()` applies the configured hard-delete periods
  daily at 02:30 UTC. Product-ledger deletion remains `operator_review`.
- `external_freelancer_search_results` is included in user export and must be
  added to the application export route together with the two new account
  snapshots and the user's product-credit ledger.

The database acceptance suite is
`supabase/tests/database/monthly_product_credits.test.sql`.
