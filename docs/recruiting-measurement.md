# Recruiting measurement checkpoint

Implemented schema/client/API/server helpers, not yet a complete measured journey.

Browser measurement requires existing `v2.all` consent on client and server. Strict event, outcome, plan and source allowlists reject arbitrary payloads. No recruiting text, CV, contact fields, query strings, gclid or pixels are transmitted. Unrecognised utm_source becomes direct. Campaign ID attribution and browser-to-Stripe session association remain open.

Database uniqueness is `(event,entity_id,origin)`. Client assertions remain separate from server evidence. Test Stripe events (`livemode=false`), local previews, admin/excluded-email accounts are marked internal. Admin role checks and production exclusion configuration need acceptance verification.

Billing events are emitted only by verified server code. Positive payment is distinct from zero-value trial invoice. Client events do not grant access. No Reddit ID is invented. First-analysis, selection and recurring-use consumers plus admin reporting/retention are not yet integrated. The old signup funnel still has its preexisting measurement behaviour; align its consent and deduplication before release.

Project draft helper stores up to 12000 characters in tab-local sessionStorage for 24 hours, has explicit failure result, rejects stale/future/malformed values. It is saved and unit tested, but its landing/chat/auth/checkout consumers still require integration. Never put project text into URLs or Stripe metadata.

Migration generated using Supabase CLI; not applied to any database. Docker/Postgres runtime is unavailable on PATH, SQL/RLS runtime verification pending.
