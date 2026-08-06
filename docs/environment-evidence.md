# Environment evidence — 2026-08-06

This file records verified non-secret facts only. It is not a production launch
approval.

## Managed Supabase project

| Item | Verified value |
|---|---|
| Project reference | `xmoxzfqmcnsntvqxhtfb` |
| Region | `eu-west-1` |
| Project health | `ACTIVE_HEALTHY` |
| PostgreSQL | 17.6, engine 17 |
| Migrations | Core, security-hardening and booking-URL scrub migrations applied successfully |
| Public tables | 14; RLS enabled on all 14 |
| Seed | 6 synthetic/demo freelancer profiles; 10 retention policies |
| Database tests | 21 RLS/grant isolation assertions and 15 service-RPC assertions completed without a pgTAP failure diagnostic |
| Security Advisor | No critical/high warning; informational notices for intentionally policy-less, server/operator-only tables |
| Retention | `xportal-retention-daily` active at 02:25 UTC; controlled test run deleted zero current rows and wrote counts only |
| Query plans | Four fail-closed assertions passed with 4,000 projects, 20,000 messages and 3,000 profiles; all synthetic rows were rolled back and the six demo profiles remained |
| Performance Advisor | Fresh-database informational unused-index notices only; no full scan occurred in the four representative query-plan assertions |
| Local health smoke | `/api/health?deep=1` returned 200 with Supabase reachable; cross-origin `/api/chat` POST returned 403 |

## Open launch items

- The management response did not expose the selected Supabase plan. Confirm the
  plan supports the approved daily backup/restore requirement and execute the
  documented restore test.
- Anonymous Sign-Ins are currently disabled in the managed Auth configuration;
  enable them before the guest journey can run. Enable manual account linking
  and configure the approved Google/Azure providers and redirect allowlist.
- Configure `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SECRET` and `OPENAI_API_KEY`
  only in the server secret store. They are intentionally absent from Git and
  the local browser bundle.
- A real OpenAI request has not been executed because no server API key was
  available. The request contract (`store: false`) and failure path are covered
  by automated tests.
- Record the final public hostname, Supabase plan, operator/MFA evidence,
  processor/DPA approvals, monitoring recipient and restore-test result before
  production approval.
