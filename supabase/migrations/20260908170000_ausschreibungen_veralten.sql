-- Ausschreibungen veralten nach dreißig Tagen.
--
-- In der Projektvermittlung ist eine vier Wochen alte Ausschreibung wertlos:
-- Die Stelle ist besetzt oder der Bedarf hat sich verschoben. Bisher lagen
-- nicht angeschriebene Leads neunzig Tage im Archiv, und angeschriebene ein
-- Jahr — samt ihrem Anzeigentext.
--
-- Das ist aus zwei Gründen schlecht. Es speichert fremde Inhalte länger als
-- nötig, und es füttert den geplanten Neuabgleich: Meldet sich später ein
-- Freelancer an, sollen archivierte Leads erneut geprüft werden — und dabei
-- darf kein halbes Jahr alter Text mitspielen.

begin;

-- 1. Nicht angeschriebene Leads: 90 → 30 Tage ------------------------------

update public.retention_policies
   set retention_days = 30,
       notes =
         'Leads aus öffentlichen Ausschreibungen, die nie angeschrieben '
         || 'wurden, werden 30 Tage nach dem Import restlos gelöscht. Eine '
         || 'ältere Ausschreibung ist in dieser Branche wertlos: Die Stelle '
         || 'ist besetzt oder der Bedarf hat sich verschoben.',
       updated_at = now()
 where record_type = 'leadgen_unhandled';

-- 2. Angeschriebene Leads behalten den Beleg, nicht den Text ---------------
--
-- Die Zeile bleibt ein Jahr, weil sie trägt, warum jemand Post bekommen hat.
-- Der Anzeigentext gehört nicht zu diesem Nachweis — was wir geschrieben
-- haben, steht in `leadgen_outreach.body_text`. Er wird deshalb nach dreißig
-- Tagen geleert, statt die Zeile länger zu behalten als nötig.

insert into public.retention_policies (
  record_type, retention_days, deletion_mode, is_enabled, notes
) values (
  'leadgen_posting_text',
  30,
  'hard_delete',
  true,
  'Der Ausschreibungstext eines angeschriebenen Leads wird nach 30 Tagen '
  || 'geleert. Die Zeile selbst bleibt als Nachweis der Kontaktaufnahme; der '
  || 'Text ist nicht Teil dieses Nachweises und in dieser Branche ohnehin '
  || 'veraltet. Ein Lead ohne Text kann auch nicht mehr neu abgeglichen werden.'
)
on conflict (record_type) do update
  set retention_days = excluded.retention_days,
      deletion_mode = excluded.deletion_mode,
      is_enabled = excluded.is_enabled,
      notes = excluded.notes,
      updated_at = now();

-- `stellenanzeige` ist NOT NULL. Der Text wird deshalb nicht auf NULL
-- gesetzt, sondern durch einen Vermerk ersetzt, der in der Oberfläche lesbar
-- ist und nicht wie ein Fehler aussieht.
create or replace function public.run_leadgen_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unhandled_days integer;
  v_contacted_days integer;
  v_text_days integer;
  v_unhandled integer := 0;
  v_contacted integer := 0;
  v_belege integer := 0;
  v_texte integer := 0;
  v_result jsonb;
begin
  select retention_days into v_unhandled_days
    from public.retention_policies
   where record_type = 'leadgen_unhandled'
     and is_enabled and deletion_mode = 'hard_delete';

  select retention_days into v_contacted_days
    from public.retention_policies
   where record_type = 'leadgen_contacted'
     and is_enabled and deletion_mode = 'hard_delete';

  select retention_days into v_text_days
    from public.retention_policies
   where record_type = 'leadgen_posting_text'
     and is_enabled and deletion_mode = 'hard_delete';

  if v_unhandled_days is not null then
    delete from public.leadgen_queue
     where last_contacted_at is null
       and created_at < now() - make_interval(days => v_unhandled_days);
    get diagnostics v_unhandled = row_count;
  end if;

  if v_contacted_days is not null then
    delete from public.leadgen_queue
     where last_contacted_at is not null
       and last_contacted_at < now() - make_interval(days => v_contacted_days);
    get diagnostics v_contacted = row_count;

    -- Der Beleg haengt nicht mehr am Lead und braucht deshalb seine eigene
    -- Frist. Gerechnet ab dem Versand, nicht ab dem Anlegen: Ein Entwurf,
    -- der nie rausging, ist kein Nachweis und faellt frueher.
    delete from public.leadgen_outreach
     where state = 'sent'
       and sent_at < now() - make_interval(days => v_contacted_days);
    get diagnostics v_belege = row_count;
  end if;

  if v_text_days is not null then
    update public.leadgen_queue
       set stellenanzeige = '[Ausschreibung nach '
             || v_text_days || ' Tagen entfernt — veraltet]',
           -- `search_text` bleibt unangetastet: eine generierte Spalte, die
           -- sich aus `stellenanzeige` selbst neu berechnet. Sie zuzuweisen
           -- bricht mit 428C9 ab und reißt den ganzen Aufräumlauf mit — beim
           -- ersten Probelauf genau so passiert.
           updated_at = now()
     where created_at < now() - make_interval(days => v_text_days)
       and stellenanzeige not like '[Ausschreibung nach%';
    get diagnostics v_texte = row_count;
  end if;

  v_result := jsonb_build_object(
    'leadgen_unhandled', v_unhandled,
    'leadgen_contacted', v_contacted,
    'leadgen_outreach', v_belege,
    'leadgen_posting_text', v_texte,
    'unhandled_retention_days', coalesce(v_unhandled_days, -1),
    'contacted_retention_days', coalesce(v_contacted_days, -1),
    'posting_text_retention_days', coalesce(v_text_days, -1)
  );

  insert into public.audit_events (
    actor_tombstone, action, target_type, outcome, metadata
  ) values (
    'system:leadgen-retention', 'leadgen_cleanup',
    'leadgen_queue', 'success', v_result
  );

  return v_result;
end;
$$;

commit;
