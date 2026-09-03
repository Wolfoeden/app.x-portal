-- Die Arbeitsfläche für Leads aus der Akquise.
--
-- `leadgen_queue` wird von einem Werkzeug außerhalb dieser Anwendung befüllt:
-- es liest Projektausschreibungen und legt je Ausschreibung eine Zeile mit
-- Kontaktadresse an. Bis hierher war das eine Halde — 128 Zeilen, alle im
-- Status `new`, ohne Möglichkeit zu sehen, was davon schon bearbeitet ist.
--
-- Diese Migration macht daraus eine Arbeitsliste. Drei Gedanken tragen sie:
--
--   1. Bearbeitet heißt weg. Ein Lead, der angeschrieben oder verworfen
--      wurde, verschwindet aus der Standardansicht — `archived_at` ist
--      gesetzt. Die Liste zeigt die offenen Fälle, nicht die Historie. Wer
--      die Historie sehen will, filtert danach.
--   2. Ein Versand je Lead. Dass dieselbe Ausschreibung zweimal
--      angeschrieben wird, verhindert ein Index, nicht eine Prüfung im
--      Anwendungscode. Mehrere Leads dürfen dieselbe Adresse tragen — eine
--      Agentur schreibt mehrere Projekte aus, und jedes ist ein eigener
--      Anlass. Was nie zweimal passieren darf, ist derselbe Anlass.
--   3. Der verschickte Text bleibt stehen. Ohne den Wortlaut ist bei einer
--      Rückfrage nicht mehr zu klären, was zugesagt wurde. Der Entwurf einer
--      KI ist kein Beleg; die abgeschickte Fassung ist einer.
--
-- Keine `on delete cascade` von `auth.users` auf den Absender: wer eine Mail
-- verschickt hat, bleibt im Protokoll vermerkt, auch wenn das Konto später
-- verschwindet. Die Spalte fällt dann auf null zurück.

begin;

-- 0. Die Tabelle, die es in der Produktion schon gibt ----------------------
--
-- `leadgen_queue` wurde vom Importwerkzeug direkt angelegt, nicht über eine
-- Migration. In der Produktion steht sie also längst; eine frische Umgebung —
-- der pgTAP-Lauf in der fortlaufenden Integration etwa — kennt sie dagegen
-- nicht, und alles Folgende liefe dort ins Leere.
--
-- Deshalb steht die Form hier, so wie sie in der Produktion vorliegt. Wo die
-- Tabelle existiert, ändert `if not exists` nichts; wo sie fehlt, entsteht
-- dieselbe Tabelle. Ab hier ist der Zustand der Datenbank wieder aus dem
-- Repository herleitbar — die Voraussetzung dafür, dass ein Test überhaupt
-- etwas beweisen kann.

