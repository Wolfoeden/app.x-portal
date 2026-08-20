# Supabase Studio operator runbook — Freelancer V1

## Scope and safety rule

Supabase Studio/Table Editor is the V1 profile/operator interface. The only
application admin screen is a protected, read-only AI-usage report; there is no
general profile/customer admin and no payment workflow. This runbook covers
curated freelancer profiles, availability, introductions, engagements,
retention and approved credit operations. It does not authorize editing
customer messages, bypassing RLS, running copied SQL, exposing secrets or
changing production infrastructure.

Use staging first for every new procedure. Stop and contact the technical owner
if a field, record state or requested action is not described here.

## Access prerequisites

Before an operator receives production access, record all of the following in
the handover evidence:

1. Supabase project reference, managed plan and client-approved EU region.
2. Named operator, individual account and business purpose.
3. MFA enabled; no shared login and no credential sent through chat/email.
4. Least available Supabase project role that can perform the approved Table
   Editor work. The client has accepted that Studio access is broader than a
   table-specific business-admin role.
5. Separate staging and production projects, clearly named and visually checked
   before every edit.
6. Current secret-rotation owner and incident contact. Operators never receive
   the service-role key, database password or AI-provider secret.

Do not grant Studio access to freelancers, customers or temporary external
staff. Remove an operator immediately when their role ends and review the
project access list monthly.

## Understand the two fact classes

- Put a statement in `verified_facts` only when approved evidence supports that
  exact statement and the verification date/process is documented outside the
  public profile.
- Put freelancer-provided claims in `self_reported_facts`.
- `verification_status` records the completed process; it does not make every
  profile statement verified.
- Never enter identity documents, private addresses, personal phone numbers,
  contracts, bank details, special-category data or confidential references in
  `freelancer_profiles`.

## Add a profile safely

1. Open the correct Supabase project and confirm **EU region** and **staging** in
   the project header.
2. Open **Table Editor → `freelancer_profiles` → Insert row**.
3. Leave `id`, `version`, `created_at`, `updated_at` and
   `availability_updated_at` at their database defaults.
4. Enter a lowercase hyphenated unique `slug`, display name and role title.
5. Normalize `skill_tags` to lowercase controlled terms. Use language codes such
   as `de`, `en`, `fr`. Choose only `remote`, `on_site`, `hybrid` in
   `work_modes`.
6. Enter a concise public-safe experience summary. Separate verified and
   self-reported facts as described above. Set `references_summary` to a
   public-safe status, never the source material itself.
7. Enter a positive hourly/day rate in the currency's minor unit only when it is
   supplied and approved. Example: EUR 95.00/hour is `9500` + `EUR`. If no rate
   is known, leave both rate fields and currency empty.
8. Set `intro_policy` to `free` or `manual_approval`. Manual approval is not a
   payment state.
9. For a new row, set `profile_status='paused'`,
   `availability_status='unknown'` and `demo_status='demo'` until review is
   complete.
10. Booking URLs must use HTTPS and belong to the approved freelancer/operator.
    A URL is still click-to-load in the application. Never paste Calendly event
    payloads, invitee data or access tokens.
11. Save, reopen the row and perform the activation checklist below.

### Table Editor field map

Use this as the minimum checklist while inserting the row. This is the preferred
V1 workflow for creating profiles yourself; it keeps profile maintenance out of
the public application and avoids another privileged admin surface.

