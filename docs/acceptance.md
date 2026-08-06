# V1 acceptance checklist

## Product journey

- [ ] Guest can submit free text without a visible registration gate.
- [ ] Original request is retained when OpenAI is unavailable or budget-stopped.
- [ ] Structured brief contains only supplied facts and explicit unknown values.
- [ ] Maximum three eligible profiles appear; no profile appears on the empty
      home screen.
- [ ] Same data and rule version reproduce the same shortlist.
- [ ] Every card shows reasons, gaps, fact provenance, availability timestamp
      and introduction policy.
- [ ] No match produces an honest empty state and human-contact option.
- [ ] No introduction or engagement is created without an explicit click.
- [ ] Premium introductions use manual approval; no payment UI or table exists.
- [ ] Calendly makes no network request before the user clicks to load it.

## Identity and isolation

- [ ] Anonymous Auth and manual identity linking are enabled.
- [ ] Google and Azure redirect URLs are configured for staging/production.
- [ ] New account linking preserves the same owner ID.
- [ ] Existing-account sign-in consumes an expiring one-time guest claim.
- [ ] Automated cross-user URL/API/database reads and writes fail closed.
- [ ] All exposed tables have RLS and explicit grants.
- [ ] No service/secret key appears in browser bundles or repository history.

## Security and operations

- [ ] Request schemas, body limits, same-origin checks and idempotency pass.
- [ ] Raw chat, identity tokens, secrets and raw IPs are absent from logs.
- [ ] Per-user and HMAC-IP rate limits and monthly hard stop are demonstrated.
- [ ] Dependency, secret and baseline web scans have no unresolved critical/high
      issue or a signed exception.
- [ ] Supabase Security/Performance Advisor findings are resolved.
- [ ] Clean staging deploy and application rollback are recorded.
- [ ] Managed backup restore to an isolated target is recorded.
- [ ] Chrome, Edge, Firefox and Safari latest two stable versions pass the launch
      smoke journey.
- [ ] Export returns approved app data; deletion removes/anonymizes per policy.
- [ ] Operator can add, edit, pause and archive a profile using the runbook.
