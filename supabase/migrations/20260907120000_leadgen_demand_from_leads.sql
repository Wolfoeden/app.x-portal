-- Nachfrage, die aus einem Lead entsteht.
--
-- Die Nachfrageanalyse liest `shortlists`: je Suche eine Zeile mit dem Brief,
-- dem Ergebnis und der Zahl der Treffer. Bisher konnte diese Zeile nur
-- entstehen, wenn ein angemeldeter Nutzer im Chat gesucht hat.
--
-- Eine Ausschreibung, zu der der Katalog niemanden führt, ist aber dieselbe
-- Information: jemand sucht etwas, das wir nicht anbieten. Der Unterschied ist
-- allein, dass diese Person kein Konto hat und nie eines anlegen wird — sie hat
-- ihr Projekt auf einer Projektbörse veröffentlicht, nicht bei uns.
--
-- Deshalb keine zweite Tabelle. Zwei Quellen für dieselbe Auswertung wären zwei
-- Abfragen, zwei Aggregationen und irgendwann zwei Wahrheiten darüber, wonach
-- gesucht wird. Stattdessen wird `shortlists` um die Herkunft erweitert, und
-- die Spalten, die es nur bei einer Nutzersuche gibt, werden nullbar.

begin;

-- 1. Die Herkunft ----------------------------------------------------------

alter table public.shortlists
  add column if not exists source text not null default 'user_search',
  add column if not exists lead_id bigint
    references public.leadgen_queue (id) on delete set null;

comment on column public.shortlists.source is
  'Woher die Suche kam: user_search aus dem Chat, lead aus einer '
  'Projektausschreibung, die die Akquise abgeglichen hat.';
comment on column public.shortlists.lead_id is
  'Der Lead, aus dem diese Zeile entstand. Bleibt beim Löschen des Leads '
  'leer stehen: die Nachfrage bleibt wahr, auch wenn der Lead weg ist.';

alter table public.shortlists
  drop constraint if exists shortlists_source_check;
alter table public.shortlists
  add constraint shortlists_source_check
  check (source in ('user_search', 'lead'));

-- Ein Fremdschlüssel ohne führenden Index zwingt beim Löschen eines Leads zu
-- einem vollständigen Durchlauf. Dieselbe Regel wie in
-- 20260902090000_foreign_key_leading_indexes.sql.
create index if not exists shortlists_lead_idx
  on public.shortlists (lead_id)
  where lead_id is not null;

-- 2. Wer gesucht hat --------------------------------------------------------
--
-- Die Auswertung zählt nicht Suchen, sondern Suchende: „acht Anfragen von zwei
-- Firmen" ist etwas anderes als „acht Firmen". Bei einer Nutzersuche ist das
-- die Konto-Kennung. Ein Lead hat keine, und dieselbe Agentur schreibt
-- mehrfach aus — K-Recruiting steht vierzehnmal in der Warteschlange.
--
-- Die Empfängeradresse wäre die richtige Kennung, hat in dieser Tabelle aber
-- nichts verloren: Sie stünde damit ein zweites Mal in der Datenbank, an einer
-- Stelle, die nur Statistik betreibt. Eingetragen wird deshalb ein
-- Pseudonym — ein HMAC über die Adresse, gebildet im Anwendungscode.

alter table public.shortlists
  add column if not exists demand_actor text;

comment on column public.shortlists.demand_actor is
  'Stabile Kennung des Suchenden für die Nachfrageanalyse: die Konto-Kennung '
  'bei einer Nutzersuche, ein Pseudonym der Empfängeradresse bei einem Lead. '
  'Nie anzeigen — die Spalte zählt Akteure, sie benennt keine.';

update public.shortlists
   set demand_actor = owner_user_id::text
 where demand_actor is null;

