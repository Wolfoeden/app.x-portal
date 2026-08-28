-- Profilbilder aus dem öffentlichen Bucket holen.
--
-- `freelancer-avatars` war öffentlich. Wer die Adresse hatte, kam an das Bild —
-- unabhängig davon, ob das Profil noch aktiv war, ob das Foto längst ersetzt
-- worden war oder ob der Abrufende überhaupt angemeldet war. Der Pfad enthält
-- 32 Zufallszeichen und ist damit praktisch nicht erratbar, aber das ist ein
-- Auffindbarkeitsproblem für den Angreifer, kein Zugriffsschutz. Ein
-- Porträtfoto ist ein personenbezogenes Datum, und Art. 25 DSGVO verlangt für
-- solche Daten die datenschutzfreundliche Voreinstellung.
--
-- Der Lebenslauf im Nachbar-Bucket macht es längst richtig: privat, Abruf über
-- eine kurzlebige signierte URL. Die Avatare ziehen hier nach.
--
-- REIHENFOLGE: Erst die Anwendung ausrollen, dann diese Migration einspielen.
-- Die neue Bildroute (`/api/freelancer/avatar-image/…`) erzeugt signierte URLs,
-- die auch für einen noch öffentlichen Bucket funktionieren — umgekehrt wäre
-- jedes Profilbild zwischen Migration und Deploy tot.

begin;

update storage.buckets
   set public = false,
       file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'freelancer-avatars';

-- Ohne Bucket keine stille Nicht-Änderung: Wenn hier nichts getroffen wurde,
-- läuft die Anwendung gegen einen Bucket, den diese Migration nicht kennt.
do $$
begin
  if not exists (
    select 1 from storage.buckets
     where id = 'freelancer-avatars' and public is false
  ) then
    raise exception
      'Bucket freelancer-avatars fehlt oder ist weiterhin öffentlich.';
  end if;
end;
$$;

commit;
