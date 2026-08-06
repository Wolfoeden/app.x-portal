-- Fail-closed query-plan acceptance test for the freelancer V1 core reads.
--
-- Run this script on staging after all migrations. It creates representative
-- synthetic rows, executes EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), checks the
-- plans, and then deliberately raises/catches SQLSTATE ZX001 so every fixture
-- and its trigger side effects are rolled back before the PASS result returns.
-- Any other exception is an acceptance failure and also rolls the fixtures back.
--
-- The script creates only session-local pg_temp functions. It does not create,
-- update, or delete persistent schema objects.

create or replace function pg_temp.assert_indexes_ready(p_index_names text[])
returns void
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_bad_indexes text[];
begin
  select coalesce(array_agg(requested.index_name order by requested.index_name), '{}'::text[])
    into v_bad_indexes
  from unnest(p_index_names) as requested(index_name)
  left join pg_namespace ns
    on ns.nspname = 'public'
  left join pg_class index_class
    on index_class.relnamespace = ns.oid
   and index_class.relname = requested.index_name
   and index_class.relkind = 'i'
  left join pg_index index_state
    on index_state.indexrelid = index_class.oid
  where index_class.oid is null
     or index_state.indexrelid is null
     or not index_state.indisvalid
     or not index_state.indisready;

  if cardinality(v_bad_indexes) > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'QUERY PLAN FAIL [index readiness]: missing, invalid, or unready indexes: %s',
        array_to_string(v_bad_indexes, ', ')
      ),
      hint = 'Apply the committed migrations and confirm pg_index.indisvalid and pg_index.indisready before rerunning.';
  end if;
end;
$$;

create or replace function pg_temp.assert_indexed_plan(
  p_label text,
  p_query text,
  p_no_seq_scan_relations text[],
  p_required_indexes text[] default '{}'::text[],
  p_any_accepted_indexes text[] default '{}'::text[]
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_plan jsonb;
  v_used_indexes text[];
  v_seq_scan_relations text[];
  v_missing_required text[];
begin
  -- p_query is hard-coded by pg_temp.run_query_plan_evidence below; it is not
  -- application or user input.
  execute 'explain (analyze, buffers, format json) ' || p_query into v_plan;

  with recursive plan_nodes(node) as (
    select v_plan -> 0 -> 'Plan'
    union all
    select child.node
    from plan_nodes parent
    cross join lateral jsonb_array_elements(
      coalesce(parent.node -> 'Plans', '[]'::jsonb)
    ) as child(node)
  )
  select
    coalesce(
      array_agg(distinct node ->> 'Index Name')
        filter (where node ? 'Index Name'),
      '{}'::text[]
    ),
    coalesce(
      array_agg(distinct node ->> 'Relation Name') filter (
        where node ->> 'Node Type' in ('Seq Scan', 'Parallel Seq Scan')
          and node ->> 'Relation Name' = any(p_no_seq_scan_relations)
      ),
      '{}'::text[]
    )
  into v_used_indexes, v_seq_scan_relations
  from plan_nodes;

  if cardinality(v_seq_scan_relations) > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'QUERY PLAN FAIL [%s]: forbidden full scan on %s',
        p_label,
        array_to_string(v_seq_scan_relations, ', ')
      ),
      detail = format(
        'Used indexes: [%s]. Plan: %s',
        array_to_string(v_used_indexes, ', '),
        v_plan::text
      ),
      hint = 'Check table statistics, query predicates, and the committed core indexes. Do not force enable_seqscan=off for acceptance.';
  end if;

  select coalesce(array_agg(required.index_name order by required.index_name), '{}'::text[])
    into v_missing_required
  from unnest(p_required_indexes) as required(index_name)
  where not (required.index_name = any(v_used_indexes));

  if cardinality(v_missing_required) > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'QUERY PLAN FAIL [%s]: required indexes were not used: %s',
        p_label,
        array_to_string(v_missing_required, ', ')
      ),
      detail = format(
        'Used indexes: [%s]. Plan: %s',
        array_to_string(v_used_indexes, ', '),
        v_plan::text
      ),
      hint = 'Confirm the query shape still matches the index column order and partial-index predicate.';
  end if;

  if cardinality(p_any_accepted_indexes) > 0
     and not (v_used_indexes && p_any_accepted_indexes) then
    raise exception using
      errcode = 'P0001',
      message = format(
        'QUERY PLAN FAIL [%s]: none of the accepted indexes was used',
        p_label
      ),
      detail = format(
        'Accepted: [%s]. Used: [%s]. Plan: %s',
        array_to_string(p_any_accepted_indexes, ', '),
        array_to_string(v_used_indexes, ', '),
        v_plan::text
      ),
      hint = 'Review selectivity and representative fixture volume; a sequential scan must not be accepted by disabling this assertion.';
  end if;

  return jsonb_build_object(
    'label', p_label,
    'status', 'PASS',
    'no_seq_scan_relations', to_jsonb(p_no_seq_scan_relations),
    'required_indexes', to_jsonb(p_required_indexes),
    'any_accepted_indexes', to_jsonb(p_any_accepted_indexes),
    'used_indexes', to_jsonb(v_used_indexes),
    'planning_time_ms', v_plan -> 0 -> 'Planning Time',
    'execution_time_ms', v_plan -> 0 -> 'Execution Time',
    'plan', v_plan -> 0 -> 'Plan'
  );
