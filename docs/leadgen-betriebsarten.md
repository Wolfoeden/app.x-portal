# Betriebsarten der Lead-Verarbeitung

Vorhaben für die Arbeitsfläche unter `/chat/admin/leads`: Der Betreiber soll
selbst bestimmen, **wann** Leads abgeglichen und **wann** die daraus
entstandenen Nachrichten verschickt werden — ohne dass jemand eine Migration
einspielt oder einen Zeitplan von Hand ändert.

Dieses Dokument ist so geschrieben, dass es ohne den Gesprächsverlauf
lesbar ist, in dem es entstanden ist.

## Ausgangslage (Stand 8. September 2026)

Die Verarbeitung zerfällt bereits in zwei Vorgänge, die nichts miteinander zu
tun haben außer der Reihenfolge:

| Vorgang | Funktion | Was er tut | Grenzen |
|---|---|---|---|
| **Abgleich** | `runLeadPreparePass()` in `lib/leadgen/match-run.ts` | liest die Ausschreibung mit `extractProjectBrief()` (dasselbe Modell wie der Chat), hält sie gegen den Katalog, legt bei einem Treffer einen fertigen Entwurf in `leadgen_outreach` an, archiviert Fehlschläge und vermerkt sie als Nachfrage in `shortlists` | Zeitbudget 20 s je Aufruf; kein Tageslimit, kein Zeitfenster — es verlässt nichts das Haus |
| **Versand** | `runLeadSendPass()` → `deliverPreparedDraft()` | stellt vorbereitete Entwürfe zu, prüft vorher, ob das angebotene Profil noch buchbar und der Entwurf jünger als 14 Tage ist | Tagesmenge `LEAD_BULK_SEND_LIMIT` = 20; Zeitfenster 8–12 Uhr Ortszeit, aber nur für den Zeitgeber |

Beide werden über **eine** Route ausgelöst: `POST /api/leadgen/run` mit
`{"mode": "prepare" | "send"}`. Zwei Aufrufer:

- **Zeitgeber**: `pg_cron` ruft `public.trigger_leadgen_run(mode)`, die das
  Geheimnis aus dem Supabase-Vault holt (`leadgen_run_token`,
  `leadgen_run_origin`) und per `pg_net` einen HTTP-POST absetzt.
- **Betreiber**: angemeldet im Browser, über die Knöpfe
  `PrepareAllButton` und `SendNowButton`, die dieselbe Route mehrfach
  hintereinander rufen, bis nichts mehr übrig ist.

Aktuelle Zeitpläne (alle Zeiten in **UTC**, denn `cron.timezone` steht auf
GMT):

```
xportal-leadgen-prepare   */10 3-14 * * *     alle 10 Min, täglich
xportal-leadgen-window    */10 6-11 * * 1-5   Versand, Mo–Fr
```

Das echte Versandfenster schneidet die Anwendung in Ortszeit zu
(`isWithinLeadSendWindow()` in `lib/leadgen/limits.ts`), damit die
Zeitumstellung es nicht verschiebt.

## Was fehlt

1. Ein **Schalter**, der die Betriebsart bestimmt und im Adminbereich bedient
   wird — nicht in einer Umgebungsvariablen und nicht im Zeitplan selbst.
2. Eine Betriebsart **„sofort bei Eingang"**: Ein neu importierter Lead soll
   abgeglichen werden, ohne bis zum nächsten Zehn-Minuten-Takt zu warten.
3. **Sichtbarkeit**: Welche Art ist aktiv, wann lief zuletzt etwas, wann
   läuft das nächste Mal etwas.

## Die drei Betriebsarten

Sie gelten **je Vorgang getrennt**. Das ist wesentlich: „Sofort" ist beim
Abgleich harmlos, beim Versand nicht — sonst gingen Werbemails nachts um drei
raus, weil das Importwerkzeug dann läuft.

| Art | Abgleich | Versand |
|---|---|---|
| `on_arrival` | beim Eintreffen neuer Leads | **nicht zulässig** |
| `scheduled` | nach Zeitplan (Vorgabe) | nach Zeitplan im Fenster 8–12 Uhr (Vorgabe) |
| `manual` | nur über den Knopf | nur über den Knopf |

Der Knopf funktioniert in **allen** Arten. `manual` heißt nicht „Knopf
verfügbar", sondern „von selbst passiert nichts".

## Umsetzung

### 1. Die Einstellung in der Datenbank

Neue Tabelle `public.leadgen_automation`, eine einzige Zeile — dasselbe
Muster wie `public.outreach_config`, das im Projekt schon existiert (dort
erzwingt eine `id boolean primary key default true` die Einzeiligkeit).

```sql
create table public.leadgen_automation (
  id boolean primary key default true check (id),
  prepare_mode text not null default 'scheduled'
    check (prepare_mode in ('on_arrival', 'scheduled', 'manual')),
  send_mode text not null default 'scheduled'
    check (send_mode in ('scheduled', 'manual')),
  -- Vorübergehend anhalten, ohne die Betriebsart zu verlieren.
  paused_until timestamptz,
  -- Übersteuert LEAD_BULK_SEND_LIMIT, wenn gesetzt.
  daily_limit integer check (daily_limit between 1 and 200),
  -- Wann der Eingangs-Trigger zuletzt gefeuert hat. Grundlage der Drosselung.
  last_arrival_trigger_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
```