-- Die Spalte ist Pflicht, wird aber nachgetragen, wenn der Aufrufer sie nicht
-- kennt.
--
-- Der Grund ist die Reihenfolge von Migration und Auslieferung: Zwischen
-- beidem läuft die vorige Fassung der Anwendung weiter, und die weiß von
-- dieser Spalte nichts. Ohne den Nachtrag schlüge in diesem Fenster jede
-- Suche im Chat fehl — eine Migration, die eine laufende Anwendung anhält,
-- ist keine, die man mittags einspielen kann.
--
-- Nur für Nutzersuchen: Bei einer Lead-Zeile ist `owner_user_id` leer, es
-- gäbe nichts nachzutragen, und die Zeile fällt zu Recht durch.
create or replace function private.set_shortlist_demand_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.demand_actor is null and new.owner_user_id is not null then
    new.demand_actor := new.owner_user_id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists shortlists_set_demand_actor on public.shortlists;
create trigger shortlists_set_demand_actor
  before insert on public.shortlists
  for each row execute function private.set_shortlist_demand_actor();

alter table public.shortlists
  alter column demand_actor set not null;

alter table public.shortlists
  drop constraint if exists shortlists_demand_actor_length_check;
alter table public.shortlists
  add constraint shortlists_demand_actor_length_check
  check (char_length(btrim(demand_actor)) between 1 and 200);

create index if not exists shortlists_demand_actor_idx
  on public.shortlists (demand_actor);

-- 3. Was eine Nutzersuche hat und ein Lead nicht ---------------------------
--
-- `project_id` und `owner_user_id` verweisen auf ein Projekt und ein Konto.
-- Beides entsteht erst, wenn jemand angemeldet ist. Für einen Lead gibt es
-- keins von beidem, und eins zu erfinden — ein Schattenkonto, ein Projekt
-- ohne Eigentümer — hieße, sich die Voraussetzung hinzuschreiben, statt die
-- Regel zu ändern.
--
-- Die Spalten werden nullbar, und je Herkunft gilt genau eine Form. So kann
-- eine Nutzersuche nicht ohne Konto entstehen und ein Lead nicht mit einem.

alter table public.shortlists
  alter column project_id drop not null,
  alter column owner_user_id drop not null;

alter table public.shortlists
  drop constraint if exists shortlists_source_shape_check;
alter table public.shortlists
  add constraint shortlists_source_shape_check
  check (
    (
      source = 'user_search'
      and project_id is not null
      and owner_user_id is not null
      and lead_id is null
    )
    or (
      source = 'lead'
      and project_id is null
      and owner_user_id is null
      and lead_id is not null
    )
  );

-- 4. Wer die neuen Zeilen sehen darf ---------------------------------------
--
-- `shortlists_select_own` vergleicht `auth.uid()` mit `owner_user_id`. Bei
-- einer Lead-Zeile ist die Spalte leer, der Vergleich ergibt null und die
-- Bedingung ist nicht erfüllt — niemand sieht sie. Das ist bereits richtig,
-- steht aber nur zufällig so da. Die Fassung hier sagt es ausdrücklich, damit
-- niemand die Herkunft später für belanglos hält.

drop policy if exists shortlists_select_own on public.shortlists;
create policy shortlists_select_own
  on public.shortlists for select to authenticated
  using (
    source = 'user_search'
    and (select auth.uid()) is not null
    and (select auth.uid()) = owner_user_id
  );

comment on policy shortlists_select_own on public.shortlists is
  'Nur die eigenen Suchen aus dem Chat. Zeilen aus der Akquise gehören keinem '
  'angemeldeten Nutzer und werden ausschließlich serverseitig gelesen.';

-- 5. Ein Ergebnis je Lead ---------------------------------------------------
--
-- Der Tageslauf soll denselben Lead nicht bei jedem Durchgang erneut als
-- Nachfrage zählen. Ein Index ist die Zusage, keine Prüfung im
-- Anwendungscode: zwei gleichzeitige Läufe würden sonst beide einfügen.

create unique index if not exists shortlists_one_per_lead_idx
  on public.shortlists (lead_id)
  where lead_id is not null;

commit;
