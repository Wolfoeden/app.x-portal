-- Nimmt die Sperrliste zurück.
--
-- Ein Wort der Warnung, bevor das hier jemand ausführt: Mit der Tabelle
-- verschwinden die Widersprüche. Adressen, die ausdrücklich keine Werbung mehr
-- wollten, stehen danach beim nächsten Import wieder in der Arbeitsliste und
-- werden erneut angeschrieben. Wer diese Migration zurücknimmt, sollte den
-- Inhalt vorher wegsichern:
--
--   create table archiv_email_suppressions as
--     select * from public.email_suppressions;
--
-- Der Anwendungscode muss ohnehin mit zurück: `deliverEmail()` ruft
-- `is_email_suppressed` auf und schlüge sonst bei jeder werblichen Nachricht
-- fehl — was in dieser Richtung immerhin die sichere Seite wäre.

begin;

drop function if exists public.revoke_email_suppression(text, text);
drop function if exists public.suppress_email(text, text, text, text);
drop function if exists public.is_email_suppressed(text, text);

drop trigger if exists email_suppressions_set_updated_at on public.email_suppressions;

drop table if exists public.email_suppressions;

delete from public.retention_policies where record_type = 'email_suppressions';

notify pgrst, 'reload schema';

commit;