RLS an, `force`, nur `service_role` darf lesen und schreiben — wie bei
`leadgen_queue`.

### 2. Der Zeitgeber liest die Einstellung

`trigger_leadgen_run(p_mode)` bekommt am Anfang eine Prüfung: Ist die
Betriebsart für diesen Vorgang nicht `scheduled`, oder ist `paused_until` in
der Zukunft, kehrt sie zurück, ohne eine Anfrage zu senden.

**Die Cron-Jobs bleiben bestehen.** Sie an- und abzumelden hieße, den Schalter
in `cron.job` zu verstecken; dort sieht ihn niemand, und ein späteres
`db push` würde ihn zurücksetzen.

### 3. „Sofort bei Eingang"

Ein Trigger auf `public.leadgen_queue`:

```sql
create trigger leadgen_queue_arrival
  after insert on public.leadgen_queue
  referencing new table as neu
  for each statement
  execute function private.leadgen_notify_arrival();
```

**`for each statement`, nicht `for each row`.** Ein Import schreibt
zweihundert Zeilen in einer Anweisung; ein Trigger je Zeile löste zweihundert
Läufe aus.

Die Funktion:

1. liest `leadgen_automation`; ist `prepare_mode <> 'on_arrival'` oder
   `paused_until` in der Zukunft → nichts tun;
2. **drosselt**: liegt `last_arrival_trigger_at` weniger als 60 Sekunden
   zurück → nichts tun. Ein Importwerkzeug, das in Häppchen schreibt, soll
   nicht fünfzig Läufe auslösen;
3. setzt `last_arrival_trigger_at = now()`;
4. ruft `public.trigger_leadgen_run('prepare')`.

Der HTTP-Aufruf über `pg_net` ist asynchron — er hält die einfügende
Transaktion nicht auf. Das ist wichtig, weil sonst ein Import an einer
langsamen Antwort hinge.

**Achtung bei der Drosselung:** Ein Durchgang sieht acht bis zwölf Leads
(ein KI-Aufruf je Lead dauert ein bis drei Sekunden). Ein Import von 200
Leads braucht also weiterhin viele Durchgänge — die liefert der reguläre
Zehn-Minuten-Takt, der in `on_arrival` **ebenfalls laufen sollte**. Sonst
bliebe nach dem einen sofortigen Durchgang der Rest liegen. Praktisch heißt
das: `on_arrival` ist `scheduled` **plus** ein Anstoß bei Eingang.

### 4. Der Zugriff im Anwendungscode

`lib/leadgen/automation.ts`:

- `readLeadAutomation()` — die Zeile, mit Vorgaben, wenn sie fehlt
- `updateLeadAutomation(patch, adminId)` — schreibt und protokolliert ein
  Audit-Ereignis

Die Route `POST /api/leadgen/run` prüft die Einstellung **nicht**: Sie ist der
Ausführende, nicht der Entscheider. Wer sie ruft, hat sich schon entschieden —
der Zeitgeber über die Prüfung in `trigger_leadgen_run()`, der Betreiber durch
seinen Klick.

`runLeadSendPass()` liest `daily_limit` aus der Einstellung, wenn gesetzt.

### 5. Die Bedienung

Ein schmaler Streifen auf `/chat/admin/leads`, in der Formensprache der
vorhandenen Filterreiter — kein Kasten, keine erklärende Karte:

```
Betrieb   Abgleich [ Sofort | Täglich | Manuell ]   Versand [ Täglich | Manuell ]
          Tagesmenge 20 · nächster Lauf 10:20 · [ Anhalten bis morgen ]
```

Umsetzung als Server Action oder kleine Route `PATCH /api/admin/leadgen/automation`,
mit `assertSameOrigin()` und `requireAdminUser()`.

Der bestehende Läufe-Streifen darunter bleibt — er ist die Kontrolle über das,
was tatsächlich geschah.

### 6. Tests

- **pgTAP**: Trigger feuert einmal je Anweisung, nicht je Zeile; die
  Drosselung greift; in `manual` und `scheduled` feuert er nicht;
  `paused_until` hält an; `anon` und `authenticated` kommen nicht an die
  Tabelle.
- **Vitest**: `readLeadAutomation()` mit fehlender Zeile; `daily_limit`
  übersteuert die Vorgabe; die Route bleibt von der Einstellung unberührt.

## Reihenfolge

1. Tabelle, Zugriff, Prüfung in `trigger_leadgen_run()` — danach wirkt der
   Schalter schon, auch ohne Oberfläche.
2. Bedienung auf der Leads-Seite.
3. Eingangs-Trigger samt Drosselung — zuletzt, weil er von allem anderen
   abhängt und am ehesten überrascht.

## Offene Frage, die vorher zu klären ist

**Wer schreibt und löscht in `leadgen_queue`?** Am 8. September verschwanden
234 Leads aus der Warteschlange — nicht durch `run_leadgen_cleanup()`, die
meldete für den Tag null, und nicht durch die Anwendung, die kein
Audit-Ereignis dazu hat. Eine Suche in `C:\Users\roman\Documents` fand kein
Werkzeug, das auf die Tabelle schreibt.

Solange das ungeklärt ist, lässt sich „sofort bei Eingang" nicht sinnvoll
auslegen: Ein Werkzeug, das die Tabelle leert und neu befüllt, löst mit jedem
Durchgang einen vollständigen Abgleich aus — und jeder Abgleich kostet einen
Modellaufruf je Lead.
