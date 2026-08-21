# Netlify deployment and rollback runbook

## Production boundary

The canonical production path is:

```text
Wolfoeden/app.x-portal main
  -> Netlify app-x-portal-chat
  -> https://x-portal.eu
  -> managed Supabase production project
```

Netlify site ID: `a269db81-61d6-4f3b-95a1-01097bf8d256`.

Production is released only by GitHub continuous deployment from `main`.
Do not upload `.next`, run a manual Netlify production deploy or publish a
deploy preview to the custom domain. A ready preview is evidence for the PR,
not a production release candidate that may be promoted blindly.

Keep `@netlify/plugin-nextjs` in `netlify.toml`. Do not set Next.js
`output: "standalone"` for this site.

## Environments

Use separate Supabase projects and secrets for local development, staging and
production. Never use production records as fixtures.

The committed `netlify.toml` pins the non-secret production site URL to
`https://x-portal.eu`. Configure all secrets in the Netlify environment store
with the narrowest context scope.

Required production values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL=https://x-portal.eu` (also enforced in `netlify.toml`)
- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` (production-only in `netlify.toml`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `IP_HASH_SECRET` with at least 32 random characters
- `ADMIN_USER_IDS` or the preferred Supabase `app_metadata.role=admin` claim
- the approved public Calendly/contact values

Do not expose service-role, OpenAI or HMAC secrets with a `NEXT_PUBLIC_`
prefix. Preview values must not contain production secrets. A deploy preview
must use its real HTTPS origin for callbacks and an explicitly approved staging
Supabase redirect allowlist; localhost is local development only.

## Pull request gate

Before merge:

1. Review the complete diff and database migrations.
2. Require the GitHub `Quality gate` workflow to pass: locked install, lint
   with zero warnings, typecheck, tests, build and production dependency audit.
3. Require a ready Netlify deploy preview with `plugin_state=success`.
4. Smoke-test the preview against staging, including a forced OpenAI timeout.
5. For a migration, record the staging project, region, migration hash, lock
   expectation, representative-data result and backup/PITR marker.
6. Obtain the controller/operator approvals required by `acceptance.md`.

The PR remains draft while any required gate is missing.

## Production release

1. Record the approved Git commit and current published Netlify deploy.
2. Confirm Netlify's production branch is exactly `main`; investigate any
   `skipped=true` production build before continuing.
3. Merge the approved PR. Do not manually publish its deploy preview.
4. Wait for the GitHub-connected production deploy.
5. Verify through the Netlify deploy details:
   - `state=ready`;
   - `context=production`;
   - `branch=main`;
   - `commit_ref` equals the merged Git commit;
   - `plugin_state=success`;
   - the Next.js server handler function exists.
6. Verify the live security and product routes:
   - `/` redirects to `/home`;
   - `/home` returns 200;
   - `/chat` returns 200 with `noindex` and `private, no-store`;
   - `/api/health` returns 200;
   - `/api/health?deep=1` returns 200 and Supabase reachable;
   - `/auth/callback` never redirects to localhost or another host;
   - referenced Next.js assets return 200.
7. Run the approved production smoke journey: anonymous session, one bounded
   project analysis, deterministic shortlist/no-match behavior, explicit
   introduction, sign-in/claim, export and deletion test accounts.
8. Record deploy ID, commit, migration level, smoke result, operator and time.

If the deploy does not match the approved commit, production is not released
even when the website returns 200.

## Supabase migrations

Migrations are forward-only and are applied by the designated operator after
confirming the linked project name and approved EU region.

Before applying a migration:

- capture a managed backup/PITR marker;
- compare the remote migration list with Git;
- test RLS/grants and query plans in isolated staging;
- review locks and expected runtime;
- record the migration hash and operator.

Do not run `db reset --linked`. Do not edit a migration after it has reached
production; create a corrective migration.

Application rollback must not automatically reverse a database migration.
Destructive down-migrations require a separately reviewed recovery plan.

### Ordering for the token-metered AI balance

The application commit that meters chat requests from token usage must not
reach production before `20260821120000_monthly_ai_credit_period.sql` is
applied. Without the period columns the balance is a lifetime allocation, so an
exhausted account is locked out permanently instead of until the first of the
next month, and there is no self-service purchase path yet.

Apply in this order:

1. the migration to staging;
2. `supabase test db`, including `ai_credit_period.test.sql`;
3. the same migration to production;
4. the application deploy.

Before that deploy, confirm `AI_CREDITS_GUEST_TOTAL` and
`AI_CREDITS_USER_TOTAL` in Netlify. Stale pre-metering values of 2,500 and
50,000 would grant roughly 138 and 2,700 requests per month instead of 5 and
50.

An application rollback past that commit is safe: the period columns are
additive and the previous code does not read them.

## Application rollback

Rollback is a controlled Netlify operation to the most recent known-good
**production `main` deploy**. Never roll back by publishing a deploy preview.

1. Record the failing deploy ID, commit, symptoms and trace IDs.
2. Confirm the target deploy was built from `main`, has `state=ready`,
   `plugin_state=success` and the expected server handler.
3. Publish the selected prior production deploy in Netlify.
4. Re-run the route, auth-callback, health and asset checks above.
5. Record the active deploy ID and open an incident/corrective PR.

If a forward database migration is incompatible with the previous app, stop
and follow its reviewed compatibility/recovery plan. Do not improvise a schema
rollback on production.

## Backup restore acceptance

Before public launch, confirm that the selected Supabase plan provides the
approved backup/restore method and record its RPO/RTO. Restore one backup to a
separate recovery project. Never overwrite production to prove recovery.

Record plan, backup identifier/time, recovery target, requested and actual
RPO/RTO, start/end times, migration level, row-count checks, RLS smoke result,
owner and outcome. A healthy production project is not restore evidence.

## Incident minimum

1. Stop promotion and preserve the current deploy/commit identifiers.
2. Disable the affected provider path or rotate exposed secrets when needed.
3. Preserve redacted logs and trace IDs; never copy chat bodies or credentials.
4. Roll back only through the verified production path above.
5. Determine affected users, records and time window.
6. Record root cause, corrective action and re-verification.
