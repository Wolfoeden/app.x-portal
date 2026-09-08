# Beschaffung aus der Nachfrage

Vorhaben: Aus den Nachfrageprofilen unter `/chat/admin/demand` sollen Suchläufe
entstehen, die passende Menschen im Netz finden und zur Anmeldung auf XPORTAL
einladen. Heute endet die Auswertung mit der Empfehlung „Beschaffen" — und
niemand beschafft.

Dieses Dokument ist ohne den Gesprächsverlauf lesbar, in dem es entstand.

## Ausgangslage (8. September 2026)

Die Kette hat vier Glieder. **Drei davon sind gebaut.** Sie stehen still, weil
das erste fehlt.

| Glied | Wo | Zustand |
|---|---|---|
| 1. Bedarf → Suchauftrag | — | **fehlt** |
| 2. Suchlauf im Netz | `searchExternalFreelancers()` in `lib/openai/external-freelancer-search.ts` | gebaut, aber nur über `POST /api/freelancer-search` erreichbar: verlangt ein Projekt, einen angemeldeten Eigentümer und dessen Credits |
| 3. Treffer → Kandidat | `sourced-candidate-import.ts`, Knopf in `outreach/SearchRunsPanel.tsx` | gebaut, **nie benutzt** |
| 4. Kandidat → Einladung | `lib/freelancer/outreach.ts` + `outreach-send.ts` | gebaut, **nie benutzt** |

Die Zahlen aus der Datenbank:

```
shortlists (Bedarfssignale, 90 Tage)          439
external_freelancer_search_results             11   (8 mit Treffern)
freelancer_applications source=web_research     0
freelancer_profiles active                     66
```

Elf Suchläufe in fünf Wochen, acht davon mit Treffern — und kein einziger
Treffer wurde je übernommen. Das Portal hat bereits im Netz gefundene, passende
Menschen gesehen und wieder vergessen. Das ist die eigentliche Lücke, nicht die
Suchtechnik.

## Was die Nachfrage heute hergibt

Je Projekt zählt der jüngste Matching-Lauf, 90 Tage, ohne interne Konten —
dieselbe Regel wie auf der Admin-Seite. Die Beschaffungsliste von heute:

| Nachfrageprofil | Bedarfe | ohne Match | Befund |
|---|---:|---:|---|
| React + TypeScript | 14 | 12 | härteste Lücke, wiederkehrend |
| C++ | 7 | 7 | keine Deckung |
| Helpdesk + Ticketbearbeitung | 6 | 6 | keine Deckung |
| Large Language Models + RAG | 12 | 4 | teilweise gedeckt |
| SAFe + User Stories | 3 | 3 | keine Deckung |
| SAP PP + S/4HANA, SAP Customizing | je 2 | je 2 | keine Deckung |
| FastAPI + Python | 2 | 2 | keine Deckung |

Zum Vergleich die gedeckte Seite: SAP S/4HANA 32 Bedarfe, 0 ohne Match;
Requirements Management 18 / 0. Der Katalog trägt, wo er trägt — und fällt bei
Frontend, Systemnahem und First-Level-Support vollständig aus.

Ein Nachfrageprofil hält bereits alles, was ein Suchauftrag braucht:
Pflichtkompetenzen, Ort, Arbeitsform, Sprache. Es fehlt nur die Umschaltung von
Auswertung auf Auftrag.

## Die Quelle: freelancermap statt bezahlter Websuche

Nachtrag vom 8. September, nach Messung an beiden Portalen.

**freelancermap trägt.** Rund 116.000 Profile, öffentlich und serverseitig
gerendert, `robots.txt` erlaubt sie ausdrücklich. Jedes Profil liefert
`schema.org`-Daten: `Person` mit Name und Rolle, `PostalAddress` mit Ort und
Land, `Offer` mit Stundensatz — dazu Skills, Sprachen mit Niveau und
Projekthistorie im Text. Und es gibt je Skill eine eigene Liste, also genau die
Achse, auf der unsere Nachfrageprofile liegen.

Gemessener Lauf über fünf unserer Lücken, vier Profile je Lücke:

```
TypeScript   54–120 €/h   3/4 mit Namen
React        44–118 €/h   2/4
C++          49–121 €/h   3/4
Helpdesk     35–122 €/h   3/4
PostgreSQL   52–121 €/h   4/4
Störungsbehebung — keine Liste bei freelancermap
                                    zusammen 15/20 ansprechbar
```

