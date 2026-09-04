-- Die Sperrliste für werbliche E-Mail.
--
-- Bis hierher gab es keinen Weg, eine Adresse dauerhaft vom Versand
-- auszunehmen. Der Fuß der Akquise-Mail versprach zwar, dass eine formlose
-- Antwort genügt — durchgesetzt hat das niemand außer dem Betreiber im Kopf.
-- Beim nächsten Import stand dieselbe Adresse wieder in der Arbeitsliste.
--
-- Drei Entscheidungen tragen diese Tabelle:
--
--   1. Gesperrt wird Werbung, nicht jede Nachricht. Ein Widerspruch nach
--      Art. 21 DSGVO richtet sich gegen Direktwerbung. Wer sich später selbst
--      anmeldet, bekommt weiterhin, was zu seinem Konto gehört:
--      Bestätigungen, Buchungen, Rechnungen. Diese Unterscheidung trifft der
--      Anwendungscode über die Art der Nachricht, nicht diese Tabelle — hier
--      steht nur, wer keine Werbung mehr will.
--   2. Die Adresse steht nicht im Klartext. Zum Vergleichen genügt ihr
--      SHA-256; eine Sperrliste im Klartext wäre ein zweiter Adressbestand,
--      angelegt ausgerechnet aus den Leuten, die keinen Kontakt wollten. Für
--      die Ansicht im Admin bleibt eine maskierte Form.
--   3. Ein Eintrag wird nicht gelöscht, sondern widerrufen. Wer sich später
--      mit derselben Adresse per Double-Opt-in anmeldet, hebt die Sperre auf
--      — und dann muss belegbar bleiben, warum wieder geschrieben werden
--      durfte. Ein gelöschter Eintrag beweist nichts.
--
-- Von den Löschfristen ausgenommen: `run_leadgen_cleanup()` räumt Leads nach
-- 90 beziehungsweise 365 Tagen ab. Liefe die Sperrliste mit, käme die Adresse
-- beim nächsten Import zurück und würde erneut angeschrieben. Genau das soll
-- der Eintrag verhindern, also bleibt er.

begin;

create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  -- 'address' sperrt ein Postfach, 'domain' ein ganzes Unternehmen. Der
  -- Unsubscribe-Link erzeugt nur 'address'; 'domain' setzt der Betreiber von
  -- Hand, wenn eine Firma für sich als Ganzes widerspricht.
  scope text not null check (scope in ('address', 'domain')),
  -- SHA-256 der kleingeschriebenen, getrimmten Adresse. Nur bei 'address'.
  email_hash text,
  -- Kleingeschriebene Domain, nur bei 'domain'. Im Klartext, weil sich
  -- „alles bei firma.de" nicht über den Hash einer Einzeladresse prüfen lässt.
  domain text,
  -- Was der Betreiber in der Liste sieht: 'd***k@firma.de'. Genug, um einen
  -- Eintrag wiederzuerkennen, zu wenig, um damit jemanden anzuschreiben.
  masked text,
  reason text not null check (reason in (
    'unsubscribe_link', 'reply', 'bounce', 'complaint', 'operator'
  )),
  -- Woher der Widerspruch kam. Frei, weil künftige Kanäle keine Migration
  -- kosten sollen.
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  constraint email_suppressions_shape_check check (
    (scope = 'address' and email_hash is not null and domain is null)
    or (scope = 'domain' and domain is not null and email_hash is null)
  ),
  constraint email_suppressions_hash_check check (
    email_hash is null or email_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint email_suppressions_domain_check check (
    domain is null or domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  ),
  constraint email_suppressions_revoke_shape_check check (
    (revoked_at is null and revoked_reason is null)
    or (revoked_at is not null and revoked_reason is not null)
  )
);

comment on table public.email_suppressions is
  'Adressen, die keine werbliche Post mehr bekommen — Cold Outreach und '
  'Newsletter. Transaktionsmails an angemeldete Nutzer bleiben unberührt; '
  'diese Unterscheidung trifft lib/email/deliver.ts über die Art der '
  'Nachricht. Von den Löschfristen ausgenommen.';
comment on column public.email_suppressions.email_hash is
  'SHA-256 der kleingeschriebenen Adresse. Der Klartext wird nicht '
  'gespeichert — zum Vergleichen braucht es ihn nicht.';
comment on column public.email_suppressions.revoked_at is
  'Gesetzt, wenn dieselbe Adresse später eine belegbare Einwilligung erteilt '
  'hat. Der Eintrag bleibt stehen: er ist der Beleg, warum wieder '
  'geschrieben werden durfte.';

-- Je Adresse und je Domain höchstens ein Eintrag. Ein zweiter Klick auf
-- denselben Link ist kein Fehler, sondern jemand, der sichergehen will.
create unique index if not exists email_suppressions_address_key
  on public.email_suppressions (email_hash)
  where email_hash is not null;

create unique index if not exists email_suppressions_domain_key
  on public.email_suppressions (domain)
  where domain is not null;

