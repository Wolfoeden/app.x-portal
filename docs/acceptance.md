# V1 acceptance checklist

Production release is allowed only from a successful GitHub-connected Netlify
`main` deploy whose `commit_ref` matches the approved commit. Never publish a
deploy preview to `x-portal.eu`; preview environment values and OAuth redirect
allowlists are separate from production.

## Product journey

- [ ] Guest can submit free text without a visible registration gate.
- [ ] Original request is retained when OpenAI is unavailable or budget-stopped.
- [ ] Structured brief contains only supplied facts and explicit unknown values.
- [ ] Maximum three eligible profiles appear; no profile appears on the empty
      home screen.
- [ ] Same data and rule version reproduce the same shortlist.
- [ ] Every card shows reasons, gaps, fact provenance, availability timestamp
      and the real freelancer's direct HTTPS booking link.
- [ ] No match produces an honest empty state and human-contact option.
- [ ] No introduction or engagement is created without an explicit click.
- [ ] No payment or login blocks the direct meeting link in this release.
- [ ] No booking provider makes a network request before the user clicks.
- [ ] Demo profiles and profiles without a secure booking link never render.

## Identity and isolation

- [ ] Anonymous Auth and manual identity linking are enabled.
- [x] Google production redirect URL is in the Supabase allowlist (controller
      confirmation on 16 August 2026); live return is re-tested after release.
- [ ] Azure redirect URLs are configured for staging/production before Azure is enabled.
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
