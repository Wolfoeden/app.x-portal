# Warum die Beschaffung nicht läuft

Befundbericht vom 8. September 2026, nach Romans Hinweis, dass beides nicht
funktioniert: der Knopf „Beschaffen" auf der Nachfrageseite und der
Neuabgleich der archivierten Leads.

**Es sind zwei verschiedene Fehler, und beide sind meine.** Der eine ist eine
Zeitgrenze, die ich übersehen habe, obwohl das Repo sie an anderer Stelle
ausdrücklich beschreibt. Der andere ist eine Zahl, die etwas anderes zählt,
als ich angenommen habe.

Nichts wurde für diesen Bericht geändert. Alle Zahlen stammen aus der
Produktionsdatenbank und aus Leseprüfungen gegen freelancermap.

---

## Was nachweislich funktioniert

Damit die Fehlersuche nicht ins Blaue geht, zuerst das Geprüfte. Lauf ohne
jede Schreiboperation, gegen die echte Quelle:

```
Skill-Verzeichnis          5.829 Einträge geladen
React        → reactjs         3 Profile, 2 ansprechbar, 0 Fehler
PostgreSQL   → postgresql      3 Profile, 2 ansprechbar, 0 Fehler
C++          → c-plus-plus     Pfad aufgelöst
Helpdesk     → helpdesk        Pfad aufgelöst
Ticketbearbeitung            KEIN PFAD (gibt es dort nicht)
Störungsbehebung             KEIN PFAD (gibt es dort nicht)
```

Die Quelle, die Pfadauflösung und das Auslesen der Profile sind in Ordnung.
Der Fehler liegt dahinter.

---

## Fehler 1: Der Knopf läuft in die Zeitgrenze

### Der Befund

Im Protokoll steht **kein einziges** `sourcing_demand_run`. Das Ereignis wird
geschrieben, *nachdem* `runDemandSourcing()` zurückgekehrt ist. Es fehlt also
nicht, weil niemand gedrückt hätte — Roman hat die Nachfrageseite an diesem
Nachmittag siebenmal geöffnet — sondern weil der Lauf nie bis dorthin kam.

### Die Ursache

Was hinter dem Knopf abläuft, gemessen an meinen eigenen Läufen:

| Schritt | Dauer |
|---|---|
| Skill-Verzeichnis laden (51 Sitemap-Dateien) | ~20 s |
| je Skill eine Listenseite + bis zu 4 Profile, 1,2 s Pause je Abruf | 10–20 s |
| Adressauflösung: abgeleitete Domains, dann Websuche | 15–45 s |
| **zusammen** | **45–85 s** |

Netlify beendet eine synchrone Funktion lange vorher. `export const
maxDuration = 300` in der Route ist wirkungslos — das ist eine Vercel-Angabe,
die Netlifys Grenze nicht anhebt.

**Das Repo weiß das bereits.** In `PrepareAllButton.tsx` steht seit Monaten:

> *„Eine Funktion, die alles in einem Zug versucht, läuft in die Zeitgrenze des
> Gateways, und ein Abbruch nach der Hälfte ließe niemanden wissen, welche
> Hälfte."*

Deshalb arbeitet `runLeadPreparePass()` mit einem **Zeitbudget von 20
Sekunden** (`TIME_BUDGET_MS`), meldet, was liegen blieb, und die Schleife läuft
im Browser. Ich habe diesen Bauplan gesehen, gelobt — und für die Beschaffung
nicht angewendet.

### Warum es unsichtbar blieb

Der `catch`-Zweig der Route schreibt **kein** Audit-Ereignis. Ein gescheiterter
Lauf hinterlässt damit keine Spur, und ich habe aus dem Fehlen von Spuren
geschlossen, es sei nichts passiert. Genau derselbe Fehler wie beim
verschluckten `rejected` und beim verlorenen Versandbeleg — zum dritten Mal an
einem Tag.

---

## Fehler 2: Die 237 sind nicht das, wofür ich sie gehalten habe

### Der Befund

Roman sieht auf der Leads-Seite **237 ohne Treffer** und erwartet, sie neu
abgleichen zu können. Mein Neuabgleich fand sieben. Beide Zahlen stimmen — sie
zählen Verschiedenes.

`admin_leadgen_pipeline_summary()` bildet die Kennzahl so:

```sql
select count(*) filter (where result_status <> 'ranked') as ohne_treffer
  from public.shortlists
 where source = 'lead'
```

Gezählt werden **Abgleichvorgänge**, nicht Leads. Und dazu:

```
shortlists mit source='lead'          285
davon lead_id IS NULL                 277   ← die Leadzeile existiert nicht mehr
davon ohne Treffer                    237

leadgen_queue: 407 eingefügt · 393 gelöscht · 8 übrig
```

Von 285 Abgleichen haben **277 keine Leadzeile mehr**. Beim Löschen der Leads
hat `on delete set null` das `lead_id` geleert. Übrig bleibt der Vorgang, nicht
der Empfänger.

### Warum diese 237 nicht wiederbelebt werden können

In `shortlists` steht der Bedarf (`brief_snapshot`) — aber weder Adresse noch
Firma. Was von der Person bleibt, ist `demand_actor`, ein **Pseudonym** der
Empfängeradresse. Aus einem Hash lässt sich keine Mail schicken.

