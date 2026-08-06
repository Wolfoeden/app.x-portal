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

Supabase Studio is the V1 operator interface. Give access only to named internal
operators, enforce MFA, review membership quarterly and remove access
immediately when no longer needed. Studio access is broader than profile-only
access on lower plans, so the operator runbook and confidentiality boundary are
part of acceptance.

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

- Daily: managed backups and provider budget threshold.
- Weekly: dependency and secret scans, failed-job review.
- Monthly: restore readiness, anonymous-user cleanup and retention jobs.
- Quarterly: operator access, subprocessors and RLS regression review.
