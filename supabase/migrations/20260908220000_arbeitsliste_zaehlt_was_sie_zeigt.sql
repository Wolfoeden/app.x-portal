-- Die Zahl am Filter muss die Zeilen zaehlen, die der Filter oeffnet.
--
-- Am Abend des 8. September stand am Filter "Nicht abgeglichen" die Zahl
-- **-284**. Sie entstand in der Oberflaeche aus `gesamt - abgeglichen`: acht
-- Leads in der Warteschlange minus zweihundertzweiundneunzig Abgleichzeilen.
-- Zwei Grundgesamtheiten voneinander abgezogen -- die Warteschlange zaehlt
-- Leads, `shortlists` zaehlt Vorgaenge, und ein Vorgang ueberlebt den Lead,
-- an dem er hing.
--
-- Die beiden anderen Zahlen derselben Reihe waren aus demselben Grund falsch,
-- nur unauffaelliger: "Treffer 48" und "Kein Treffer 244" versprachen Listen,
-- die es nicht gibt. Der Filter haelt die Warteschlange, und darin liegen
-- genau ein Treffer und sieben ohne. Wer auf 244 klickt und sieben bekommt,
-- glaubt beim naechsten Mal keiner Zahl auf dieser Seite mehr.
--
-- Deshalb zaehlt die Warteschlangenuebersicht ab jetzt selbst, was der Filter
-- zeigen wuerde -- je Ansicht getrennt, weil derselbe Filter in "Offen",
-- "Archiv" und "Alle" verschiedene Mengen oeffnet. Gerechnet wird nichts
-- mehr.

begin;

create or replace function public.admin_leadgen_queue_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with angereichert as (
    select
      q.id,
      q.status,
      q.category,
      q.archived_at,
      -- Derselbe seitliche Verbund wie in `admin_list_leadgen_queue`: der
      -- juengste Abgleich entscheidet. Eine abweichende Herleitung waere ein
      -- zweiter Wahrheitsbegriff fuer dieselbe Frage.
      s.result_status as match_status
      from public.leadgen_queue q
      left join lateral (
        select l.result_status
          from public.shortlists l
         where l.lead_id = q.id
         order by l.created_at desc
         limit 1
      ) s on true
  ),
  je_ansicht as (
    select
      bereich,
      count(*) filter (where match_status = 'ranked') as hit,
      count(*) filter (
        where match_status is not null and match_status <> 'ranked'
      ) as no_hit,
      count(*) filter (where match_status is null) as noch_offen
      from (
        select a.*, 'all'::text as bereich from angereichert a
        union all
        select a.*, 'open'::text from angereichert a where a.archived_at is null
        union all
        select a.*, 'archived'::text from angereichert a
         where a.archived_at is not null
      ) verteilt
     group by bereich
  )
  select jsonb_build_object(
    'open', count(*) filter (where archived_at is null),
    'archived', count(*) filter (where archived_at is not null),
    'total', count(*),
    'by_status', coalesce(
      (
        select jsonb_object_agg(status, anzahl)
          from (
            select status, count(*) as anzahl
              from public.leadgen_queue
             group by status
          ) s
      ),
      '{}'::jsonb
    ),
    'categories', coalesce(
      (
        select jsonb_agg(jsonb_build_object('category', category, 'count', anzahl)
                         order by anzahl desc, category)
          from (
            select category, count(*) as anzahl
              from public.leadgen_queue
             where category is not null
             group by category
          ) c
      ),
      '[]'::jsonb
    ),
    -- Die Schluessel heissen wie die Filter in der Oberflaeche, damit
    -- niemand unterwegs uebersetzen muss. Fehlt eine Ansicht, weil die
    -- Warteschlange leer ist, liefert die Oberflaeche Nullen.
    'by_match', coalesce(
      (
        select jsonb_object_agg(
                 bereich,
                 jsonb_build_object('hit', hit, 'no_hit', no_hit, 'open', noch_offen)
               )
          from je_ansicht
      ),
      '{}'::jsonb
    )
  )
  from public.leadgen_queue;
$$;

revoke all on function public.admin_leadgen_queue_summary()
  from public, anon, authenticated;
grant execute on function public.admin_leadgen_queue_summary()
  to service_role;

comment on function public.admin_leadgen_queue_summary() is
  'Kennzahlen der Lead-Warteschlange. Alle Zahlen zaehlen Leads -- auch die '
  'unter by_match, damit die Zahl am Filter zu der Liste passt, die er oeffnet.';

notify pgrst, 'reload schema';

commit;