Selbst wenn der Katalog heute passte: Es gibt niemanden, den man anschreiben
könnte. Mein Neuabgleich ist an dieser Stelle nicht falsch gebaut, sondern
**gegenstandslos**. Er sucht in `leadgen_queue`, und dort sind acht Zeilen.

### Wer löscht, ist weiterhin offen

Geprüft und ausgeschlossen: `run_leadgen_cleanup()` (meldet seit Tagen null,
auch heute), `run_retention_cleanup()` (fasst die Tabelle nicht an), alle
pg_cron-Jobs, die Edge Function `outreach-agent` (setzt `done`, hat noch nie
einen Lead verarbeitet — `outreach_log` ist leer), sämtliche Skripte unter
`C:\Users\roman\Documents` und `Desktop`.

Es bleibt: Dashboard, ein Werkzeug auf einem anderen Rechner, oder ein
angebundener Dienst. Ein Trigger schreibt seit heute bei jeder Löschung Rolle,
Anwendungsname und Herkunfts-IP ins Audit-Log.

---

## Der Plan

Die Reihenfolge folgt dem Nutzen, nicht der Bequemlichkeit.

### 1. Den Knopf auf das Hausmuster umbauen

Genau so, wie `PrepareAllButton` es vormacht: kurze Serveraufrufe, Schleife im
Browser, nach jedem Aufruf sichtbarer Fortschritt.

- `runDemandSourcing()` bekommt ein **Zeitbudget von 15 Sekunden** und einen
  Zustand: *welcher Skill ist dran, welche Kandidaten sind schon geprüft*. Es
  gibt zurück, was liegen blieb.
- Die Route wird zu einem **Schrittmacher**: ein Aufruf, ein Stück Arbeit, eine
  Antwort mit `remaining`.
- Der Knopf ruft sie in einer Schleife, bis `remaining === 0`, und zeigt nach
  jedem Schritt, was dazugekommen ist.
- **Das Skill-Verzeichnis wird zwischengespeichert.** 51 Sitemap-Dateien je
  Lauf zu holen ist der größte Einzelposten und ändert sich nicht stündlich.
  Eine Tabelle `sourcing_skill_index` mit Tagesstempel, oder eine Datei im
  Build — die Entscheidung fällt beim Bauen.

**Abnahme:** Ein Lauf über ein Nachfrageprofil bringt sichtbar Kandidaten, und
im Protokoll steht ein `sourcing_demand_run` — auch wenn nichts gefunden wurde.

### 2. Fehlschläge sichtbar machen

Vor allem anderen, weil ohne das jede weitere Diagnose rät.

- Der `catch`-Zweig **jeder** Beschaffungsroute schreibt ein Audit-Ereignis mit
  Fehlertext und Stelle.
- Der Knopf zeigt den Fehlertext, statt nur „Fehler 500".
- Regel für alles Weitere: *Ein Vorgang, der nichts hinterlässt, gilt als nicht
  gelaufen.*

### 3. Die Kennzahl sagen lassen, was sie meint

Auf der Leads-Seite steht heute „237 ohne Treffer" neben einem Knopf, der
sieben findet. Das ist die eigentliche Irreführung.

- `ohne_treffer` wird aufgeteilt in **„ohne Treffer, Lead vorhanden"** (7) und
  **„ohne Treffer, Lead gelöscht"** (237).
- Der Knopf nennt die Zahl, die er tatsächlich bearbeiten kann.
- Die 237 bekommen einen eigenen, ehrlichen Namen: *verlorene Abgleiche*.

### 4. Das Löschen abstellen

Der Melder läuft. Sobald die nächste Löschung protokolliert ist, steht dort,
wer es war. Bis dahin ist jede Arbeit am Neuabgleich verschwendet: Die
Warteschlange wird schneller geleert, als sie sich füllt.

Falls sich zeigt, dass die Löschung gewollt ist, muss vorher der Empfänger
gerettet werden — sonst ist jeder Lead nach dem Löschen unerreichbar. Dafür
gäbe es zwei Wege, und beide sind Entscheidungen für Roman, nicht für mich:
Empfängeradresse mit in `shortlists` aufnehmen, oder Leads statt Löschen auf
einen Endzustand setzen.

### 5. Erst danach: zwei Systeme auf einer Warteschlange

`leadgen_queue` wird von zwei Akquisewegen bedient — dem Next.js-Weg
(`leadgen_outreach`, `dismissed`) und der Edge Function `outreach-agent`
(`outreach_log`, `done`). Solange beide laufen, ist unklar, wer einen Lead
zuletzt angefasst hat. Das ist aufzuräumen, aber es ist nicht die Ursache der
beiden Fehler oben.

---

## Was ich anders machen muss

Ich habe dreimal an einem Tag aus fehlenden Fehlermeldungen auf Erfolg
geschlossen, und ich habe „funktioniert" gesagt, wo ich nur meine eigenen
Läufe gesehen hatte — mit lokalem Node, ohne die Zeitgrenze der Plattform.
Eine Zusage über eine Funktion ist erst dann belegt, wenn sie **dort** lief,
wo sie laufen soll, und **eine Spur** hinterlassen hat.
