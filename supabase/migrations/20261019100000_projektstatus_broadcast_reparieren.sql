-- Projektstatus-Broadcast mit der richtigen Argumentreihenfolge (19.10.2026).
--
-- Der Trigger kam nach dem 14.10.2026 direkt in die Datenbank, ohne Migration.
-- Er rief realtime.send(topic, event, payload, private) auf; die Funktion
-- heißt aber realtime.send(payload jsonb, event text, topic text, private
-- boolean). Postgres fand keine passende Funktion und brach das UPDATE ab.
--
-- Der Zweig läuft nur, wenn sich der Status ändert, also wenn eine Suche
-- einen Treffer findet (matching -> shortlisted). Genau diese Suchen endeten
-- mit project_chat_failed: Treffer und Antwort waren gespeichert, das Projekt
-- blieb auf "matching", und im Chat kam nur die Fehlermeldung an.
--
-- realtime.send fängt eigene Fehler selbst ab und meldet sie als Warnung;
-- mit der richtigen Signatur kann der Broadcast das Projekt-Update also
-- nicht mehr verhindern.

create or replace function public.broadcast_project_status_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if old.status is distinct from new.status then
    perform realtime.send(
      jsonb_build_object(
        'project_id', new.id,
        'status', new.status,
        'updated_at', new.updated_at
      ),
      'project_status_changed',
      'project:' || new.id::text,
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists broadcast_project_status_change on public.projects;
create trigger broadcast_project_status_change
  after update of status on public.projects
  for each row execute function public.broadcast_project_status_change();
