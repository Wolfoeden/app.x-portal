# Freelancer Assistant V1

A desktop-first, ChatGPT-familiar freelancer search experience. A visitor can
describe a project in free text, receive a structured brief and see up to three
deterministically matched freelancer profiles. The customer always chooses a
profile and explicitly requests an introduction.

## V1 boundary

Included:

- anonymous Supabase session without a visible sign-up gate;
- upgrade to Google, Microsoft or verified email/password identity;
- persisted projects and minimal conversation state with Row Level Security;
- server-side OpenAI Responses API brief extraction with `store: false`;
- deterministic matching against curated Supabase profiles;
- free introduction or premium/manual-approval introduction workflows;
- click-to-load Calendly, direct human contact, export and deletion paths;
- Supabase Studio/Table Editor as the trusted internal operator interface.

Explicitly excluded:

- payments, invoices, Stripe and bank-transfer workflows;
- AI scoring, ranking or selection of freelancer profiles;
- custom admin UI;
- travel, food, medical, wallet/NFT and other product modules;
- mobile application work.

## Local development

Requirements: Node.js 22.13 or newer, pnpm 11.16.0, Docker and Supabase CLI
2.111.x (or a later staging-verified version).

1. Copy `.env.example` to `.env.local` and fill the Supabase public values.
2. Enable Anonymous Sign-Ins and manual identity linking in Supabase Auth.
3. Configure Google and Azure providers if those buttons should be live.
4. For a local reset run `supabase start` and `supabase db reset`. For managed
   staging run `supabase link --project-ref <STAGING_PROJECT_REF>`, verify with
   `supabase migration list`, then run `supabase db push --include-seed`.
5. Add server-only `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and a random
   `IP_HASH_SECRET` of at least 32 characters.
6. For a stable local test instance on port 3001, run:

```powershell
pnpm install --frozen-lockfile
pnpm local:start
```

Open `http://localhost:3001/`.

The Netlify production build sets `NEXT_PUBLIC_APP_BASE_PATH=/chat`, so the
application and its server routes are emitted below `x-portal.eu/chat`. Local
development keeps the root path unless that environment variable is supplied.

`local:start` creates a production build, starts it as a detached Windows
process and stores its PID and logs below `.local/`. It refuses to start a
second server when the port is already occupied. Use these commands to inspect
or stop the instance:

```powershell
pnpm local:status
pnpm local:stop
```

For active UI development, `pnpm dev -- --port 3001` is still available, but
that foreground development server lives only as long as its terminal and is
not the persistent local test instance.

Without the OpenAI key, the original request is still persisted and the
deterministic fallback remains usable. Real provider calls must never be
implemented client-side.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The database isolation suite is stored under `supabase/tests`. Run it against
an isolated local/staging database, never production:

```powershell
supabase test db
```

See [acceptance.md](docs/acceptance.md) for launch evidence and
[deployment-and-rollback.md](docs/deployment-and-rollback.md) for server
handover.

## Trust boundary

The browser receives only the Supabase publishable key. RLS remains the primary
database boundary. The Supabase secret/service role and OpenAI key are
server-only. Supabase Studio is for a named, trusted operator and grants broader
project access than a table-specific custom admin would; MFA and the operator
runbook are therefore mandatory.