end;
$$;

create or replace function pg_temp.run_query_plan_evidence()
returns jsonb
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_project_id uuid;
  v_report jsonb := '[]'::jsonb;
  v_missing_fk_indexes jsonb := '[]'::jsonb;
  v_assertion jsonb;
begin
  perform set_config('jit', 'off', true);
  perform set_config('max_parallel_workers_per_gather', '0', true);

  perform pg_temp.assert_indexes_ready(array[
    'projects_owner_updated_idx',
    'projects_owner_status_updated_idx',
    'messages_project_created_idx',
    'freelancer_profiles_status_availability_idx',
    'freelancer_profiles_eligible_availability_idx',
    'freelancer_profiles_skill_tags_gin_idx',
    'freelancer_profiles_languages_gin_idx',
    'freelancer_profiles_work_modes_gin_idx'
  ]);

  -- This nested block is a subtransaction. ZX001 is raised only after every
  -- assertion passes; its handler preserves the report variables but rolls back
  -- all database changes made in this block.
  begin
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at
    ) values
      (
        '00000000-0000-0000-0000-000000000000',
        v_owner_a,
        'authenticated',
        'authenticated',
        'query-plan-' || v_owner_a || '@example.invalid',
        '',
        now(),
        now(),
        now()
      ),
      (
        '00000000-0000-0000-0000-000000000000',
        v_owner_b,
        'authenticated',
        'authenticated',
        'query-plan-' || v_owner_b || '@example.invalid',
        '',
        now(),
        now(),
        now()
      );

    insert into public.projects (
      id,
      owner_user_id,
      title,
      original_request,
      structured_brief,
      brief_status,
      status,
      created_at,
      updated_at
    )
    select
      gen_random_uuid(),
      case when g % 2 = 0 then v_owner_a else v_owner_b end,
      'Synthetic plan project ' || g,
      'Synthetic request used only for a rolled-back query-plan test.',
      '{"required_skills":["react"],"language":"de","mode":"remote"}'::jsonb,
      'ready',
      case when g % 4 = 0 then 'shortlisted' else 'draft' end,
      now() - make_interval(mins => g),
      now() - make_interval(mins => g)
    from generate_series(1, 4000) as g;

    insert into public.messages (
      project_id,
      owner_user_id,
      role,
      content,
      client_message_id,
      created_at
    )
    select
      p.id,
      p.owner_user_id,
      'user',
      'Synthetic query-plan message ' || g,
      'plan-message-' || p.id || '-' || g,
      p.created_at + make_interval(secs => g)
    from public.projects p
    cross join generate_series(1, 5) as g
    where p.owner_user_id in (v_owner_a, v_owner_b);

    insert into public.freelancer_profiles (
      id,
      slug,
      display_name,
      role_title,
      skill_tags,
      languages,
      location_text,
      work_modes,
      experience_summary,
      verified_facts,
      self_reported_facts,
      verification_status,
      day_rate_minor,
      currency,
      profile_status,
      availability_status,
      availability_from,
      availability_updated_at,
      intro_policy,
      demo_status
    )
    select
      gen_random_uuid(),
      'plan-profile-' || replace(v_run_id::text, '-', '') || '-' || g,
      'Synthetic Profile ' || g,
      case when g % 5 = 0 then 'React Engineer' else 'Specialist' end,
      case
        when g % 5 = 0 then array['react', 'typescript', 'next.js']::text[]
        when g % 5 = 1 then array['requirements management', 'bpmn']::text[]
        when g % 5 = 2 then array['project management', 'clickup']::text[]
        when g % 5 = 3 then array['python', 'postgresql']::text[]
        else array['information security', 'iso 27001']::text[]
      end,
      case when g % 7 = 0 then array['en']::text[] else array['de', 'en']::text[] end,
      'Synthetic EU location',
      case when g % 11 = 0 then array['hybrid']::text[] else array['remote', 'hybrid']::text[] end,
      'Synthetic profile generated inside a rolled-back query-plan evidence subtransaction.',
      array['Synthetic record marked as demo data'],
      array['Synthetic experience statement'],
      'unverified',
      60000 + (g % 60) * 1000,
      'EUR',
      case when g % 3 = 0 then 'active' else 'paused' end,
      case when g % 4 = 0 then 'available' else 'unavailable' end,
      current_date + (g % 45),
      now() - make_interval(mins => g),
      case when g % 2 = 0 then 'free' else 'manual_approval' end,
      'demo'
    from generate_series(1, 3000) as g;

    -- Statistics make the planner decision representative of the fixture volume.
    analyze public.projects;
    analyze public.messages;
    analyze public.freelancer_profiles;

    select p.id
      into strict v_project_id
    from public.projects p
    where p.owner_user_id = v_owner_a
    order by p.updated_at desc
    limit 1;

    -- 1. Saved project list. This matches GET /api/projects: owner filter,
    -- archived exclusion, newest first, and a bounded result.
    v_assertion := pg_temp.assert_indexed_plan(
      'saved project list',
      format(
        $query$
          select p.id, p.title, p.status, p.updated_at
          from public.projects p
          where p.owner_user_id = %L::uuid
            and p.status <> 'archived'
          order by p.updated_at desc
          limit 50
        $query$,
        v_owner_a
      ),
      array['projects'],
      array['projects_owner_updated_idx']
    );
    v_report := v_report || jsonb_build_array(v_assertion);

    -- 2. Conversation reload. This matches the message query in
    -- GET /api/projects/[id]: owner + project filter, chronological order.
    v_assertion := pg_temp.assert_indexed_plan(
      'conversation reload',
      format(
        $query$
          select m.id, m.role, m.content, m.structured_payload, m.created_at
          from public.messages m
          where m.project_id = %L::uuid
            and m.owner_user_id = %L::uuid
          order by m.created_at
          limit 200
        $query$,
        v_project_id,
        v_owner_a
      ),
      array['messages'],
      '{}'::text[],
      array[
        'messages_project_created_idx',
        'messages_owner_project_created_idx'
      ]
    );
    v_report := v_report || jsonb_build_array(v_assertion);

    -- 3. Active catalog load. This matches fetchActiveAvailableProfiles; the
    -- TypeScript domain layer applies all remaining deterministic hard filters.
    v_assertion := pg_temp.assert_indexed_plan(
      'active and available profile catalog',
      $query$
        select
          fp.id,
          fp.display_name,
          fp.role_title,
          fp.skill_tags,
          fp.languages,
          fp.location_text,
          fp.work_modes,
          fp.availability_from,
          fp.availability_updated_at
        from public.freelancer_profiles fp
        where fp.profile_status = 'active'
          and fp.availability_status = 'available'
      $query$,
      array['freelancer_profiles'],
      array['freelancer_profiles_status_availability_idx']
    );
    v_report := v_report || jsonb_build_array(v_assertion);

    -- 4. Scalable eligibility guard. V1 currently performs these remaining hard
    -- filters deterministically in TypeScript after assertion 3. This plan
    -- proves the committed partial/GIN indexes support the equivalent SQL shape
    -- when the catalog outgrows an in-memory V1 pass.
    v_assertion := pg_temp.assert_indexed_plan(
      'scalable deterministic eligibility guard',
      $query$
        select
          fp.id,
          fp.display_name,
          fp.role_title,
          fp.availability_from,
          fp.availability_updated_at,
          (
            case when 'next.js' = any(fp.skill_tags) then 1 else 0 end
            + case when 'testing' = any(fp.skill_tags) then 1 else 0 end
          ) as optional_skill_matches
        from public.freelancer_profiles fp
        where fp.profile_status = 'active'
          and fp.availability_status = 'available'
          and fp.skill_tags @> array['react', 'typescript']::text[]
          and fp.languages @> array['de']::text[]
          and fp.work_modes @> array['remote']::text[]
          and fp.day_rate_minor <= 90000
          and (fp.availability_from is null or fp.availability_from <= current_date + 35)
        order by
          optional_skill_matches desc,
          fp.availability_from asc nulls last,
          fp.availability_updated_at desc,
          fp.id
        limit 3
      $query$,
      array['freelancer_profiles'],
      '{}'::text[],
      array[
        'freelancer_profiles_status_availability_idx',
        'freelancer_profiles_eligible_availability_idx',
        'freelancer_profiles_skill_tags_gin_idx',
        'freelancer_profiles_languages_gin_idx',
        'freelancer_profiles_work_modes_gin_idx'
      ]
    );
    v_report := v_report || jsonb_build_array(v_assertion);

    -- Every public foreign key must have a valid/ready index whose leading key
    -- columns match the FK columns in order. This supports deletes and joins.
    select coalesce(jsonb_agg(to_jsonb(missing_fk) order by missing_fk.table_name, missing_fk.constraint_name), '[]'::jsonb)
      into v_missing_fk_indexes
    from (
      select
        c.conrelid::regclass::text as table_name,
        c.conname as constraint_name,
        pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      where c.contype = 'f'
        and c.connamespace = 'public'::regnamespace
        and not exists (
          select 1
          from pg_index i
          where i.indrelid = c.conrelid
            and i.indisvalid
            and i.indisready
            and i.indnkeyatts >= cardinality(c.conkey)
            and not exists (
              select 1
              from generate_subscripts(c.conkey, 1) as key_position(position)
              where i.indkey[key_position.position - 1] <> c.conkey[key_position.position]
            )
        )
    ) as missing_fk;

    if jsonb_array_length(v_missing_fk_indexes) > 0 then
      raise exception using
        errcode = 'P0001',
        message = 'QUERY PLAN FAIL [foreign keys]: one or more public foreign keys lack a leading-column index',
        detail = v_missing_fk_indexes::text,
        hint = 'Add a valid index beginning with the FK columns in the same order, then rerun this acceptance test.';
    end if;

    -- Deliberately abort only the fixture subtransaction. PL/pgSQL retains the
    -- local report variables while rolling back all persistent changes above.
    raise exception using
      errcode = 'ZX001',
      message = 'query-plan fixtures complete; rolling back synthetic data';
  exception
    when sqlstate 'ZX001' then
      null;
  end;

  return jsonb_build_object(
    'status', 'PASS',
    'fixture_rows_rolled_back', jsonb_build_object(
      'auth_users', 2,
      'projects', 4000,
      'messages', 20000,
      'freelancer_profiles', 3000
    ),
    'assertions', v_report,
    'missing_fk_indexes', v_missing_fk_indexes
  );
end;
$$;

-- One JSON result is the release evidence. If an assertion fails, this SELECT
-- raises a QUERY PLAN FAIL exception and returns no PASS object.
select jsonb_pretty(pg_temp.run_query_plan_evidence()) as query_plan_acceptance;