| Table Editor field | Required entry |
| --- | --- |
| `slug` | Unique lowercase identifier, for example `max-muster-react` |
| `display_name` | Public display name approved for publication |
| `role_title` | Concise public role, for example `Senior React Developer` |
| `skill_tags` | Lowercase array entries matching the controlled catalog |
| `languages` | Language-code array such as `de`, `en` |
| `location_text` | Public city/region only, or empty |
| `work_modes` | Array containing `remote`, `on_site` and/or `hybrid` |
| `experience_summary` | Public-safe factual summary; no confidential customer data |
| `verified_facts` | Only individually evidenced public facts, otherwise empty |
| `self_reported_facts` | Freelancer-provided public claims, otherwise empty |
| `references_summary` | Public verification status, never source documents |
| `verification_status` | `unverified`, `identity_checked`, `references_checked` or `operator_verified` |
| `hourly_rate_minor` / `day_rate_minor` | Optional minor currency units, for example `9500` for EUR 95.00 |
| `currency` | Three-letter code only when a rate is supplied, otherwise empty |
| `intro_policy` | `free` or `manual_approval` |
| `booking_url` | Optional approved HTTPS URL |
| `profile_status` | Start with `paused` |
| `availability_status` | Start with `unknown`; set to `available` only after confirmation |
| `availability_from` | Confirmed date only, otherwise empty |
| `demo_status` | Start with `demo`; use `real` only after the activation checklist |

Do not edit database-generated fields (`id`, `version`, timestamps). Array
columns must be entered as separate array values in Table Editor, not as one
comma-separated text value. If a new skill name is needed, normalize and approve
it before adding both the profile tag and matching alias; otherwise the profile
can be valid but never qualify for the intended search.

## Activation checklist

A profile may become eligible only after all answers are **yes**:

- Is the row a real approved freelancer rather than one of the six synthetic
  seed records?
- Are name, role, normalized skills, languages and modes complete?
- Are unknown facts explicitly empty rather than guessed?
- Are verified and self-reported facts separated correctly?
- Is the rate/currency pair internally consistent, if supplied?
- Has availability been confirmed and is `availability_from` accurate?
- Is the introduction treatment approved?
- Is any booking URL correct, HTTPS and safe to expose after a click?
- Has a second person reviewed the production row?

Then set `demo_status='real'`, `availability_status='available'` and finally
`profile_status='active'`. Saving automatically increments `version` and
refreshes timestamps when availability/status changes. Run one staging search
using required skills/language/mode and confirm the rendered disclosures before
repeating the approved change in production.

Never convert the supplied synthetic seed identities into real people. Create a
new row for a real freelancer; keep or archive demo fixtures according to the
launch checklist.

## Attach or replace a private freelancer CV

CV handling is a service-role operation, not a browser or public-profile
operation. Never commit a CV to Git, place it in a public bucket, or paste its
contents into profile facts. Before upload, record outside the public profile
who authorized the document, when, for which purpose and how withdrawal can be
handled.

1. Confirm the production project reference and the exact
   `freelancer_profiles.id`. Do not proceed from a display name alone.
2. Accept PDF only, verify the file opens, has an expected filename and is no
   larger than 10 MiB. Scan it according to the controller's document-security
   process before upload.
3. Read the current `freelancer_cv_documents.version`; use `1` for the first CV
   or increment it for a replacement. The object path is fixed as
   `<profile-uuid>/cv-v<version>.pdf`.
4. Upload with a controlled server-side Supabase client and the service role.
   Set `contentType: "application/pdf"`, `cacheControl: "60"` and
   `upsert: false`. The default Storage cache value is not acceptable for this
   private download flow.
5. Verify Storage `info(path)` reports bucket `freelancer-cvs`, PDF content
   type, the recorded byte size and `max-age=60`. Then insert or update the
   metadata row with the same path, filename, byte size and version, initially
   with `is_downloadable=false`.
6. Have a second operator verify profile ID, permission record and document.
   Only then set `is_downloadable=true`.
7. Test all three states: a guest sees only a disabled `Download CV`; a
   permanent account with the latest owned recommendation can download; a
   partial or unrelated project receives no access. Check the corresponding
   audit event.
8. After a replacement is verified, remove the superseded object. For
   withdrawal or deletion, first set `is_downloadable=false`, then remove the
   object and metadata row, and record completion in the controller record.

The application re-checks the live Storage metadata before every signed URL.
An incorrect path, MIME type, byte size or cache TTL therefore fails closed.

## Review a freelancer self-registration

