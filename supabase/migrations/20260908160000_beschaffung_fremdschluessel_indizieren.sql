-- Indizes auf den Fremdschlüsseln der Beschaffung.
--
-- `query_plan_evidence.sql` verlangt zu jedem Fremdschlüssel im Schema `public`
-- einen Index, der mit dessen Spalten beginnt. Die vier neuen Schlüssel hatten
-- keinen, und der Acceptance-Test hat den Zweig zu Recht rot gemacht.
--
-- Der Grund für die Regel ist nicht die Abfrage, sondern das Löschen: Ohne
-- Index prüft PostgreSQL bei jedem `delete` auf der Zielzeile die verweisende
-- Tabelle mit einem vollständigen Durchlauf. Bei `auth.users` und
-- `freelancer_applications` heißt das, dass ein einzelner gelöschter Nutzer
-- drei Tabellen durchsucht — und die Löschung eines Kontos ist genau der
-- Vorgang, der nicht hängen bleiben darf.

begin;

create index if not exists freelancer_applications_converted_application_idx
  on public.freelancer_applications (converted_application_id)
  where converted_application_id is not null;

create index if not exists sourcing_automation_updated_by_idx
  on public.sourcing_automation (updated_by);

create index if not exists sourcing_outreach_application_idx
  on public.sourcing_outreach (application_id)
  where application_id is not null;

create index if not exists sourcing_runs_triggered_by_idx
  on public.sourcing_runs (triggered_by);

commit;
