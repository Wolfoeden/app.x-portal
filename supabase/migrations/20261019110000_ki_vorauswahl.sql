-- KI-Vorauswahl für die Profilsuche (19.10.2026).
--
-- Die Suche läuft in zwei Stufen. Erst grenzt die Datenbank den Profilpool
-- auf die 20 Profile ein, die der Anfrage inhaltlich am nächsten sind; dann
-- bewertet die KI nur diese 20 und wählt die besten drei. So bleibt der
-- Tokenverbrauch je Suche gleich, egal wie groß der Pool wird.
--
-- Für die Eingrenzung bekommt jedes Profil einen Inhalts-Fingerabdruck
-- (Embedding). `input_hash` ist der Fingerabdruck der Angaben, aus denen er
-- entstand (Rolle, Kompetenzen, Branchen, Zusammenfassung …) samt Modell.
-- Ändert sich davon etwas, passt der Hash nicht mehr, und die nächste Suche
-- rechnet ihn neu. Es gibt deshalb keinen eigenen Job und keinen Trigger.
--
-- Kein Vektorindex: Die Suche ist auf die übergebenen Pool-Kennungen
-- beschränkt, und für einige hundert bis tausend Profile ist der
-- vollständige Vergleich schneller als ein Index, der danach filtert.
--
-- Nur der Server liest und schreibt (service_role); kein Zugriff für anon
-- oder authenticated. Idempotent, wie die übrigen Migrationen.

create extension if not exists vector with schema extensions;

create table if not exists public.freelancer_profile_embeddings (
  profile_id uuid primary key references public.freelancer_profiles (id) on delete cascade,
  input_hash text not null check (char_length(input_hash) between 16 and 128),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now()
);

comment on table public.freelancer_profile_embeddings is
  'Inhalts-Fingerabdruck je Profil für die Vorauswahl der Suche; neu berechnet, sobald input_hash nicht mehr passt. Nur service_role.';

alter table public.freelancer_profile_embeddings enable row level security;

revoke all on table public.freelancer_profile_embeddings from public, anon, authenticated;
grant select, insert, update, delete on table public.freelancer_profile_embeddings to service_role;

-- Die nächsten Profile aus dem übergebenen Pool. Nur Fingerabdrücke desselben
-- Modells sind vergleichbar; ein veralteter aus einem anderen Modell zählt
-- nicht, bis er neu berechnet ist.
create or replace function public.match_freelancer_profile_embeddings(
  query_embedding extensions.vector(1536),
  query_model text,
  candidate_ids uuid[],
  match_count integer default 20
)
returns table (profile_id uuid, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select
    e.profile_id,
    1 - (e.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.freelancer_profile_embeddings e
  where e.profile_id = any(candidate_ids)
    and e.model = query_model
  order by e.embedding operator(extensions.<=>) query_embedding, e.profile_id
  limit least(greatest(coalesce(match_count, 20), 1), 50);
$$;

revoke execute on function public.match_freelancer_profile_embeddings(extensions.vector, text, uuid[], integer)
  from public, anon, authenticated;
grant execute on function public.match_freelancer_profile_embeddings(extensions.vector, text, uuid[], integer)
  to service_role;

-- Die ganze Vorauswahl einer Suche, damit der Nutzer nach dem Neuladen
-- weiterhin alle 20 Profile durchsehen kann: Kennung und inhaltliche Nähe,
-- in der Reihenfolge der Anzeige. Die Profile selbst kommen beim Laden
-- frisch aus der Tabelle.
alter table public.shortlists
  add column if not exists candidate_snapshot jsonb not null default '[]'::jsonb;

alter table public.shortlists
  drop constraint if exists shortlists_candidate_snapshot_check,
  add constraint shortlists_candidate_snapshot_check
    check (
      jsonb_typeof(candidate_snapshot) = 'array'
      and jsonb_array_length(candidate_snapshot) <= 50
      and octet_length(candidate_snapshot::text) <= 16384
    );