-- Die Ansicht im Admin: die geltenden Sperren, jüngste zuerst.
create index if not exists email_suppressions_active_idx
  on public.email_suppressions (created_at desc)
  where revoked_at is null;

drop trigger if exists email_suppressions_set_updated_at on public.email_suppressions;
create trigger email_suppressions_set_updated_at
  before update on public.email_suppressions
  for each row execute function private.set_updated_at();

-- Diese Zeilen gehören keinem angemeldeten Nutzer. Sie werden ausschließlich
-- serverseitig mit dem Service-Role-Schlüssel gelesen und geschrieben —
-- dieselbe Form wie bei `leadgen_outreach` und `contact_requests`.
alter table public.email_suppressions enable row level security;
alter table public.email_suppressions force row level security;
revoke all on public.email_suppressions from public, anon, authenticated;
grant select, insert, update, delete on public.email_suppressions to service_role;

-- 1. Die Prüfung vor jedem werblichen Versand ------------------------------
--
-- Als Funktion und nicht als Abfrage im Anwendungscode, damit Adress- und
-- Domainsperre in einem Durchlauf und nach denselben Regeln geprüft werden.
-- Der Aufrufer übergibt den Hash, nie die Adresse: sie soll auf diesem Weg
-- gar nicht erst in ein Datenbankprotokoll geraten.

create or replace function public.is_email_suppressed(
  p_email_hash text,
  p_domain text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.email_suppressions s
     where s.revoked_at is null
       and (
             (s.scope = 'address' and p_email_hash is not null and s.email_hash = p_email_hash)
          or (s.scope = 'domain'  and p_domain     is not null and s.domain     = lower(p_domain))
       )
  );
$$;

revoke all on function public.is_email_suppressed(text, text)
  from public, anon, authenticated;
grant execute on function public.is_email_suppressed(text, text) to service_role;

-- 2. Eintragen -------------------------------------------------------------
--
-- Idempotent: derselbe Link zweimal geklickt ergibt denselben einen Eintrag.
-- Ein bereits widerrufener Eintrag lebt wieder auf — wer nach einer Anmeldung
-- erneut abbestellt, meint das ernster als die Anmeldung.

create or replace function public.suppress_email(
  p_email_hash text,
  p_masked text,
  p_reason text,
  p_source text default null
)
returns table (suppressed boolean, was_new boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean := false;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    return query select false, false;
    return;
  end if;

  insert into public.email_suppressions as s (
    scope, email_hash, masked, reason, source
  ) values (
    'address', p_email_hash, p_masked, p_reason, p_source
  )
  on conflict (email_hash) where email_hash is not null do update
    set revoked_at = null,
        revoked_reason = null,
        reason = excluded.reason,
        source = coalesce(excluded.source, s.source),
        masked = coalesce(excluded.masked, s.masked)
  returning (xmax = 0) into v_new;

  return query select true, coalesce(v_new, false);
end;
$$;

revoke all on function public.suppress_email(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.suppress_email(text, text, text, text) to service_role;

-- 3. Aufheben --------------------------------------------------------------
--
-- Nur für den einen Fall, der es rechtfertigt: dieselbe Adresse hat später
-- eine belegbare Einwilligung erteilt. Der Eintrag wird markiert, nicht
-- entfernt.

create or replace function public.revoke_email_suppression(
  p_email_hash text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_email_hash is null or p_reason is null then
    return false;
  end if;

  update public.email_suppressions
     set revoked_at = now(),
         revoked_reason = p_reason
   where scope = 'address'
     and email_hash = p_email_hash
     and revoked_at is null;
  get diagnostics v_count = row_count;

  return v_count > 0;
end;
$$;

revoke all on function public.revoke_email_suppression(text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_email_suppression(text, text) to service_role;

-- 4. Die Frist, die es hier nicht gibt -------------------------------------
--
-- Der Eintrag im Register ist kein Formalismus: `docs/processor-register.md`
-- und die Löschfristen sollen zusammen erklären, warum jede Tabelle so lange
-- lebt, wie sie lebt. Für die Sperrliste lautet die Antwort „unbefristet",
-- und das gehört genauso festgehalten wie eine Frist. `operator_review` und
-- abgeschaltet, damit kein automatischer Lauf sie anfasst.

insert into public.retention_policies (
  record_type, retention_days, deletion_mode, is_enabled, notes
) values (
  'email_suppressions',
  3650,
  'operator_review',
  false,
  'Widersprüche gegen werbliche E-Mail. Bewusst ohne automatische Löschung: '
  || 'ein entfernter Eintrag führte dazu, dass dieselbe Adresse beim nächsten '
  || 'Import wieder angeschrieben wird. Gespeichert ist nur der SHA-256 der '
  || 'Adresse, keine Klartextadresse.'
)
on conflict (record_type) do update
  set retention_days = excluded.retention_days,
      deletion_mode = excluded.deletion_mode,
      is_enabled = excluded.is_enabled,
      notes = excluded.notes,
      updated_at = now();

notify pgrst, 'reload schema';

commit;
