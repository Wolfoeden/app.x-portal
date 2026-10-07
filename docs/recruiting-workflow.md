# Recruiting workflow handoff — 2026-10-07

Implemented and tested locally; no production migration, SMTP send, deployment or legal approval is claimed.

## New API and financial boundary

`POST /api/introductions` requires a verified account email, central `userHasRecruitingAccess`, explicit `contactConsent:true`, project/profile UUIDs and an idempotency key. Ownership and stored shown-profile evidence are checked. Existing shared free calendars remain directly usable; otherwise one explicitly selected profile receives a freelancer-controlled consent request. Imported research addresses without an approved application and recorded consent are excluded. No Roman approval is involved. `retryDelivery:true` explicitly retries eligible persisted deliveries; repeated ordinary requests do not resend.

`GET /api/introductions` reads only the current owner's project/profile request. It includes approved contact details only after recorded freelancer consent. `/api/introductions/consent` GET exposes no client email; POST accepts or declines via a recipient-bound HMAC capability valid for seven days. Atomic acceptance records consent plus two private confirmation deliveries. A changed recipient invalidates the capability. Interest, availability and project readiness remain unconfirmed. Conversations expose `commercialModel`; no_fee conversations do not prompt manual fee followups.

New creation uses immutable `commercial_model=no_fee`. Migration 20261007174234 labels existing introductions, engagements and mandates legacy_placement before changing defaults. Historical contract values, consent audits and invoices are preserved. New legacy introductions require a historical mandate reference. Engagements inherit their introduction's model; no_fee cannot contain a commission, placement invoice or placement terms. Application fee calculations and background invoicing/followups distinguish both models. Legacy manual mandates remain readable, while their old public creation route returns 410 with the existing workspace criteria-edit path.

Migration 20261007210832 adds a service-only delivery outbox, atomic consent/confirmation enqueue and exclusive five-minute dispatch leases with at most five attempts. Browser roles cannot read addresses or call dispatch/consent RPCs. Dispatch occurs in a consciously triggered request/retry, never a mass outreach worker. The private confirmed contact view works even when confirmation email fails. SMTP delivery remains at-least-once in a process-crash window; physical exactly-once delivery is not guaranteed by SMTP.

## Operational controls and matching

Raw source remains saved. Workflow instructions are removed only from candidate evidence, while `deriveWorkflowControls` retains and enforces operation permissions. A project saying no external research/no contact blocks the corresponding backend routes. A later explicit source permission changes only that operation. Chat's external-search action is hidden when source bans research; already-paid result retrieval remains readable. Real candidate obligations, hard criteria, skill exclusions and unknown evidence remain distinct. Previously saved operator constraints are ignored during matching.

## Verification actually executed

- Latest targeted suite: 20 files, 169 tests passed (placement, instruction/control regressions, matching/data/leadgen, introductions/search-mandate/answer APIs).
- Actual SQL migrations executed against isolated PGlite PostgreSQL: 19 checks passed, including historical financial preservation, immutable tags, fee/invoice rejection, duplicate request index, historical inheritance, exclusive delivery lease, atomic/replayed acceptance, confirmation count and authenticated role denial.
- Intermediate typecheck: no recruiting errors; only concurrent frontend `CreditSummary.euroPerCreditCents` catalog mismatch remained at that instant. Root owns final type/build gates.
- Focused lint is being completed by root/current checkpoint; read current tool evidence before claiming its result.

SQL test runtime was installed outside the repository: npm install --prefix ../recruiting-sql --save-exact @electric-sql/pglite@0.5.8 . Reproduce from repository root in PowerShell:

```powershell
$env:PGLITE_MODULE_PATH = '..\recruiting-sql\node_modules\@electric-sql\pglite\dist\index.js'
node scripts/check-recruiting-schema.mjs
```

Fixture scope is deliberately disclosed: these are actual PostgreSQL SQL/function/grant tests on a minimal prior schema. Hosted Supabase, full historical migration chain and complete existing RLS owner policies were not executed. No hosted credentials are used.

## Remaining work and exact limitations

1. Apply both migrations to an isolated Supabase environment and execute full historical migration/RLS/advisor checks before production. Deploy schema before code; without required tables/functions new paths fail closed.
2. Exercise actual contact API lifecycle in the isolated database with mocked SMTP: ownership denial, recipient change, concurrent request/acceptance, delivery failure/explicit retry, crashed dispatch leases and in-app authorized contacts. SQL behavior and focused route tests pass; full API/outbox integration is not yet verified.
3. Verify frontend consumes contactConsent, commercialModel, requested/ready_to_book/cancelled, failed delivery and retryDelivery consistently. Signed /kontaktfreigabe UI is frontend-owned. Existing source restrictions must survive project edits, saved-project recovery and registration/checkout continuity end to end.
4. Review contact permission and legal text. Existing application/account confirmation is the implemented technical notification eligibility; legal review for the new workflow is still outstanding.
5. No scheduled automatic mail-retry worker was introduced. Recovery is explicit user-triggered and bounded; an optional operational reconciliation job must reuse private leases and recipient authorization, never send unrequested outreach.
6. Legacy createMandate helper remains behind the closed public route for compatibility. Audit future callers before reuse; do not reintroduce a new fee-bearing manual flow.
7. Final full lint/typecheck/build/E2E gates and screenshots are root/frontend work. Historical approved placement terms remain only historical terms; do not label the new SaaS terms legally approved.

## Configuration and rollback

Existing server-only EMAIL_UNSUBSCRIBE_SECRET must have at least 32 characters; consent uses a separate HMAC purpose. Existing SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM configure delivery. No secrets are recorded here. Keep additive schema and immutable commercial tags on rollback; disable new creation rather than allowing old fee workflows to capture new SaaS users. Preserve historical contracts/invoices. Official sources consulted: local Next.js 16.3.6 route-handler docs, Supabase changelog and trigger docs, and https://pglite.dev/docs/ .
