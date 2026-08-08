# Supabase Studio operator runbook — Freelancer V1

## Scope and safety rule

Supabase Studio/Table Editor is the V1 operator interface. There is no custom
admin screen and no payment workflow. This runbook covers curated freelancer
profiles, availability, introductions, engagements and retention configuration.
It does not authorize editing customer messages, bypassing RLS, running copied
SQL, exposing secrets or changing production infrastructure.

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
Table Editor during normal operation.

- These tables contain server-generated HMAC subject values, never raw IPs.
- The application calls `consume_ai_quota` before OpenAI and
  `record_ai_usage` after every success, provider error, timeout or cancellation.
- A reservation still marked `reserved` after the incident window fails closed.
  Investigate its trace/request key in redacted application monitoring, then use
  the approved server reconciliation command. Do not manually zero counters.
- Configure alerts below the provider monthly hard cap and test the stop path in
  staging.
- Rotate the HMAC secret through the server secret-rotation procedure. Rotation
  changes future subject hashes; document the boundary and retain neither raw IP
  nor old secret.

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

`retention_policies` controls the daily `xportal-retention-daily` Supabase Cron
job. Changing an enabled hard-delete/anonymize period affects its next 02:25 UTC
run. Before editing a production period, obtain controller/legal approval,
test the exact value and `run_retention_cleanup()` result in staging, confirm a
managed backup, and record the change. The job writes only row counts to audit.
Rows marked `operator_review` are never deleted automatically.

Expired guest claims and abandoned anonymous Auth users require cleanup, but do
not delete an anonymous user that still owns an active project or unconsumed
claim. Stale AI reservations must be reconciled before their buckets are
deleted. Each month verify the Cron job's last run in **Database → Cron Jobs**,
its `retention_cleanup` audit event, and any unresolved `reserved` row older
than one day.

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
