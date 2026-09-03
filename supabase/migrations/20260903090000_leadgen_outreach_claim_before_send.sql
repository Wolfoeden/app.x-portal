-- Den Lead beanspruchen, bevor die Mail rausgeht.
--
-- Die vorige Fassung prüfte in der Anwendung `last_contacted_at`, verschickte
-- und protokollierte danach. Zwischen Prüfung und Protokoll lag der Versand —
-- und in dieser Lücke konnten zwei Anfragen beide „noch nicht angeschrieben"
-- lesen. Beide hätten zugestellt, und erst danach hätte eine von ihnen
-- `already_sent` bekommen. Die zweite Mail wäre da schon beim Empfänger
-- gewesen, und das ist genau die Zusage, die bei einer Kaltansprache zählt.
--
-- Die Sperre gehört deshalb vor den Versand. Ein Eintrag im Zustand `sending`
-- belegt den Lead unter demselben eindeutigen Index wie ein verschickter; wer
-- ihn nicht bekommt, ruft den Mailserver gar nicht erst auf. Der Beleg liegt
-- damit schon vor der Zustellung vor — danach fehlt nur noch der Zeitpunkt.

begin;

alter table public.leadgen_outreach
  drop constraint if exists leadgen_outreach_state_check;
alter table public.leadgen_outreach
  add constraint leadgen_outreach_state_check
  check (state in ('draft', 'sending', 'sent', 'failed'));

alter table public.leadgen_outreach
  drop constraint if exists leadgen_outreach_sent_shape_check;
alter table public.leadgen_outreach
  add constraint leadgen_outreach_sent_shape_check
  check (
    (state = 'sent' and sent_at is not null)
    or (state <> 'sent' and sent_at is null)
  );

-- Ein laufender Versand belegt den Lead genauso wie ein abgeschlossener.
drop index if exists public.leadgen_outreach_one_sent_idx;
create unique index if not exists leadgen_outreach_one_active_idx
  on public.leadgen_outreach (lead_id)
  where state in ('sending', 'sent');

comment on index public.leadgen_outreach_one_active_idx is
  'Ein Lead wird höchstens einmal angeschrieben. Der Zustand sending belegt '
  'ihn bereits, damit zwei gleichzeitige Läufe nicht beide zustellen.';

-- 1. Beanspruchen ------------------------------------------------------------

create or replace function public.claim_leadgen_outreach(
  p_lead_id bigint,
  p_subject text,
  p_body text,
  p_model text,
  p_credits integer,
  p_created_by uuid
)
returns table (claimed boolean, reason text, outreach_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_lead_id is null or p_subject is null or p_body is null then
    return query select false, 'invalid_input'::text, null::uuid;
    return;
  end if;

  perform 1 from public.leadgen_queue where id = p_lead_id for update;
  if not found then
    return query select false, 'lead_not_found'::text, null::uuid;
    return;
  end if;

  begin
    insert into public.leadgen_outreach (
      lead_id, state, subject, body, model, credits, created_by
    ) values (
      p_lead_id, 'sending', p_subject, p_body, p_model, p_credits, p_created_by
    )
    returning id into v_id;
  exception when unique_violation then
    -- Ein anderer Lauf war schneller. Er verschickt, dieser hier nicht.
    return query select false, 'already_sent'::text, null::uuid;
    return;
  end;

  return query select true, null::text, v_id;
end;
$$;

revoke all on function public.claim_leadgen_outreach(
  bigint, text, text, text, integer, uuid
) from public, anon, authenticated;
grant execute on function public.claim_leadgen_outreach(
  bigint, text, text, text, integer, uuid
) to service_role;

-- 2. Abschließen -------------------------------------------------------------

create or replace function public.record_leadgen_outreach_sent(
  p_outreach_id uuid
)
returns table (recorded boolean, reason text, outreach_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id bigint;
begin
  update public.leadgen_outreach
     set state = 'sent',
         sent_at = now()
   where id = p_outreach_id
     and state = 'sending'
  returning lead_id into v_lead_id;

  if v_lead_id is null then
    return query select false, 'not_claimed'::text, null::uuid;
    return;
  end if;

  -- Der Entwurf hat seine Aufgabe erfüllt; was zählt, ist die abgeschickte
  -- Fassung.
  delete from public.leadgen_outreach
   where lead_id = v_lead_id and state = 'draft';

  update public.leadgen_queue
     set status = 'contacted',
         last_contacted_at = now(),
         archived_at = coalesce(archived_at, now())
   where id = v_lead_id;

  return query select true, null::text, p_outreach_id;
end;
$$;

revoke all on function public.record_leadgen_outreach_sent(uuid)
  from public, anon, authenticated;
grant execute on function public.record_leadgen_outreach_sent(uuid)
  to service_role;

-- Die alte Fassung nimmt niemand mehr; sie legte die Zeile erst nach dem
-- Versand an und trug damit genau die Lücke, die diese Migration schließt.
drop function if exists public.record_leadgen_outreach_sent(
  bigint, text, text, text, integer, uuid
);

-- 3. Wieder freigeben --------------------------------------------------------

create or replace function public.release_leadgen_outreach_claim(
  p_outreach_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.leadgen_outreach
     set state = 'failed',
         failure_reason = left(coalesce(p_reason, 'unknown'), 200)
   where id = p_outreach_id
     and state = 'sending';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.release_leadgen_outreach_claim(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_leadgen_outreach_claim(uuid, text)
  to service_role;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_indexes
     where schemaname = 'public'
       and indexname = 'leadgen_outreach_one_active_idx'
  ) then
    raise exception 'leadgen_outreach_one_active_idx fehlt — zwei gleichzeitige Läufe könnten beide zustellen.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
