# Query-plan acceptance evidence

The acceptance script at
`supabase/tests/database/query_plan_evidence.sql` verifies that the core V1
reads use the committed indexes on representative pilot data. It is a release
gate, not a production benchmark.

## Recorded V1 run

On 2026-08-06 the script passed against the managed EU acceptance project on
PostgreSQL 17.6. All four query assertions returned `PASS`, no public foreign
key was missing a leading-column index, and the plans used the documented
project, message and freelancer indexes without a full scan of the guarded
relations. A follow-up count confirmed that the evidence run retained no
synthetic projects, messages, profiles or Auth users. Production demo-profile
lifecycle is documented separately in the operator runbook.

## What it checks

- Required index objects exist in `public` and are both valid and ready.
- The saved-project list uses `projects_owner_updated_idx` without a
  sequential scan of `projects`.
- Conversation reload uses either the project/message or owner/project/message
  timeline index without a sequential scan of `messages`.
- The current active/real/bookable catalog load uses
  `freelancer_profiles_status_availability_idx`.
- A scalability guard for the equivalent SQL-side deterministic filters uses
  at least one accepted eligibility or GIN index and does not sequentially scan
  `freelancer_profiles`. V1 still applies these remaining filters in the
  TypeScript domain layer, so this fourth plan is an explicit future-scale
  guard rather than a claim about the current query text.
- Every foreign key in `public` has a valid, ready index whose leading columns
  match the foreign-key columns in order.

Each checked query is executed with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.
The returned JSON includes the actual plan, used indexes, planning time, and
execution time. Supabase's query-optimization guidance recommends examining
`EXPLAIN` output for sequential scans and keeping planner statistics current:
<https://supabase.com/docs/guides/database/query-optimization>.

## Safe execution

Run the script only on a staging database after applying every migration. Use
the Supabase SQL Editor as a database owner, or run it through a direct `psql`
connection with stop-on-error enabled:

```powershell
psql $env:STAGING_DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/tests/database/query_plan_evidence.sql
```

Do not put the connection string in the repository, command history, or saved
evidence. Redact project identifiers if the output is shared externally.

The runner generates unique synthetic identifiers and performs all fixture
writes inside a PL/pgSQL exception subtransaction. On success it deliberately
raises and catches SQLSTATE `ZX001`; PostgreSQL rolls back database changes in
that block while retaining local variables for the returned report. A real
assertion error is not caught, so it also rolls back the fixture work and fails
the run. This behavior is documented in PostgreSQL's error-trapping semantics:
<https://www.postgresql.org/docs/17/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING>.

The script temporarily runs `ANALYZE` for the three tested tables inside that
rollback boundary. It can take short-lived table locks and execute application
triggers, which is why staging -- not production -- is the acceptance target.
The application rows and transactional catalog changes are rolled back;
non-transactional cumulative activity counters can still advance.

## Pass/fail rule

A valid run returns one JSON value with `"status": "PASS"`, four assertion
objects, `"missing_fk_indexes": []`, and the expected rolled-back fixture
counts. Save that complete JSON with the release evidence.

Any exception beginning with `QUERY PLAN FAIL` is a failed gate. Do not bypass
it with `enable_seqscan = off`: that would prove only that PostgreSQL can use an
index, not that the planner selects it under representative conditions. Fix the
index, query shape, predicate alignment, or stale statistics and rerun.

## Limitations

- Plans depend on PostgreSQL version, statistics, configuration, and data
  distribution. This fixture makes the decision reproducible enough for V1,
  but it does not predict latency at production scale.
- `EXPLAIN ANALYZE` executes the four read-only `SELECT` statements. The
  fixture setup also creates normal staging activity in operational counters.
- The script validates database-owner/service-path plans. Cross-user behavior
  and authenticated RLS enforcement remain covered by the separate RLS
  isolation test.
- It tests three current launch-query shapes plus one explicitly labeled
  future-scale SQL guard. Add an assertion whenever a new core read path is
  introduced or its SQL shape changes.