create table if not exists public.leadgen_queue (
  id bigint generated always as identity primary key,
  recipient_email text not null,
  recipient_name text,
  company text,
  stellenanzeige text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.leadgen_queue is
  'Leads aus öffentlichen Projektausschreibungen. Befüllt von einem Werkzeug '
  'außerhalb dieser Anwendung, gelesen und bearbeitet nur im Admin-Bereich.';

-- Dieselbe Ausschreibung soll nicht zweimal als Lead auftauchen.
create unique index if not exists leadgen_queue_stellenanzeige_key
  on public.leadgen_queue (stellenanzeige);

create index if not exists leadgen_queue_status_created_idx
  on public.leadgen_queue (status, created_at);

alter table public.leadgen_queue enable row level security;

-- 1. Was die Arbeitsliste braucht ------------------------------------------

alter table public.leadgen_queue
  add column if not exists category text,
  add column if not exists notes text,
  add column if not exists archived_at timestamptz,
  add column if not exists last_contacted_at timestamptz;

comment on column public.leadgen_queue.category is
  'Freie Einordnung durch den Betreiber, etwa nach Fachgebiet. Bewusst kein '
  'Aufzählungstyp: eine neue Kategorie soll keine Migration kosten.';
comment on column public.leadgen_queue.archived_at is
  'Gesetzt, sobald der Lead bearbeitet ist. Die Standardansicht zeigt nur '
  'Zeilen, in denen die Spalte leer ist.';
comment on column public.leadgen_queue.last_contacted_at is
  'Zeitpunkt des Versands. Steht auch dann hier, wenn das Protokoll später '
  'ausgedünnt wird, damit die Liste ohne Verbund erkennen kann, was raus ist.';

-- Die vier Zustände, die es tatsächlich gibt. `new` ist der Eingang,
-- `contacted` bedeutet, dass eine Mail rausging, `replied` wird von Hand
-- gesetzt, sobald jemand antwortet, und `dismissed` ist die bewusste
-- Entscheidung, diesen Lead nicht anzuschreiben.
update public.leadgen_queue
   set status = 'new'
 where status not in ('new', 'contacted', 'replied', 'dismissed');

alter table public.leadgen_queue
  drop constraint if exists leadgen_queue_status_check;
alter table public.leadgen_queue
  add constraint leadgen_queue_status_check
  check (status in ('new', 'contacted', 'replied', 'dismissed'));

-- Archiviert und trotzdem unbearbeitet wäre ein Widerspruch: die Ansicht
-- „offen" würde eine Zeile verschweigen, an der noch nichts geschehen ist.
alter table public.leadgen_queue
  drop constraint if exists leadgen_queue_archive_shape_check;
alter table public.leadgen_queue
  add constraint leadgen_queue_archive_shape_check
  check (archived_at is null or status <> 'new');

alter table public.leadgen_queue
  drop constraint if exists leadgen_queue_category_length_check;
alter table public.leadgen_queue
  add constraint leadgen_queue_category_length_check
  check (category is null or char_length(btrim(category)) between 1 and 40);

alter table public.leadgen_queue
  drop constraint if exists leadgen_queue_notes_length_check;
alter table public.leadgen_queue
  add constraint leadgen_queue_notes_length_check
  check (notes is null or char_length(notes) <= 2000);

-- `updated_at` stand auf `now()` als Vorgabe und blieb danach stehen. Für
-- eine Liste, die nach letzter Änderung sortiert werden soll, ist ein Wert,
-- der nur den Import beschreibt, wertlos.
drop trigger if exists leadgen_queue_set_updated_at on public.leadgen_queue;
create trigger leadgen_queue_set_updated_at
  before update on public.leadgen_queue
  for each row execute function private.set_updated_at();

-- 2. Suchen, ohne den Suchbegriff in eine Abfrage zu kleben -----------------
--
-- Die Oberfläche sucht über Name, Firma, Adresse und Ausschreibungstext. Als
-- zusammengesetzte Bedingung im Anwendungscode wäre der Suchbegriff Teil
-- eines Filterausdrucks — und ein Komma oder eine Klammer darin würde ihn
-- zerlegen. Eine erzeugte Spalte verschiebt das in die Datenbank: der
-- Suchbegriff ist danach ein Parameter und nichts weiter.

-- Ins `extensions`-Schema, nicht nach `public`: der Datenbank-Linter meldet
-- eine Erweiterung im Anwendungsschema als Befund, und der Index funktioniert
-- unabhaengig vom Suchpfad weiter.
create extension if not exists pg_trgm with schema extensions;

alter table public.leadgen_queue
  add column if not exists search_text text
  generated always as (
    coalesce(recipient_name, '') || ' ' ||
    coalesce(company, '') || ' ' ||
    coalesce(recipient_email, '') || ' ' ||
    coalesce(stellenanzeige, '') || ' ' ||
    coalesce(category, '')
  ) stored;

comment on column public.leadgen_queue.search_text is
  'Nur für die Volltextsuche der Admin-Liste. Nie anzeigen — die Spalte ist '
  'eine Kopie und veraltet nie, aber sie ist auch nicht formatiert.';

create index if not exists leadgen_queue_search_trgm_idx
  on public.leadgen_queue using gin (search_text gin_trgm_ops);

-- Die Standardansicht: offene Leads, neueste zuerst. Ein Teilindex, weil
-- genau diese Abfrage bei jedem Aufruf der Seite läuft.
create index if not exists leadgen_queue_open_idx
  on public.leadgen_queue (created_at desc)
  where archived_at is null;

create index if not exists leadgen_queue_archived_idx
  on public.leadgen_queue (archived_at desc)
  where archived_at is not null;

create index if not exists leadgen_queue_category_idx
  on public.leadgen_queue (category)
  where category is not null;

-- 3. Das Versandprotokoll ---------------------------------------------------

create table if not exists public.leadgen_outreach (
  id uuid primary key default gen_random_uuid(),
  lead_id bigint not null references public.leadgen_queue (id) on delete cascade,
  state text not null check (state in ('draft', 'sent', 'failed')),
  subject text not null check (char_length(subject) between 1 and 200),
  -- Platz fuer den Rahmen: protokolliert wird die abgeschickte Fassung
  -- mitsamt Anrede und rechtlichem Fuss, nicht der Entwurf des Modells.
  -- Der Fuss allein misst rund 1.000 Zeichen. Waere die Spalte so breit
  -- wie das Eingabefeld, liefe ein langer Text erst beim Protokollieren
  -- gegen die Grenze — also nachdem die Mail schon draussen ist.
  body text not null check (char_length(body) between 1 and 16000),
  -- Welches Modell den Entwurf geschrieben hat und was er gekostet hat. Null,
  -- wenn ein Mensch den Text selbst eingetippt hat.
  model text,
  credits integer check (credits is null or credits >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failure_reason text,
  constraint leadgen_outreach_sent_shape_check check (
    (state = 'sent' and sent_at is not null)
    or (state <> 'sent' and sent_at is null)
  ),
  constraint leadgen_outreach_failure_shape_check check (
    state = 'failed' or failure_reason is null
  )
);

comment on table public.leadgen_outreach is
  'Was an einen Lead geschrieben wurde: Entwurf, Versand oder gescheiterter '
  'Versuch. Der Wortlaut bleibt hier stehen, damit bei einer Rückfrage '
  'belegbar ist, was tatsächlich rausging.';

-- Ein Fremdschlüssel ohne führenden Index zwingt beim Löschen eines Leads zu
-- einem vollständigen Durchlauf dieser Tabelle. Dieselbe Regel wie in
-- 20260902090000_foreign_key_leading_indexes.sql.
create index if not exists leadgen_outreach_lead_idx
  on public.leadgen_outreach (lead_id, created_at desc);

create index if not exists leadgen_outreach_created_by_idx
  on public.leadgen_outreach (created_by)
  where created_by is not null;

-- Höchstens ein offener Entwurf je Lead: ein zweiter Knopfdruck ersetzt den
-- alten Text, statt eine zweite Fassung danebenzulegen.
create unique index if not exists leadgen_outreach_one_draft_idx
  on public.leadgen_outreach (lead_id)
  where state = 'draft';

-- Und höchstens ein Versand. Das ist die eigentliche Zusage: dieselbe
-- Ausschreibung wird nicht zweimal angeschrieben, auch nicht, wenn zwei
-- Stapelläufe gleichzeitig starten.
create unique index if not exists leadgen_outreach_one_sent_idx
  on public.leadgen_outreach (lead_id)
  where state = 'sent';

-- Diese Daten gehören keinem angemeldeten Nutzer. Sie werden ausschließlich
-- serverseitig mit dem Service-Role-Schlüssel gelesen und geschrieben, hinter
-- der Admin-Prüfung der Anwendung. Deshalb gar keine Policy, sondern
-- entzogene Rechte — dieselbe Form wie bei `contact_requests`.
alter table public.leadgen_outreach enable row level security;
alter table public.leadgen_outreach force row level security;

revoke all on public.leadgen_outreach from public, anon, authenticated;
grant select, insert, update, delete on public.leadgen_outreach to service_role;

-- `leadgen_queue` wurde außerhalb dieser Migrationen angelegt und trägt noch
-- eine Policy, die dasselbe erlaubt, was der Service-Role-Schlüssel ohnehin
-- darf. Sie wird durch dieselbe, engere Form ersetzt.
drop policy if exists "Service role full access" on public.leadgen_queue;
alter table public.leadgen_queue force row level security;
revoke all on public.leadgen_queue from public, anon, authenticated;
grant select, insert, update, delete on public.leadgen_queue to service_role;

-- 4. Die Liste, die die Oberfläche abfragt ---------------------------------
--
-- Als Funktion statt als Abfrage im Anwendungscode, aus zwei Gründen: der
-- Suchbegriff bleibt ein Parameter, und die Gesamtzahl für die Blätterei
-- entsteht im selben Durchlauf statt in einer zweiten Abfrage, die einen
-- anderen Stand sehen könnte.

create or replace function public.admin_list_leadgen_queue(
  p_search text default null,
  p_status text default null,
  p_category text default null,
  p_scope text default 'open',
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
  outreach_state text,
  outreach_subject text,
  outreach_created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select q.*
      from public.leadgen_queue q
     where (
             p_scope = 'all'
             or (p_scope = 'open' and q.archived_at is null)
             or (p_scope = 'archived' and q.archived_at is not null)
           )
       and (p_status is null or q.status = p_status)
       and (p_category is null or q.category = p_category)
       and (
             p_search is null
             or q.search_text ilike '%' || p_search || '%'
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
    o.state as outreach_state,
    o.subject as outreach_subject,
    o.created_at as outreach_created_at,
    counted.total as total_count
  from filtered f
  cross join counted
  -- Der jüngste Eintrag im Protokoll, damit die Zeile zeigen kann, ob ein
  -- Entwurf wartet oder schon etwas rausging.
  left join lateral (
    select l.state, l.subject, l.created_at
      from public.leadgen_outreach l
     where l.lead_id = f.id
     order by l.created_at desc
     limit 1
  ) o on true
  order by
    case when f.archived_at is null then f.created_at else f.archived_at end desc,
    f.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.admin_list_leadgen_queue(
  text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.admin_list_leadgen_queue(
  text, text, text, text, integer, integer
) to service_role;

-- 5. Die Zahlen über der Liste ---------------------------------------------

create or replace function public.admin_leadgen_queue_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
    )
  )
  from public.leadgen_queue;
$$;

revoke all on function public.admin_leadgen_queue_summary()
  from public, anon, authenticated;
grant execute on function public.admin_leadgen_queue_summary() to service_role;

-- 6. Versand und Archivierung in einem Schritt ------------------------------
--
-- Der Versand ist der einzige Vorgang, bei dem zwei Tabellen zusammenpassen
-- müssen: das Protokoll bekommt eine Zeile, der Lead wechselt den Status und
-- verschwindet aus der Arbeitsliste. Getrennt ausgeführt könnte das eine
-- gelingen und das andere nicht — eine verschickte Mail ohne Protokoll oder
-- ein archivierter Lead, den nie jemand angeschrieben hat.
--
-- Der eindeutige Index auf `state = 'sent'` ist die zweite Sicherung: läuft
-- derselbe Lead zweimal gleichzeitig durch, gewinnt genau ein Aufruf, der
-- andere bekommt `already_sent` zurück und hat nichts verändert.

create or replace function public.record_leadgen_outreach_sent(
  p_lead_id bigint,
  p_subject text,
  p_body text,
  p_model text,
  p_credits integer,
  p_created_by uuid
)
returns table (recorded boolean, reason text, outreach_id uuid)
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

  if exists (
    select 1 from public.leadgen_outreach
     where lead_id = p_lead_id and state = 'sent'
  ) then
    return query select false, 'already_sent'::text, null::uuid;
    return;
  end if;

  -- Der Entwurf hat seine Aufgabe erfüllt; was zählt, ist die abgeschickte
  -- Fassung. Er wird gelöscht, damit der Teilindex frei bleibt und die Zeile
  -- in der Oberfläche nicht weiter „Entwurf wartet" meldet.
  delete from public.leadgen_outreach
   where lead_id = p_lead_id and state = 'draft';

  insert into public.leadgen_outreach (
    lead_id, state, subject, body, model, credits, created_by, sent_at
  ) values (
    p_lead_id, 'sent', p_subject, p_body, p_model, p_credits, p_created_by, now()
  )
  returning id into v_id;

  update public.leadgen_queue
     set status = 'contacted',
         last_contacted_at = now(),
         archived_at = coalesce(archived_at, now())
   where id = p_lead_id;

  return query select true, null::text, v_id;
end;
$$;

revoke all on function public.record_leadgen_outreach_sent(
  bigint, text, text, text, integer, uuid
) from public, anon, authenticated;
grant execute on function public.record_leadgen_outreach_sent(
  bigint, text, text, text, integer, uuid
) to service_role;

-- 7. Wie lange die Adressen bleiben ---------------------------------------
--
-- In `leadgen_queue` stehen Namen und Adressen von Menschen, die nie mit
-- XPORTAL zu tun hatten — sie haben eine Ausschreibung veröffentlicht, mehr
-- nicht. Ein Vorrat solcher Zeilen ohne Ablaufdatum wäre ein Adressbestand
-- auf Verdacht. Zwei Fristen, weil es zwei Lagen gibt:
--
--   * Nie angefasst: 90 Tage ab Import. So lange ist eine Ausschreibung
--     ungefähr aktuell; danach ist die Zeile für den Zweck wertlos, zu dem
--     sie erhoben wurde, und wird gelöscht.
--   * Angeschrieben: 365 Tage ab dem Versand. Hier zählt der Nachweis — wer
--     zurückfragt, warum er Post bekommen hat, soll eine Antwort bekommen
--     können. Danach verschwindet Lead und Protokoll gemeinsam.
--
-- Ein Widerspruch endet die Frist sofort: der Lead wird von Hand auf
-- `dismissed` gesetzt und beim nächsten Lauf entfernt, weil er weder
-- angeschrieben wurde noch jünger als die Frist ist.

insert into public.retention_policies (
  record_type, retention_days, deletion_mode, is_enabled, notes
) values (
  'leadgen_unhandled',
  90,
  'hard_delete',
  true,
  'Leads aus öffentlichen Ausschreibungen, die nie angeschrieben wurden, '
  || 'werden 90 Tage nach dem Import restlos gelöscht.'
), (
  'leadgen_contacted',
  365,
  'hard_delete',
  true,
  'Angeschriebene Leads werden mitsamt Versandprotokoll 365 Tage nach der '
  || 'Kontaktaufnahme gelöscht. Die Frist trägt den Nachweis, warum jemand '
  || 'Post bekommen hat.'
)
on conflict (record_type) do update
  set retention_days = excluded.retention_days,
      deletion_mode = excluded.deletion_mode,
      is_enabled = excluded.is_enabled,
      notes = excluded.notes,
      updated_at = now();

create or replace function public.run_leadgen_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unhandled_days integer;
  v_contacted_days integer;
  v_unhandled integer := 0;
  v_contacted integer := 0;
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

  if v_unhandled_days is not null then
    delete from public.leadgen_queue
     where last_contacted_at is null
       and created_at < now() - make_interval(days => v_unhandled_days);
    get diagnostics v_unhandled = row_count;
  end if;

  if v_contacted_days is not null then
    -- Das Protokoll hängt per `on delete cascade` daran und geht mit.
    delete from public.leadgen_queue
     where last_contacted_at is not null
       and last_contacted_at < now() - make_interval(days => v_contacted_days);
    get diagnostics v_contacted = row_count;
  end if;

  v_result := jsonb_build_object(
    'leadgen_unhandled', v_unhandled,
    'leadgen_contacted', v_contacted,
    'unhandled_retention_days', coalesce(v_unhandled_days, -1),
    'contacted_retention_days', coalesce(v_contacted_days, -1)
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

revoke all on function public.run_leadgen_cleanup() from public, anon, authenticated;
grant execute on function public.run_leadgen_cleanup() to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'xportal-leadgen-retention-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
select cron.schedule(
  'xportal-leadgen-retention-daily',
  '55 2 * * *',
  'select public.run_leadgen_cleanup();'
);

-- 8. Die Zusage nachprüfen --------------------------------------------------
--
-- Was diese Migration verspricht, ist genau eine Sache: derselbe Lead wird
-- nicht zweimal angeschrieben. Wenn der Teilindex fehlt, fällt das sonst erst
-- auf, wenn zwei Mails beim selben Empfänger liegen.

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_indexes
     where schemaname = 'public'
       and indexname = 'leadgen_outreach_one_sent_idx'
  ) then
    raise exception 'leadgen_outreach_one_sent_idx fehlt — ein Lead könnte zweimal angeschrieben werden.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'leadgen_queue_archive_shape_check'
       and conrelid = 'public.leadgen_queue'::regclass
  ) then
    raise exception 'leadgen_queue_archive_shape_check fehlt — ein unbearbeiteter Lead könnte archiviert werden.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