Freelancers can apply themselves at `/freelancer/apply`. The application is
stored in `freelancer_applications` and is invisible to customers until an
administrator publishes it. Use the application screen at
`/chat/admin/freelancers` rather than Studio for this flow: it writes both the
catalogue row and the decision record in one audited step.

1. Sign in with the administrator account (`app_metadata.role='admin'` or an
   entry in `ADMIN_USER_IDS`) and open **Freelancer-Bewerbungen prüfen** from
   the account menu.
2. Open the application and read the submitted values and the CV. The CV link is
   a two-minute signed URL into the private `freelancer-cvs` bucket; do not
   forward it and do not store a copy outside the approved location.
3. Verify identity and claims outside the application, exactly as for a curated
   profile. Record the evidence where the verification process requires it.
4. Correct the fields in the review panel where needed. The submitted
   application is never overwritten — it stays as the provenance record.
5. Tick **only** the individual statements you personally verified. Everything
   left unticked is published as a self-reported claim. An untouched application
   therefore publishes with no verified facts at all, which is the safe default.
6. Set `verification_status` to the process you actually completed. It is not a
   claim about every statement in the profile.
7. Open the booking link the applicant supplied and confirm it really leads to
   their scheduling page. The form enforces only the format; a link that is
   dead, points at the wrong person or asks for payment is a review finding.
   Correct it here or reject the application. The publish action refuses an
   empty booking URL, because matching filters out profiles that cannot be
   booked.
8. Decide separately whether the CV may be shown to customers. Leave the tick
   off unless the applicant's permission actually covers sharing the document
   with matched customers; it maps to `freelancer_cv_documents.is_downloadable`
   and can be enabled later in Studio.
9. Choose **Prüfen & freigeben**. This creates the `freelancer_profiles` row
   with `profile_status='active'` and `demo_status='real'`, so the profile can
   appear in customer shortlists immediately, and moves the CV into the
   profile's own `<profile-uuid>/cv-v1.pdf` object. Run one staging search
   afterwards and confirm the rendered disclosures.
10. If the screen reports that the CV could not be transferred, the profile is
    still correct and live. Attach the document manually with *Attach or replace
    a private freelancer CV* above; the applicant's file is still under
    `incoming/` in the same bucket.
11. Use **Ablehnen** with an internal note when the application fails review.
    The applicant is not notified automatically; contact them separately if the
    process requires it.

A published application can no longer be changed from this screen. Later
corrections follow *Edit an active profile* below, and deletions follow the
retention procedure — a rejected application's CV object under `incoming/` must
be removed together with the application row.

## Edit an active profile

1. Confirm the correct row by `id`, `slug` and display name.
2. If the edit affects eligibility, commercial terms, verification or booking,
   pause the profile first.
3. Change only facts supported by the approved source. Do not overwrite an
   unknown value with an assumption.
4. Save and verify `version` increased. Search results already saved in
   `matches.profile_snapshot` remain unchanged for reconstruction; new searches
   use the new version.
5. Reactivate only after the activation checklist passes.

Profile create/update/delete actions generate redacted audit events. The audit
contains lifecycle fields and profile version, not reference documents or chat
content.

## Pause, mark unavailable or archive

- **Temporary operational pause:** set `profile_status='paused'`. The profile is
  excluded from new results immediately.
- **Confirmed unavailable:** set `profile_status='unavailable'` and
  `availability_status='unavailable'`. Update the availability date only when a
  real new date is known.
- **Limited/uncertain availability:** set `availability_status='limited'` or
  `unknown`. Active, real profiles with a secure booking URL remain eligible,
  but the uncertainty is disclosed and they rank behind otherwise equal
  profiles with confirmed availability.
- **Permanent retirement:** set `profile_status='archived'`. Do not hard-delete a
  referenced profile; foreign keys intentionally protect historical records.

After a pause, unavailable or archive change, run a new search that would
previously have matched the person. The profile must be absent from new results.
After a limited/unknown change, verify the visible disclosure and ordering.
Existing shortlist snapshots must remain readable and clearly timestamped; a
profile that is no longer active/bookable must have no active booking button.

## Introduction operations (no payments)

