-- Der Knopf "Verschicken" in der Leadliste braucht die Kennung des Entwurfs.
--
-- Er ruft seit dem Rueckbau des zweiten Mailwegs (6ccd3b9) eine Route auf, die
-- es nicht mehr gibt: `/api/admin/leads/{id}/send`. Der Aufruf blieb stehen,
-- als die Route ging -- seither antwortet auf jeden Klick eine 404, und der
-- Betreiber liest "Fehler 404" und nicht "diesen Weg gibt es nicht mehr".
--
-- Verschickt wird ausschliesslich ueber `/api/admin/outreach/{outreach_id}/send`,
-- denselben Weg, den auch der Zeitgeber nimmt. Dafuer muss die Zeile wissen,
-- welcher Entwurf zu ihr gehoert -- die Liste lieferte bisher Zustand, Betreff
-- und Wortlaut des Entwurfs, aber nicht seine Kennung.
--
-- Nur eine Spalte mehr; der laterale Verbund stand schon da.

begin;

-- Die Spaltenliste einer Tabellenfunktion laesst sich nicht ersetzen, nur
-- neu anlegen. Innerhalb derselben Transaktion sieht niemand die Luecke.
drop function if exists public.admin_list_leadgen_queue(
  text, text, text, text, text, integer, integer
);

create or replace function public.admin_list_leadgen_queue(
  p_search text default null,
  p_status text default null,
  p_category text default null,
  p_scope text default 'open',
  p_match text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  recipient_email text,
  recipient_name text,
  company text,
  stellenanzeige text,
  status text,
  category text,
  notes text,
  archived_at timestamptz,
  last_contacted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  outreach_id uuid,
  outreach_state text,
  outreach_subject text,
  outreach_body text,
  outreach_created_at timestamptz,
  outreach_sent_at timestamptz,
  outreach_failure_reason text,
  outreach_origin text,
  outreach_cta_url text,
  match_status text,
  match_count integer,
  match_primary_profile_id uuid,
  match_open_requirements jsonb,
  matched_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with angereichert as (
    select
      q.*,
      s.result_status as match_status,
      s.result_count as match_count,
      nullif(s.decision_snapshot ->> 'primaryProfileId', '')::uuid
        as match_primary_profile_id,
      coalesce(s.decision_snapshot -> 'openCoreRequirements', '[]'::jsonb)
        as match_open_requirements,
      s.created_at as matched_at
      from public.leadgen_queue q
      left join lateral (
        select l.result_status, l.result_count, l.decision_snapshot, l.created_at
          from public.shortlists l
         where l.lead_id = q.id
         order by l.created_at desc
         limit 1
      ) s on true
  ),
  filtered as (
    select a.*
      from angereichert a
     where (
             p_scope = 'all'
             or (p_scope = 'open' and a.archived_at is null)
             or (p_scope = 'archived' and a.archived_at is not null)
           )
       and (p_status is null or a.status = p_status)
       and (p_category is null or a.category = p_category)
       and (
             p_search is null
             or a.search_text ilike '%' || p_search || '%'
           )
       -- Drei Zustaende, die eine Zeile beim Matching haben kann. `open`
       -- meint: noch nie abgeglichen -- das ist etwas anderes als "kein
       -- Treffer" und darf nicht mit ihm in einen Topf.
       and (
             p_match is null
             or (p_match = 'hit' and a.match_status = 'ranked')
             or (p_match = 'no_hit'
                 and a.match_status is not null
                 and a.match_status <> 'ranked')
             or (p_match = 'open' and a.match_status is null)
           )
  ),
  counted as (
    select count(*) as total from filtered
  )
  select
    f.id,
    f.recipient_email,
    f.recipient_name,
    f.company,
    f.stellenanzeige,
    f.status,
    f.category,
    f.notes,
    f.archived_at,
    f.last_contacted_at,
    f.created_at,
    f.updated_at,
    o.id as outreach_id,
    o.state as outreach_state,
    o.subject as outreach_subject,
    o.body as outreach_body,
    o.created_at as outreach_created_at,
    o.sent_at as outreach_sent_at,
    o.failure_reason as outreach_failure_reason,
    o.origin as outreach_origin,
    o.cta_url as outreach_cta_url,
    f.match_status,
    f.match_count::integer,
    f.match_primary_profile_id,
    f.match_open_requirements,
    f.matched_at,
    counted.total as total_count
  from filtered f
  cross join counted
  left join lateral (
    select l.id, l.state, l.subject, l.body, l.created_at, l.sent_at,
           l.failure_reason, l.origin, l.cta_url
      from public.leadgen_outreach l
     where l.lead_id = f.id
     -- Die zugestellte Fassung schlaegt den Entwurf: Wer nachliest, will
     -- wissen, was rausging, nicht was daneben noch herumliegt.
     order by (l.state = 'sent') desc, l.created_at desc
     limit 1
  ) o on true
  order by
    case when f.archived_at is null then f.created_at else f.archived_at end desc,
    f.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.admin_list_leadgen_queue(
  text, text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.admin_list_leadgen_queue(
  text, text, text, text, text, integer, integer
) to service_role;

notify pgrst, 'reload schema';

commit;
