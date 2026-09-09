-- Was auf der Arbeitsflaeche steht, muss die Arbeit meinen.
--
-- Die Uebersicht meldete "Offen 1" und der Knopf daneben bot "Alle 0 offenen
-- abgleichen" an. Beides stimmte und widersprach sich trotzdem: Der eine Lead
-- ist unarchiviert, hat aber laengst einen Entwurf -- und Leads mit Entwurf
-- ueberspringt der Abgleich, sonst schriebe er jeden Morgen einen fast
-- gleichen Entwurf neu und schoebe dessen Alter vor sich her.
--
-- "Offen" beantwortet also eine andere Frage als der Knopf. Wer beide
-- nebeneinander liest, haelt eine Zahl fuer kaputt.
--
-- `abzugleichen` zaehlt deshalb genau die Menge, die `runLeadPreparePass`
-- anfassen wuerde: unarchiviert, Status `new`, kein Entwurf. Damit steht auf
-- dem Knopf dieselbe Zahl wie in der Kachel darueber, und beide stimmen.

begin;

create or replace function public.admin_leadgen_pipeline_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with tagesbeginn as (
    select (date_trunc('day', now() at time zone 'Europe/Berlin'))
             at time zone 'Europe/Berlin' as ab
  ),
  leads as (
    select
      count(*) as gesamt,
      count(*) filter (where archived_at is null) as offen,
      count(*) filter (where archived_at is not null) as archiviert,
      count(*) filter (where status = 'replied') as beantwortet,
      count(*) filter (
        where archived_at is null
          and not exists (
            select 1 from public.shortlists s where s.lead_id = public.leadgen_queue.id
          )
      ) as nicht_abgeglichen,
      -- Dieselbe Auswahl wie im Abgleichlauf. Steht sie hier anders, luegt
      -- entweder die Kachel oder der Knopf.
      count(*) filter (
        where archived_at is null
          and status = 'new'
          and not exists (
            select 1 from public.leadgen_outreach o
             where o.lead_id = public.leadgen_queue.id
               and o.state = 'draft'
          )
      ) as abzugleichen
      from public.leadgen_queue
  ),
  abgleich as (
    select
      count(*) as abgeglichen,
      count(*) filter (where result_status = 'ranked') as treffer,
      count(*) filter (where result_status <> 'ranked') as ohne_treffer,
      count(*) filter (where lead_id is null) as abgleich_ohne_lead
      from public.shortlists
     where source = 'lead'
  ),
  post as (
    select
      count(*) filter (where state = 'sent') as verschickt,
      count(*) filter (where state = 'failed') as gescheitert,
      count(*) filter (where state = 'draft') as entwuerfe,
      count(*) filter (where state = 'draft' and origin = 'scheduler')
        as vorbereitet,
      count(*) filter (where state = 'sent' and lead_id is null)
        as beleg_ohne_lead,
      count(*) filter (
        where state = 'sent' and sent_at >= (select ab from tagesbeginn)
      ) as verschickt_heute,
      max(sent_at) filter (where state = 'sent') as zuletzt_verschickt
      from public.leadgen_outreach
  )
  select jsonb_build_object(
    'gesamt', leads.gesamt,
    'offen', leads.offen,
    'archiviert', leads.archiviert,
    'beantwortet', leads.beantwortet,
    'nicht_abgeglichen', leads.nicht_abgeglichen,
    'abzugleichen', leads.abzugleichen,
    'abgeglichen', abgleich.abgeglichen,
    'treffer', abgleich.treffer,
    'ohne_treffer', abgleich.ohne_treffer,
    'abgleich_ohne_lead', abgleich.abgleich_ohne_lead,
    'verschickt', post.verschickt,
    'gescheitert', post.gescheitert,
    'entwuerfe', post.entwuerfe,
    'vorbereitet', post.vorbereitet,
    'beleg_ohne_lead', post.beleg_ohne_lead,
    'verschickt_heute', post.verschickt_heute,
    'zuletzt_verschickt', post.zuletzt_verschickt
  )
  from leads, abgleich, post;
$$;

revoke all on function public.admin_leadgen_pipeline_summary()
  from public, anon, authenticated;
grant execute on function public.admin_leadgen_pipeline_summary()
  to service_role;

notify pgrst, 'reload schema';

commit;
