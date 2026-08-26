-- Neue Kontingente: Gast drei Anfragen, Konto 300 Credits im Monat.
--
-- Die alten Werte standen nicht in einer Konfiguration, sondern als Prüfregel
-- im Schema: `usage_limit in (10, 100)`. Das ist der Grund, warum eine
-- Änderung an `AI_CREDITS_USER_TOTAL` folgenlos blieb — die Datenbank hätte
-- jede andere Zahl abgelehnt.
--
-- Die Aufzählung bleibt bewusst erhalten, statt sie durch einen Bereich zu
-- ersetzen. Sie ist die letzte Sicherung dagegen, dass ein Tippfehler in einer
-- Umgebungsvariablen jemandem versehentlich ein sechsstelliges Guthaben gibt.
--
--   0   — harter Stopp, für den Notfall
--   63  — Gast: drei Anfragen zu je 21 Credits (gemessenes p90 eines Briefs)
--   300 — angemeldetes Konto, monatlich erneuert
--
-- 10 und 100 bleiben zulässig, weil abgelaufene Perioden Historie sind. Sie
-- rückwirkend zu ändern würde eine Zusage behaupten, die es nie gab.

begin;

alter table public.ai_free_usage_accounts
  drop constraint if exists ai_free_usage_accounts_limit_check;

-- Nur anheben, nie senken: ein niedrigeres Kontingent würde Zeilen erzeugen,
-- in denen bereits mehr verbraucht ist als erlaubt, und damit die
-- Mengenprüfung `used + reserved <= usage_limit` verletzen.
update public.ai_free_usage_accounts
   set usage_limit = 300
 where is_anonymous = false
   and period_end > now()
   and usage_limit < 300;

update public.ai_free_usage_accounts
   set usage_limit = 63
 where is_anonymous = true
   and period_end > now()
   and usage_limit < 63;

alter table public.ai_free_usage_accounts
  add constraint ai_free_usage_accounts_limit_check
  check (usage_limit in (0, 10, 63, 100, 300));

notify pgrst, 'reload schema';

commit;
