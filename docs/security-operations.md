# Security operations

## Secret handling and rotation

- Store OpenAI, Supabase secret/service-role and IP-HMAC secrets only in the
  server deployment secret store.
- Never paste secrets into browser configuration, logs, source control or
  screenshots.
- Rotate after staff departure, suspected exposure, provider incident and at
  the approved periodic interval.
- During rotation, add the new secret, deploy, verify health and one controlled
  request, then revoke the old secret. Record only key identifiers and times.
- A Supabase publishable key is not an authorization boundary; RLS is mandatory.

## Operator access

Supabase Studio is the V1 profile/operator interface. Give access only to named
internal operators, enforce MFA, review membership quarterly and remove access
immediately when no longer needed. Studio access is broader than profile-only
access on lower plans, so the operator runbook and confidentiality boundary are
part of acceptance. The application AI-usage dashboard is separately protected
by a non-anonymous admin claim/server allow-list and exposes no chat bodies,
identity tokens or raw IP addresses.

## Client IP trust boundary

On Netlify, rate limiting reads the platform-provided Functions context IP; the
Netlify connection-IP header is used only as its runtime fallback. Client-set
`CF-Connecting-IP`, `X-Real-IP` and `X-Forwarded-For` values are not trusted on
that deployment. Another production ingress returns an unknown shared IP and
therefore fails closed unless `TRUST_PROXY_IP_HEADERS=true` is explicitly set
after verifying that the proxy strips and rewrites forwarding headers.

## Logging and alerts

Application logs contain an event name, trace ID, time, result and numeric usage
only. They must not contain chat bodies, authorization headers, OAuth codes,
cookies, raw IP addresses, email addresses or provider response payloads.

Alert on:

- `/api/health` failure;
- elevated 5xx or authentication failures;
- OpenAI timeout/error rate;
- per-user/IP quota rejection spikes;
- monthly provider budget warning and hard stop;
- low/exhausted internal-credit balances and unsettled reservations;
- profile or engagement status changes;
- repeated cross-owner access denials.

## Incident minimum

1. Disable the affected provider path or rotate the exposed secret.
2. Preserve redacted logs and trace IDs; do not copy chat bodies into tickets.
3. Determine affected users, tables and time window.
4. Restore service using the documented rollback path.
5. Assess contractual and regulatory notification duties with the appointed
   responsible person.
6. Record root cause, corrective action and verification.

## Scheduled controls

- Every five minutes: conservatively reconcile AI reservations older than 15
  minutes; alert if the job fails or rows remain open after 20 minutes.
- Daily: managed backups and provider budget threshold.
- Weekly: dependency and secret scans, failed-job review.
- Monthly: restore readiness, anonymous-user cleanup and retention jobs.
- Quarterly: operator access, subprocessors and RLS regression review.
