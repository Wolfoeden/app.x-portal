# Deployment and rollback runbook

## Environments

Use separate Supabase projects and separate secrets for staging and production.
The current managed project region must remain an approved EU region. Never use
production user records as staging fixtures.

Required server variables are listed in `.env.example`. Copy it to
`.env.production` on the server and restrict that file to the deployment user.
Only
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, site URL,
Calendly URL and the public phone number may be exposed to the browser.

Required tools: Node.js 22.13+, pnpm 11.16, Docker with Compose, Git and
Supabase CLI 2.111.x (or a later version verified in staging). Run `supabase
init` only when `supabase/config.toml` is absent; never overwrite the committed
configuration.

## First deployment

1. Record the exact application commit and migration list.
2. Run `pnpm install --frozen-lockfile` and `pnpm check`.
3. Link and apply migrations to staging:

   ```powershell
   supabase login
   supabase link --project-ref <STAGING_PROJECT_REF>
   supabase migration list
   supabase db push --include-seed
   ```

   Only the designated release operator runs this, and only after checking the
   linked project name and EU region. Do not use `db reset --linked`.
4. Run database RLS tests, the browser smoke matrix and a forced AI timeout.
5. Run Supabase Security and Performance Advisors and resolve critical/high
   findings.
6. Build a commit-addressed container:

   ```powershell
   $env:APP_IMAGE_TAG = git rev-parse --short=12 HEAD
   docker compose --env-file .env.production build --pull app
   docker image inspect "app-x-portal:$env:APP_IMAGE_TAG"
   ```

7. Start behind the TLS reverse proxy:

   ```powershell
   docker compose --env-file .env.production up -d --no-build app
   ```
8. Verify `/api/health?deep=1`, authentication, a match journey and click-to-load
   Calendly.
9. Repeat the approved migration/deployment steps in production.

The Compose build passes only the five `NEXT_PUBLIC_*` values into the browser
bundle. Server secrets stay runtime-only. The example binds only to
`127.0.0.1`; the reverse proxy owns the public TLS endpoint. Replace the example
host and certificate paths before use.

## Database migrations

Migrations are forward-only, reviewed SQL. Before applying one:

- capture a managed backup/PITR marker;
- review locks and expected runtime;
- test on representative staging data;
- record the migration hash and operator.

Do not edit a migration after it has reached production. Create a corrective
migration.

## Application rollback

1. Record the running tag before every release and keep that image locally or in
   the approved private registry.
2. Set the previous tag and recreate only the application container:

   ```powershell
   $env:APP_IMAGE_TAG = "<PREVIOUS_12_CHARACTER_COMMIT>"
   docker image inspect "app-x-portal:$env:APP_IMAGE_TAG"
   docker compose --env-file .env.production up -d --no-build --force-recreate app
   ```
3. Run `/api/health?deep=1` and the launch smoke journey.
4. Preserve trace IDs and open an incident record.

Application rollback must not automatically reverse a database migration.
Destructive down-migrations require a separately reviewed recovery plan.

## Backup restore acceptance

Before launch, confirm that the selected managed plan provides the required
daily backup/restore method and record its RPO/RTO. Restore one backup through
the Supabase Dashboard or the plan's documented recovery workflow to a separate
recovery project. Never overwrite production to prove restore capability.

The evidence record must include plan, backup identifier/time, recovery target,
requested and actual RPO/RTO, start/end times, schema migration level, row-count
checks, RLS smoke result, owner and outcome. A healthy project alone is not
restore evidence; launch remains blocked until this acceptance test passes.