An explicit customer click opens the freelancer's approved HTTPS booking page
in a new tab. V1 does not create an `intro_bookings` record merely for opening
that link and does not infer whether a meeting was booked. Operators manage the
appointment in the linked booking provider. Do not paste invitee answers,
calendar payloads or other unnecessary personal data into Supabase.

There is no premium charge, payment unlock, Stripe event, invoice or bank
transfer in V1. If someone requests payment handling, stop and route it to a
future approved migration.

## Engagement operations

Create an engagement only after explicit user/operator confirmation of the
introduction outcome. The row must include:

- linked project and freelancer;
- optional introduction ID;
- `confirmation_source` (`user` or `operator`);
- `confirmed_at`;
- contract value and currency only when supplied; otherwise leave both empty.

Use only `proposed`, `accepted`, `active`, `completed`, `cancelled` or
`disputed`. Each status change automatically adds a user-visible
`engagement_status_events` row. Never edit the history table manually. Never
infer contract value, outcome or dispute status from AI output.

## Demo seed review

`supabase/seed.sql` retains legacy synthetic fixtures only to keep older
database checks reproducible, then deletes every `demo_status='demo'` row in the
same seed run. After a reset, confirm that no demo profile and no `example.com`
booking URL remains. Never relabel a synthetic person as `real`.

The production application additionally enforces `demo_status='real'`. Existing
production demo rows should be archived and marked `unavailable` rather than
relabelled; this preserves historical evidence while keeping them out of every
new result.

## AI quota and privacy operations

Do not edit live `ai_usage_buckets`, `ai_usage_reservations` or `guest_claims` in
Table Editor during normal operation. Settled usage is intentionally immutable.

- These tables contain server-generated HMAC subject values, never raw IPs.
- The application calls `consume_ai_quota` before OpenAI and
  `record_ai_usage` after a response with trustworthy usage. A request that
  definitely never reached the provider is released as zero. A provider attempt
  without usage stays reserved and fail-closed.
- The `xportal-ai-usage-reconcile` Cron job runs every five minutes and closes
  reservations older than 15 minutes with their conservative estimate and
  outcome `reconciled_estimate`. Investigate any row still open after 20 minutes
  using only redacted trace/request identifiers. Do not manually zero counters.
- Configure alerts below the provider monthly hard cap and test the stop path in
  staging.
- Rotate the HMAC secret through the server secret-rotation procedure. Rotation
  changes future subject hashes; document the boundary and retain neither raw IP
  nor old secret.

### AI usage dashboard and credit accounts

- `/chat/admin/ai-usage` is available only to a named, non-anonymous Supabase
  user with `app_metadata.role=admin`, or a user ID explicitly configured in the
  server-only `ADMIN_USER_IDS` variable. Never grant admin through user-editable
  metadata.
- The dashboard is read-only and separates confirmed/estimated provider usage,
  the 10/100 monthly Nano allowance, purchased product credits and historical
  token-weighted technical values. Historical values are not money and must
  never be converted into the new product-credit balance.
- A successful dashboard response requires its database audit event. An audit
  storage failure blocks the sensitive view instead of silently serving it.
- Free Nano usage lives in `ai_free_usage_accounts` and resets by UTC calendar
  month: 10 successful analyses for a guest, 100 for an account. A guest also
  receives the HMAC-IP provider safety boundary; raw IPs are never stored.
- Purchased/search credits live only in `product_credit_accounts`. Never edit
  this table, its reservations or the ledger directly. V1 grants are made only
  through the audited `grant_product_credits` RPC.

### Grant product credits in Supabase V1

Obtain the authenticated user's Supabase UUID, the approved amount/reason and a
unique non-secret support reference. In **SQL Editor**, run exactly one grant:

```sql
select *
from public.grant_product_credits(
  'USER_UUID'::uuid,
  'support-grant-UNIQUE_REFERENCE',
  30,
  'Approved pilot external-search credit',
  'operator:roman@dering.info'
);
```