Zum Vergleich: Die bezahlte Websuche hat in acht Läufen dreizehn Menschen
gefunden. Ein einziger freelancermap-Lauf über fünf Lücken liefert zwanzig,
kostet nichts und bringt Stundensatz, Ort und Sprachniveau gleich mit.

**GULP scheidet aus.** Die Expertensuche zeigt 4.667 Profile, aber
**anonymisiert**: kein Name, nur eine Überschrift („Senior Fullstack Developer |
B2B | …"), und die Profilseite verlangt eine Anmeldung als GULP-Direkt-Kunde.
Ohne Namen gibt es keine Person, die man einladen könnte. GULP taugt als
Marktsignal für Stundensätze, nicht als Quelle für Kandidaten.

### Drei Fallen, die beim Bauen aufgefallen sind

1. **Ein unbekannter Skill-Pfad liefert HTTP 200 und eine gefüllte Liste** — nur
   die allgemeine statt der gesuchten. `/freelancer/react` und
   `/freelancer/cpp` sehen aus wie Erfolge und bringen achtzehn Menschen, die
   mit dem Bedarf nichts zu tun haben. Der Seitentitel unterscheidet die
   beiden zuverlässig; `isSkillPage()` prüft ihn, bevor ein Profil geöffnet wird.
2. **Ihre Skillnamen sind nicht unsere.** React heißt dort `reactjs`, C++ heißt
   `c-plus-plus`, `postgres` führt ins Leere. Deshalb wird der Name nicht
   geraten, sondern im Verzeichnis nachgeschlagen: `sitemap.xml` →
   `categories-profile.xml` → fünfzig Teillisten mit **5.828 Skill-Seiten**.
   Was dort fehlt, bekommt einen einzelnen Probeabruf — so wurde `c-plus-plus`
   gefunden, das im Verzeichnis nicht steht.
3. **Ein Stundensatz von 1 € ist kein Preis**, sondern ein Pflichtfeld, das
   jemand ausgefüllt hat, um weiterzukommen. Unter 10 €/h gilt die Angabe als
   fehlend, sonst stünde eine Falschbehauptung über eine Person im Katalog.

### Und die E-Mail-Adresse?

**Auf freelancermap gibt es keine.** Der Kontakt läuft über deren eigenes
Formular; auf den geprüften Profilen stand weder eine Adresse noch ein Link auf
eine eigene Seite der Person. Die Adresse bleibt damit ein eigener Schritt, und
die Arbeitsteilung ist:

| Quelle | liefert | liefert nicht |
|---|---|---|
| freelancermap | Person, Skills, Ort, Satz, Sprachen, Verfügbarkeit | Adresse |
| Websuche | Adresse über die eigene Seite und deren Impressum | wenig Personen |

Die bezahlte Websuche wird damit vom Kandidatenfinder zum **Adressauflöser**:
ein Aufruf je bereits gefundener Person, mit Name und Rolle im Auftrag, Ziel
Impressum. Wer keine Adresse bekommt, bleibt `manuell` — für ihn gibt es den
Text zum Kopieren und das Kontaktformular der Plattform.

### Welches Postfach benutzt werden darf

Eine Adresse zu finden reicht nicht; sie muss auch der Person gehören. Der
Unterschied, um den es geht: Wer bei einer Firma **angestellt** ist und nebenher
freiberuflich arbeitet, wird nicht über das allgemeine Postfach dieser Firma
angeschrieben. Das Postfach gehört dem Arbeitgeber, und eine Anfrage an den
Nebenerwerb kann der Person dort schaden. Die **Projektfirma**, die Aufträge im
Team übernimmt, ist der umgekehrte Fall: Dort ist die allgemeine Adresse genau
der richtige Weg.

Unterschieden wird an einer Frage, die sich ohne Raten beantworten lässt:
**Steht die Person im Impressum als Verantwortliche?** Also als Inhaber,
Geschäftsführerin, „vertreten durch" oder inhaltlich Verantwortlicher. Wer dort
steht, dem gehört das Postfach — sei es sein Einzelunternehmen oder seine
Projektfirma. Wer nicht dort steht, ist für diese Seite ein Dritter.

`lib/sourcing/address.ts` setzt das um und gibt je Adresse ein Urteil:

| Urteil | Bedeutung |
|---|---|
| `usable` | Die Adresse trägt den Namen der Person. |
| `usable_team` | Sammelpostfach, aber die Person steht im Impressum — ihre eigene Firma. |
| `third_party_mailbox` | Sammelpostfach eines Dritten. **Der Arbeitgeberfall.** Nicht benutzen. |
| `wrong_purpose` | `bewerbung@`, `datenschutz@`, `rechnung@`, `noreply@` und Ähnliches. |
| `foreign_domain` | Die Adresse liegt nicht auf der Domain der besuchten Seite. |

Der Vorname allein bindet eine Adresse sonst nicht an eine Person — `max@`
träfe zu viele. Auf einer Seite, die der Person nachweislich gehört, gilt er
dagegen: Dort gibt es keinen zweiten Max, dem das Postfach gehören könnte.

### Was in der Nachricht steht

Der bisherige Satz „Ein Unternehmen sucht Unterstützung für: React +
TypeScript" sagt einem Freelancer zu wenig, um zu antworten. Er will wissen,
worum es geht, ob er hinfahren muss und was von seinen Fähigkeiten gefragt ist.
Alle drei Angaben stehen im Nachfrageprofil — sie standen nur nicht in der Mail.
`DemandBrief` in `lib/freelancer/outreach.ts` trägt sie jetzt hinein:

```
Ein Unternehmen sucht gerade Unterstützung im Bereich Datenmigration und
Betrieb einer PostgreSQL-Plattform — hybrid, teils vor Ort in Frankfurt am Main.
Gefragt ist unter anderem Erfahrung mit PostgreSQL und Docker — das steht so
auch auf Ihrem Profil.
Daneben geht es um TypeScript und Airflow.
```

Die Überschneidung rechnet `lib/sourcing/match.ts` aus, über die Skill-Taxonomie
des Hauses statt über Zeichenketten. Die Schreibweisen der Quelle werden dabei
**dort** angeglichen und nicht in der Taxonomie: „React.js", „Angular 2+" und
„Oracle 10g/11g" sind dieselbe Erfahrung wie React, Angular und Oracle — aber
die Taxonomie entscheidet auch, welche Profile ein zahlender Auftraggeber
vorgeschlagen bekommt, und die Eigenheiten einer Beschaffungsquelle haben darin
nichts zu suchen. Eine nackte Zahl am Ende bleibt stehen: „Microsoft 365" ist
keine Version von „Microsoft".

Ist keine Arbeitsform belegt, steht dazu nichts — „Arbeitsform offen" in einer
Werbemail liest sich wie ein Textbaustein. Gibt es keine Überschneidung, fehlt
der zweite Satz.

## Der fehlende Vorgang: der Beschaffungslauf

Ein Lauf nimmt **ein** Nachfrageprofil mit Priorität „Beschaffen" und geht damit
durch die vorhandene Kette:

1. **Skills nehmen.** Die Pflichtkompetenzen des Profils, jede einzeln — sie
   sind die Achse, auf der die Quelle sortiert ist. Ein synthetischer
   `ProjectBrief` wird erst für die Adressauflösung gebraucht, nicht für die
   Suche.
2. **Beschaffen.** `sourceFromFreelancermap()` je Skill. Kostenlos,
   deterministisch, mit Namen, Ort, Satz, Sprachen und Skills. Dieselbe Person
   taucht über mehrere Skills mehrfach auf — entdoppelt wird über
   `profileUrl`, das ist zugleich der Schlüssel gegen bereits bekannte
   Kandidaten.
3. **Adresse auflösen.** Für jeden ansprechbaren Kandidaten ein Aufruf von
   `searchExternalFreelancers()` mit Name und Rolle — direkt, nicht über
   `/api/freelancer-search`. Die Route ist der Kundenweg: sie verlangt ein
   Projekt, prüft auf einen internen Treffer und belastet Credits. Für einen
   Beschaffungslauf ist all das falsch. Das Muster steht schon da:
   `runLeadPreparePass()` ruft `extractProjectBrief()` ebenso direkt, ohne
   Guthaben.
4. **Übernehmen.** `sourcedCandidateInsert()` wie bisher, `status='sourced'`,
   `consent_at` leer. Damit läuft die 30-Tage-Frist aus Art. 14 DSGVO, und die
   Löschregel `run_sourced_candidate_cleanup()` greift.
5. **Einladen.** `sendFreelancerOutreach()` mit `projectHint` = Profillabel
   („React + TypeScript"). Der Text steht, enthält die Pflichtangaben und den
   Link auf `/freelancer/apply`. Ohne Adresse bleibt der Kandidat `manuell`.
6. **Anmelden.** Die Person füllt das Formular aus, `consent_at` wird gesetzt,
   die Bewerbung geht den gewöhnlichen Prüfweg unter `/chat/admin/freelancers`.

### Kosten

Schritt 2 ist umsonst. Bezahlt wird nur noch Schritt 3, und zwar je Person
statt je Suchlauf: bis zu fünf Websuchen à 1 ct plus Tokens, also **rund 5 Cent
je aufgelöster Adresse**. Zwanzig Kandidaten kosten damit etwa einen Euro. Der
Betrag geht zulasten des Betreibers, nicht zulasten eines Kunden — kein Kunde
hat den Lauf ausgelöst.

## Umsetzung

### 1. Eigene Tabelle für Beschaffungsläufe

`external_freelancer_search_results` scheidet aus: `owner_user_id` und
`project_id` sind `not null`. Ein Beschaffungslauf hat weder das eine noch das
andere, und die Tabelle ist der Nachweis dessen, was Kunden bezahlt haben —
dort gehören Läufe des Betreibers nicht hinein.

```sql
create table public.sourcing_runs (
  id uuid primary key default gen_random_uuid(),
  demand_profile_key text not null,
  demand_profile_label text not null,
  brief_snapshot jsonb not null,
  result_count integer not null default 0,
  result_snapshot jsonb not null default '[]'::jsonb,
  provider_response_id text,
  actual_model text,
  imported_at timestamptz,
  triggered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index sourcing_runs_profile_day_idx
  on public.sourcing_runs (demand_profile_key, (created_at::date));
```

Der eindeutige Index ist die Kostenbremse: **ein Lauf je Profil und Tag.**
RLS an, `force`, nur `service_role` — wie bei `leadgen_queue`.

### 2. Der Vorgang im Code

**Steht** (35 Tests, gegen die echte Seite und die echte Datenbank belegt):

- `lib/sourcing/freelancermap.ts` — `loadSkillIndex()`, `resolveSkillSlug()`,
  `isSkillPage()`, `parseProfile()`, `sourceFromFreelancermap()`
- `lib/sourcing/candidate.ts` — `candidateFromProfile()`, bildet auf
  `ExternalFreelancerCandidate` ab, damit Übernahme und Ansprache unverändert
  weiterlaufen
- `lib/sourcing/run.ts` — `runSourcingPass()`, `inviteSourcedCandidate()`,
  `listSourcingOutreach()`, `listSourcingRuns()`
- Tabellen `sourcing_runs` und `sourcing_outreach`, angewendet
- Der Abschnitt „Beschaffung und Einladungen" auf `/chat/admin/demand`

**Zwei Dinge sind beim ersten Probeversand schiefgegangen und repariert:**

1. `service_role` hatte auf den neuen Tabellen nur REFERENCES, TRIGGER und
   TRUNCATE — kein INSERT. Die Standardrechte des Projekts greifen hier nicht
   von selbst; sie stehen jetzt ausdrücklich in der Migration.
2. Der Fehler des INSERT wurde nicht geprüft. **Die Mail ging raus, der Beleg
   nicht** — und niemand hätte es gemerkt. `inviteSourcedCandidate()` gibt
   jetzt `recorded: false` zurück, statt einen zugestellten Versand als
   vollständig zu melden.

**Der Knopf steht.** An jedem Nachfrageprofil in der Detailtabelle unter
`/chat/admin/demand`, in der Spalte „Empfehlung" — dort, wo „Beschaffen" steht,
kann man beschaffen. Zwei Klicks: der erste öffnet die Wahl (Adressen suchen?
Einladungen verschicken?), der zweite löst aus. Dahinter
`POST /api/admin/sourcing/run` → `runDemandSourcing()` mit drei Stufen, jede
einzeln abwählbar.

**Die Nutzersuche zahlt ein.** `/api/freelancer-search` übergibt ihre Treffer
nach der Kundenantwort an `absorbSearchCandidates()`. Der Anlass wandert mit:
Projekttitel, Arbeitsform, Ort und die Anforderungen, die das Profil erfüllt,
stehen als `sourcing_demand` am Kandidaten und später in seiner Einladung.
Der Schalter dafür sitzt in `sourcing_automation` und ist in der Vorgabe aus.

### Warum sechs Wochen lang nichts entstand

Am 8. September stellte sich heraus, dass die Übernahme **von Anfang an nicht
funktionieren konnte**. Zwei Regeln aus der Zeit vor dem Zustand `sourced`
standen ihr im Weg, und beide meldeten sich nur als `rejected`:

1. `booking_url` war **NOT NULL**. Ein recherchierter Kandidat hat keinen
   öffentlichen Kalender, und `sourcedCandidateInsert()` setzt dort zu Recht
   null. Die Migration vom 25. August hatte Einwilligung, Adresse, Sprachen und
   Skills gelockert — diese Spalte übersehen.
2. `freelancer_applications_decision_check` verlangte für jeden Zustand außer
   `submitted` und `in_review` einen Prüfvermerk. `sourced` kam später dazu und
   wurde nicht nachgetragen. Ein frisch recherchierter Kandidat hat aber keine
   Prüfentscheidung — das ist gerade sein Wesen.

Sichtbar wurde beides erst, als `importSourcedCandidates()` die Meldung der
Datenbank mit ausgab statt nur `rejected`. Die Lehre steht im Code: **Ein
verschluckter Fehler kostet mehr als ein hässlicher.** Dieselbe Sorte Fehler
ist an diesem Tag dreimal aufgetreten — beim Versandbeleg, beim Anlegen und in
der Weitergabe des Grundes durch `runDemandSourcing()`.

Noch offen:

- **Die Rückverfolgung der Anmeldung** (siehe unten).
- **Ein zweiter Weg zur Adresse.** Gemessen findet die Websuche bei zwei von
  sieben eine benutzbare Adresse. Für die übrigen bleibt LinkedIn oder das
  Kontaktformular der Plattform — beides von Hand.

Die Übernahme bleibt **ein eigener Schritt**. Sie startet die Frist aus
Art. 14 DSGVO, und dieser Grund gilt unverändert: Wer sie automatisch anhängt,
lässt eine Uhr laufen, die niemand gestartet hat. In der Betriebsart
„automatisch" darf sie mitlaufen — dann aber sichtbar als solche.

### 3. Auslöser mit Schalter

Wie bei der Lead-Verarbeitung: **je Vorgang** eine Betriebsart, Vorgabe
`manuell`, und immer zusätzlich ein Knopf.

| Vorgang | Arten | Vorgabe |
|---|---|---|
| Suchen | `manuell`, `täglich` | manuell |
| Übernehmen | `manuell`, `mit dem Lauf` | manuell |
| Einladen | `manuell`, `täglich im Fenster` | manuell |

**Gebaut.** Tabelle `sourcing_automation` nach dem Muster von `outreach_config`
(`id boolean primary key default true check (id)`), gelesen über
`readSourcingAutomation()`, geschaltet über
`PATCH /api/admin/sourcing/automation` und den Betriebsstreifen auf der
Nachfrageseite:

```
Betrieb   Kundensuche [an|aus]  Adressen [an|aus]  Einladungen [an|aus]
          Tagesbudget [20] Adressen   [ Bis morgen anhalten ]
```

Drei Schalter, weil die drei Stufen verschieden schwer wiegen: Kandidaten
anlegen startet eine Frist, Adressen suchen kostet Geld, Einladungen erreichen
Menschen. Alle drei stehen in der Vorgabe auf **aus**, und dorthin fällt auch
ein Ausfall der Datenbank zurück — was passiert, wenn niemand entscheidet, ist
nichts.

Jede Umstellung schreibt ein Audit-Ereignis. Wer angeschaltet hat, dass fremde
Menschen selbsttätig erfasst und angeschrieben werden, muss später benennbar
sein.

Einladungen laufen durch dieselbe Sperrliste wie die Ansprache an Auftraggeber —
eine Liste für beide Richtungen.

### 4. Bedienung

Auf `/chat/admin/demand`, in der vorhandenen Formensprache: in der Spalte
„Empfehlung" bei Priorität „Beschaffen" ein schmaler Knopf **Suchen**, daneben
das Ergebnis des letzten Laufs („3 gefunden · 2 eingeladen · 7.9."). Kein
Kasten, keine erklärende Karte.

Die Läufe selbst und die Übernahme bleiben, wo sie hingehören: auf
`/chat/admin/outreach`, wo schon die Fristenliste steht.

### 5. Reihenfolge

1. `briefFromDemandProfile()` samt Tests — danach ist der Kern belegt.
2. Tabelle, `runSourcingPass()`, Knopf auf der Nachfrageseite. Ab hier trägt
   die Kette von Hand.
3. Adressauflösung über das Impressum (siehe unten) — ohne sie endet die Kette
   im Nichts.
4. Rückverfolgung der Anmeldung (siehe unten).
5. Schalter und Zeitplan — zuletzt, weil sie alles davor voraussetzen.

## Zwei Dinge, die vorher zu klären sind

**Die Einladung kommt nicht zurück.** `sendFreelancerOutreach()` verlinkt auf
`/freelancer/apply` ohne Kennzeichen. Wer sich daraufhin einträgt, erzeugt eine
neue Bewerbung mit `source='apply_form'`; der recherchierte Datensatz bleibt
unberührt liegen und wird nach 30 Tagen gelöscht. Damit ist **nicht messbar, ob
die Einladung gewirkt hat** — und ohne diese Zahl lässt sich nicht entscheiden,
ob der ganze Weg sein Geld wert ist. Vorschlag: ein nicht-ratbares Kennzeichen
am Link (`/freelancer/apply?e=<token>`), das die Bewerbung mit dem Kandidaten
verknüpft und `consent_at` auf der recherchierten Zeile setzt, statt eine
zweite Zeile anzulegen.

**Ohne Adresse keine Mail — und das ist heute der Regelfall.** Ausgezählt über
die dreizehn Kandidaten aus den acht Läufen mit Treffern:

```
Kandidaten                                    13
davon mit contactEmail                         0
davon mit eigener Seite (Website/Portfolio)    3
davon mit irgendeinem Kanal neben dem Profil   5
Quellen: linkedin (de/ro), xing, freelance.de, drei eigene Domains
```

**Null von dreizehn.** Der Versandweg aus Schritt 4 liefe also heute für keinen
einzigen Kandidaten an. Die Ursache liegt nicht am Filter — `acceptableContactEmail()`
ist zu Recht streng, die Adresse muss auf der Domain der eigenen Seite liegen
oder den Nachnamen tragen. Sie liegt daran, dass der Suchlauf mit seinen fünf
Werkzeugaufrufen auf Profilseiten endet und das Impressum der eigenen Seite gar
nicht erst aufschlägt.

Daraus folgen zwei Pflichtstücke, bevor Schritt 4 überhaupt Sinn ergibt:

1. **Ein eigener Schritt zur Adressauflösung.** Hat der Kandidat eine eigene
   Seite, wird deren Impressum geholt und die dort veröffentlichte
   Geschäftsadresse durch `acceptableContactEmail()` geschickt. Das ist derselbe
   Weg, den das Werkzeug in `Documents\freelancer-import\agent` bereits gemessen
   hat: über das Firmenprofil kam die Adresse in vier von fünf Fällen im
   Klartext, aus dem Ausschreibungstext nur in einem Drittel.
2. **LinkedIn und XING bleiben manuell.** Sie automatisiert anzuschreiben ist
   durch ihre Nutzungsbedingungen ausgeschlossen — dieselbe Entscheidung wie im
   Importwerkzeug. Für sie erzeugt der Lauf einen Text zum Kopieren
   (`buildOutreachDraft({ channel: 'linkedin' })`), keinen Versand. Bei acht von
   dreizehn Kandidaten ist das heute der einzige Weg, und die Oberfläche muss
   ihn als Normalfall behandeln, nicht als Ausnahme.

Solange beides fehlt, ist die Kette zwar vollständig, endet aber im Nichts. Die
Adressauflösung gehört deshalb vor den Schalter aus Abschnitt 3 in die
Reihenfolge — nach Schritt 2, vor jedem Gedanken an Automatik.