Use `operator:paul@dering.info` when Paul performs the grant. Expected first
result: `recorded=true`, `reason=granted`. A safe replay returns
`recorded=false`, `reason=already_recorded`; it must not increase the balance.
Any `idempotency_conflict`, wrong user or unexpected amount is a stop condition.
Verify the balance in `/chat/admin/ai-usage`, then reconcile the exact entries
in Supabase Studio:

- `product_credit_ledger`: immutable grant/debit and balance-after evidence;
- `product_credit_reservations`: reserved/charged/released search attempts;
- `external_freelancer_search_results`: the bounded paid result snapshot;
- `audit_events`: redacted grant/search business event.

Do not paste bank data, API keys, chat text or customer documents into reason,
actor or idempotency fields. See `docs/product-entitlement-rpcs.md` for every
RPC outcome and the retry rules.

See `docs/ai-usage-and-credits.md` for the versioned policy, environment values,
reporting fields and incident reconciliation checklist.

## Export and deletion request

1. Verify the requester's identity through the approved support process; never
   accept a bare project UUID as proof.
2. Use the authenticated server export path. Review the export for only that
   `auth.uid()` and record completion without copying chat bodies into audit.
3. For deletion, the server calls `prepare_user_deletion(user_id)` first. Record
   the returned trace/tombstone in restricted operational evidence, not customer
   notes.
4. The server then calls Supabase Auth Admin `deleteUser`. User-owned app rows
   cascade; audit actor references remain pseudonymous.
5. Revoke/sign out sessions as required, verify the user can no longer access the
   account, and record the outcome. Remember that deleting a user alone does not
   automatically invalidate every already-issued token immediately.
6. Do not delete audit rows ad hoc. Apply the controller-approved retention
   process.

## Retention operation

`retention_policies` controls two daily Supabase Cron jobs:

- `xportal-retention-daily` at 02:25 UTC for existing application records;
- `xportal-credit-retention-daily` at 02:30 UTC for free-usage reservations,
  product-credit reservations and paid-search result snapshots.

Changing an enabled hard-delete/anonymize period affects the next applicable
run. Product-credit ledger rows remain `operator_review`; they are not removed
automatically. Before editing a production period, obtain controller/legal approval,
test the exact value and `run_retention_cleanup()` result in staging, confirm a
managed backup, and record the change. The job writes only row counts to audit.
Rows marked `operator_review` are never deleted automatically.

Expired guest claims and abandoned anonymous Auth users require cleanup, but do
not delete an anonymous user that still owns an active project or unconsumed
claim. Stale AI reservations must be reconciled before their buckets are
deleted. Each month verify the Cron job's last run in **Database → Cron Jobs**,
its `retention_cleanup` and `credit_retention_cleanup` audit events, the
`xportal-ai-usage-reconcile` job and `ai_usage_stale_reconciled` events.
Investigate any unresolved `reserved` row older than 20 minutes immediately.

## Incident and rollback

For suspected cross-user access, secret exposure, incorrect shortlist, or
unauthorized profile edit:

1. Pause affected profiles and disable the affected server route/config cap.
2. Preserve redacted trace IDs and audit rows; do not copy message bodies.
3. Notify the security/technical owner and follow the incident plan.
4. Rotate exposed secrets. A service-role key must never appear in a client
   bundle, screenshot, ticket or repository.
5. Restore/rollback only through the repeatable deployment guide. Do not edit
   migration history manually.
6. Re-run cross-user RLS tests, deterministic fixture tests and the affected
   journey before reopening.

## Acceptance session for a non-developer operator

In staging, the named operator must successfully:

1. Add a new paused demo profile with explicit unknown fields.
2. Correct a self-reported fact without converting it to verified.
3. Activate it after checklist review and see it in a deterministic search.
4. Pause it and prove it disappears from a new result immediately.
5. Process one free and one manual-approval introduction without payment data.
6. Update an engagement and verify visible status history.
7. Locate the audit event without seeing chat, IP, identity token or secret data.

Capture date, operator, staging project reference, pass/fail, corrections and
final sign-off. Production access follows only after the session passes.
