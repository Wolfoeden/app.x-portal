# Akquise per E-Mail: vom Mailversand zum Verkaufstest

Plan vom 29. September 2026. Er beantwortet die Frage, wie sich die
vorhandene Lead-Strecke — die geplante Recherche auf freelancermap.de,
`leadgen_queue`, der Abgleich und der Versand aus `/chat/admin/leads` — so
umbauen lässt, dass sie eine Verkaufshypothese prüft, statt nur Mails zu
verschicken. Das Dokument ist so geschrieben, dass es ohne den
Gesprächsverlauf lesbar ist, in dem es entstanden ist.

## Ausgangspunkt: die Hypothese

Eine Außenanalyse von x-portal.eu kommt zu dem Schluss: **Der Nutzen ist
erklärt, die Zahlungsbereitschaft dafür nicht belegt.** Sie schlägt einen
14-Tage-Test vor:

1. eine enge Zielgruppe wählen, die der vorhandene Freelancer-Bestand bedienen
   kann — mit aktuell bestätigter Verfügbarkeit;
2. zehn Gespräche mit Auftraggebern führen, die gerade eine Rolle besetzen;
3. fünf echte Suchen persönlich begleiten;
4. ein konkretes bezahltes Angebot machen;
5. die Abbruchstelle messen: Besucher → Projektanfrage → brauchbares Ergebnis
   → Kontakt/Gespräch → Zahlung.

Die Lead-Strecke passt dazu genau: Jeder Lead ist eine öffentliche
Ausschreibung, also eine Suche, die gerade läuft. Heute schickt die Strecke
darauf ein Profilangebot mit dem Hinweis „kostenlos". Damit prüft sie weder
Punkt 2 noch Punkt 4, und Punkt 5 bricht nach dem Klick ab.

## Die Strecke heute

```
Routine „X-Portal Lead Gen – freelancermap.de AI"          (claude.ai, trig_019dJKFVbz3WbYZrRgzktkco)
   Mo–Fr 04:20 und 12:20 UTC, Modell claude-sonnet-5, Supabase-Connector
   1. drei Listenseiten von freelancermap.de per WebFetch
   2. Abgleich mit leadgen_seen_postings (Merkliste) und leadgen_contacts (Adress-Cache)
   3. E-Mail-Recherche im Impressum, höchstens 10 Leads je Lauf
   4. INSERT INTO leadgen_queue (..., category = 'freelancermap')
   5. DELETE FROM leadgen_queue WHERE archived_at IS NOT NULL      ← „Aufräumen"
   ▼
leadgen_queue ──► xportal-leadgen-prepare (pg_cron, alle 10 Min, 3–14 UTC)
                    POST /api/leadgen/run {mode: "prepare"}
                    runLeadPreparePass()
                      extractProjectBrief()  → ein Modellaufruf je Lead
                      buildShortlist()       → Rangliste gegen den Katalog
                      Treffer:  Entwurf in leadgen_outreach (buildMatchEmail)
                      kein Treffer: status = dismissed, archiviert, Nachfrage in shortlists
   ▼
Versand: nur durch den Betreiber (SCHEDULED_LEAD_SEND_ENABLED = false seit 28.09.)
           SendNowButton / Einzelversand → deliverPreparedDraft()
           IONOS-SMTP, 40 je Stunde, 5 s Abstand, Sperrliste, Abmeldelink
   ▼
Messung:  Buchungslink ?via=lead (seit 28.09.), Profillink ?via=lead (seit 29.09.),
          Suchlink ?entry=recruiter, Antworten nur von Hand als status = replied
```

Drei Dinge daran sind anders, als man annehmen würde:

- **Die Routine prüft nicht, ob XPORTAL passende Freelancer hat.** Sie legt
  nur Leads an. Den Abgleich gegen den Katalog und den Mailentwurf macht die
  Anwendung. Verschickt wird seit dem 28.09. nur, wenn der Betreiber im
  Adminbereich freigibt.
- **Den „Outreach-Agent", auf den sich `category = 'freelancermap'` beruft,
  gibt es praktisch nicht.** Die Edge Function `outreach-agent` ist
  abgeschaltet (`outreach_config.enabled = false`, `dry_run = true`, seit dem
  31.08. unverändert) und hat nie eine Mail verschickt (`outreach_log` ist
  leer). Sie filtert auch nicht nach `category`. Ihr Cron
  `outreach-agent-tick` läuft trotzdem alle fünf Minuten. Wäre sie je
  eingeschaltet worden, hätte sie ohne Sperrliste, ohne Abmeldelink und ohne
  Impressum verschickt. Außerdem hätte sie `status = 'in_progress'` und
  `'done'` gesetzt, was der Check auf `leadgen_queue.status` gar nicht
  zulässt.
- **Die Routine „X-Portal Lead Gen – Sonstige Quellen"**, auf die die
  Anweisung verweist, existiert unter den Routinen dieses Kontos nicht mehr.
  freelancermap-KI ist damit die einzige Quelle.

## Befund aus der Produktion (Stand 29.09.2026)

Nur Zählungen, keine Adressen. Interne Testkonten sind in den Zahlen zur
Nachfrageseite **nicht** herausgerechnet.

### Eingang der Leads

| Woche ab | Abgleiche | mit Treffer | Quote |
|---|---|---|---|
| 07.09. | 418 | 56 | 13 % |
| 14.09. | 262 | 27 | 10 % |
| 21.09. | 8 | 0 | 0 % |
| 28.09. | 2 | 0 | 0 % |

- `leadgen_queue` ist **leer**. Die ID-Folge steht bei rund 813, so viele Leads
  wurden insgesamt eingespielt.
- Seit der Umstellung auf „nur KI" (Merkliste ab dem 15.09.) hat die Routine
  55 Ausschreibungen geprüft: 31 Leads angelegt, 12 ohne Adresse, 12 nicht
  relevant. Seit dem 17.09. sind es **ein bis vier neue Leads je Tag**, rund
  acht pro Woche.
- **Die Löschungen kommen aus der Anweisung der Routine.** Der Schritt
  „AUFRÄUMEN" (`DELETE … WHERE archived_at IS NOT NULL`) läuft bei jedem Lauf
  (06:22 und 14:22 Uhr, im Lösch-Melder als `mgmt-api`). Archiviert sind genau
  die abgeglichenen Leads: ohne Treffer (`dismissed`) und angeschrieben
  (`contacted`). Die offene Frage aus `leadgen-betriebsarten.md` ist damit
  beantwortet. Die Folgen:
  - Eine Antwort lässt sich nicht mehr am Lead vermerken, der Lead ist dann
    schon weg.
  - Der Neuabgleich archivierter Leads (`RematchButton`) hat nichts mehr, woran
    er arbeiten könnte, auch wenn neue Profile dazukommen.
  - Die Lösch- und Aufbewahrungsfristen, die `run_leadgen_cleanup()` umsetzt
    und die im Fuß jeder Mail stehen, werden unterlaufen.

### Warum die KI-Leads keinen Treffer bekommen

Alle elf Leads seit dem 18.09. endeten ohne Treffer, darunter Ausschreibungen,
die zum Bestand passen müssten:

| Ausschreibung (Titel) | was der Abgleich daraus las |
|---|---|
| AI Berater – KI-Transformation Finanzdienstleister | Skills: „KI-Transformation", „Beratung" |
| Agentic AI Engineer / AI Software Engineer | Skills: „Agentic AI Engineering" |
| Developer (KI-Entwicklung, LLMs, Agentic Engineering) | Skills: „Large Language Models", „KI-Entwicklung", „Agentic Engineering" |
| KI-Entwickler / KI-Engineer (Senior) | Skills: „KI-Entwickler", „KI-Engineer" |
| AI Consultant / Agentic AI Specialist (Finanzinstitut) | Skills: „Agentic AI", „Automatisierung von Back-Office-Prozessen" |

Die Ursache liegt im Text, den die Routine speichert. `stellenanzeige` ist
**190 bis 330 Zeichen** lang: Titel, ein Satz, URL. Die Anforderungen der
Ausschreibung fehlen. Ein Beispiel im Wortlaut:

> KI-Entwickler / KI-Engineer (Senior) -- KI-Projekt bei RED Commerce GmbH,
> veroeffentlicht auf freelancermap.de, Start 1/2027. \<URL\>

Daraus kann `extractProjectBrief()` nur den Titel als „Skill" lesen, und dafür
führt kein Profil einen belegten Skill. Arbeitsweise und Ort bleiben
`unknown`. Das Format weicht außerdem vom erwarteten
`Titel — Kurzbeschreibung — URL` ab (mal ` | `, mal ` -- `), sodass
`leadHeadline()` für den Betreff auf Notschnitte angewiesen ist.

### Versand

- **58 Mails** gingen vom 8. bis 17. September raus, an nur **37 Empfänger**.
  - **Dieselbe Ausschreibung doppelt:** 3 Empfänger, alle vor dem 16.09. Das
    hat die Merkliste der Routine behoben.
  - **Mehrere Ausschreibungen derselben Agentur:** 29 Mails gingen an 8
    Empfänger, einer bekam 8. Das ist **nicht** behoben, auch nach dem 16.09.
    gab es noch 3 solche Mails. Die Routine legt je Ausschreibung einen Lead an,
    und eine Agentur schreibt oft mehrere Rollen am selben Tag aus.
- 27 Versuche sind gescheitert: 9 `send_failed`, 5 × IONOS `450`,
  8 `unattended_content`, 5 `suppressed`.
- 4 Entwürfe vom 14. und 15.09. warten noch. Sie sind abgelaufen, ihr Lead ist
  gelöscht.
- 2 Einträge hängen seit dem 14.09. in `sending`. Ob sie zugestellt wurden,
  weiß niemand.
- 3 Abmeldungen.
- Antworten sind nicht systematisch erfasst. Im Code steht als Rückmeldung
  aus der ersten Welle „sieben Antworten auf hundert Nachrichten".
- Klicks: 3 Besucher kamen mit `entry=recruiter` in die Suche, 0 davon haben
  sich registriert. Buchungsklicks aus Mails: 0. Gemessen wird das erst seit
  dem 28.09., seither ging keine Mail raus.

### Nachfrageseite, letzte 30 Tage

| Stufe | Personen |
|---|---|
| Besucher | **nicht gemessen** (kein Web-Analytics) |
| Suche gestartet | 29 |
| Ergebnis gesehen | 29 |
| Registrierung begonnen | 18 |
| Registrierung bestätigt | 5 |
| Fortgesetzt | 3 |
| Preisseite geöffnet | 2 |
| Checkout gestartet | 0 |
| bezahlt | 0 |

### Freelancer-Bestand

- 70 aktive, echte Profile, alle mit Kalender.
- 68 sind als „verfügbar" markiert, aber nur **4** haben die Verfügbarkeit in
  den letzten 30 Tagen angegeben. Alle vier sind KI-Profile:
  - AI Engineer (Python, LangChain, AI Agents, Prompt Engineering)
  - KI-Entwickler für Agenten, RAG und Automatisierung in TypeScript
    (Next.js, Supabase)
  - GenAI-Fullstack-Entwickler (React, TypeScript, Next.js, FastAPI)
  - KI Consultant & Project Manager (KI-Beratung, Projektleitung,
    Product Owner)
- Nur 5 Profile pflegt der Freelancer selbst (mit Konto). Die übrigen 65 hat
  der Betreiber angelegt.

| Fachgebiet (grob nach Rollenbezeichnung) | Profile | Verfügbarkeit ≤ 30 Tage |
|---|---|---|
| KI / AI (Beratung, Engineering, Schulung) | 21 | 4 |
| IT-Beratung, Anforderungsmanagement, PM | 15 | 0 |
| Marketing (SEO, SEA, Performance, Social) | 13 | 0 |
| Engineering, Cloud, SAP, QA | 6 | 0 |
| Virtuelle Assistenz | 4 | 0 |
| IT-Support | 3 | 0 |
| Design | 3 | 0 |
| HR / Coaching | 2 | 0 |
| sonstige | 3 | 0 |

Innerhalb von KI ist der Bestand ungleich verteilt:

- **stark:** Anwendungsentwicklung mit LLM, Agenten und RAG (Python,
  TypeScript, React), KI-Beratung und -Projektleitung, KI-Schulung, Cloud
  (Azure/AWS) mit LLM-Integration;
- **leer:** klassisches Machine Learning und Deep Learning (PyTorch,
  Zeitreihen), Computer Vision, Data Science für Risikomodelle, MLOps und
  GPU-Infrastruktur, SAP AI Core/BTP.

## Die Analyse gegen die Daten gehalten

| Annahme der Analyse | Was die Daten sagen | Folge für die Strecke |
|---|---|---|
| Ursache für „kein Umsatz" offen | Suche → Registrierung trägt (18 von 29 beginnen). Danach bricht es ab: 2 Preisseiten, 0 Checkouts. Die Lead-Mails haben nie ein bezahltes Angebot gemacht, sie sagen „kostenlos" und „noch keine Beauftragung". | Die Ansprache muss ein Angebot enthalten, sonst misst der Test nur Interesse. |
| Credits ab 9 €, 90 Start-Credits | Teilweise überholt. Die Start-Credits wurden am 28.09. gesenkt (Gast 30, Konto 90). Das Vermittlungsmodell (10 % Erfolgshonorar) ist gebaut, hängt aber am Schalter, und die Bedingungen stehen auf „Entwurf". | Für Leads ist das Erfolgshonorar das natürliche Angebot. Bei 800 € Tagessatz und 60 Projekttagen sind 10 % **4.800 €**, das entspricht rund 250 Pro-Monaten zu 19 €. |
| Zielgruppe nach Bestand wählen | Die KI-Ausrichtung der Routine stimmt: Alle vier bestätigten Profile sind KI. Die Routine nimmt aber jede KI-Ausschreibung, auch aus Gebieten ohne einen einzigen Freelancer. | Innerhalb von KI nach Bestand priorisieren (Stufe 1). |
| Aktuell bestätigte Verfügbarkeit | Bestätigt sind 4 von 70. Die Mail zeigt „verfügbar (Stand …)" mit einem oft alten Datum. | Die Verfügbarkeit vor dem Versand beim Freelancer abfragen (Stufe 3). |
| Zehn Gespräche führen | Die Mail bietet kein Gespräch mit XPORTAL an, und Antworten gehen verloren. Die Routine liefert rund 8 Leads pro Woche. | Eine zweite Fassung mit dem Gespräch als Ziel. Die Menge reicht für zehn Gespräche nicht allein (siehe „Der 14-Tage-Test"). |
| Abbruchstelle messen | Der Trichter in der App existiert. Es fehlt die Verbindung von der Mail zur Person: `entry=recruiter` setzt auch jeder andere `?q=`-Link. | Jede Mail bekommt eine eigene Kennung, die bis zur Beauftragung mitläuft. |
| Checkout im Testmodus prüfen | 0 Checkout-Starts in 30 Tagen, gemessen wird seit dem 28.09. | Einmal einen Testkauf von Hand in Stripe durchspielen. |

## Was vorher geklärt sein muss

Diese drei Punkte kann kein Code entscheiden.

1. **Werbe-E-Mails ohne Einwilligung.** Der Zeitplan versendet seit dem
   28.09. nicht mehr, weil offen ist, ob eine Mail auf eine öffentliche
   Ausschreibung unter § 7 Abs. 2 Nr. 2 UWG fällt (siehe
   `SCHEDULED_LEAD_SEND_ENABLED` in `lib/leadgen/limits.ts`).
   Automatisierung ändert an der rechtlichen Einordnung einer einzelnen Mail
   nichts, vervielfacht sie aber. Deshalb: anwaltlich prüfen lassen, bevor der
   Zeitplan wieder versendet. Bis dahin gibt der Betreiber frei.
2. **Vermittlungsbedingungen.** `PLACEMENT_TERMS.status` steht auf `draft`.
   Ein Honorar darf erst in der Mail stehen, wenn die Bedingungen freigegeben
   sind. Bis dahin bietet die Mail eine kostenlose Vorstellung und ein Gespräch
   an.
3. **Anschreiben der Freelancer.** Stufe 3 fragt die Verfügbarkeit per Mail ab.
   Für die 65 Profile ohne eigenes Konto ist vorher zu klären, auf welcher
   Grundlage sie im Bestand sind, zum Beispiel eine Bewerbung oder eine
   Einwilligung.

## Der Plan

### Stufe 0 — Aufräumen (ein Tag)

- **Den Schritt „AUFRÄUMEN" aus der Anweisung der Routine streichen.**
  *Erledigt am 29.09.2026 mit der neuen Anweisung (Anhang A).* Die Löschfristen setzt
  `run_leadgen_cleanup()` durch: 30 Tage für nicht angeschriebene Leads, ein
  Jahr für angeschriebene, der Anzeigentext wird nach 30 Tagen geleert.
- **Der Routine nur die Werkzeuge lassen, die sie braucht.** Heute hängen an
  ihr Stripe, Google Drive und Claude_Code_Remote (Letzteres mit Zugriff auf
  die Routinen selbst). Nötig ist nur Supabase, plus WebFetch und WebSearch.
  *Offen:* Die Connectoren lassen sich über das Routinen-Werkzeug nicht
  ändern, nur Name, Zeitplan, Modell und Anweisung. Der Betreiber entfernt
  sie in den Einstellungen der Routine auf claude.ai.
- **`outreach-agent` stilllegen:** den Cron `outreach-agent-tick` abmelden,
  danach die Edge Function löschen. `outreach_config`, `outreach_log` und die
  RPCs `outreach_*` später in einer Migration entfernen.
- **Die zwei hängenden `sending`-Einträge** im Postfach unter „Gesendet"
  prüfen und danach auf `sent` oder `failed` setzen.
- **Die vier abgelaufenen Entwürfe** verwerfen.
- In `leadgen-betriebsarten.md` die Frage „Wer löscht?" mit diesem Befund
  schließen.

### Stufe 1 — Die Routine liefert genauere Leads

Sechs Änderungen an der Anweisung. Die vollständige neue Fassung steht in
[Anhang A](#anhang-a--neue-anweisung-der-routine).

| # | Änderung | Warum |
|---|---|---|
| 1 | **Die Detailseite jeder neuen Ausschreibung lesen** und daraus die Anforderungen übernehmen: Muss, Kann, Einsatz, Start, Dauer, Auslastung, Sprache, Branche, Anbietertyp. | Ohne Anforderungen findet der Abgleich niemanden (siehe Befund). Das ist der größte einzelne Hebel. |
| 2 | **Festes Format** `Titel — Firma; Muss: …; Kann: …; … — URL`, höchstens 1.000 Zeichen, genau zwei ` — ` als Trenner. | `leadHeadline()` schneidet den Betreff am ersten ` — `, und `leadSourceUrl()` nimmt die erste URL. Der eindeutige Index auf `stellenanzeige` verträgt keine beliebig langen Texte. |
| 3 | **Nach Bestand priorisieren:** A = die vier bestätigten Profile, B = weiterer KI-Bestand, C = kein Bestand. C kommt nur in die Merkliste (`outcome = 'pool_mismatch'`), ohne Adressrecherche. | Keine Recherche mehr für Leads, die sicher keinen Treffer bekommen. Der Titel bleibt als Nachfrage-Hinweis in der Merkliste stehen. |
| 4 | **Eine Firma höchstens einmal in 14 Tagen:** Abfrage über die Merkliste. Mehrere Ausschreibungen einer Firma im selben Lauf ergeben den einen Lead mit der besten Priorität, die übrigen bekommen `outcome = 'company_cooldown'`. | Verhindert, dass eine Agentur acht Mails bekommt. Die Anwendung sichert das zusätzlich beim Versand ab (Stufe 2). |
| 5 | **Bessere Empfänger:** eine auf der Ausschreibung genannte Kontaktadresse vor dem Impressum. Unter mehreren angezeigten Adressen Projekt-, Recruiting-, Jobs- und HR-Adressen vor `info@`. `recipient_name` nur, wenn eine Ansprechperson mit Vor- und Nachnamen genannt ist. | Eine Anrede mit Namen und ein Postfach, das Projekte bearbeitet, erreichen eher jemanden, der gerade sucht. |
| 6 | **`category` sagt das Fachgebiet** (`ki-entwicklung`, `ki-beratung`, `ki-automatisierung`), und in `notes` stehen Quelle, Anbietertyp und Priorität. | Die Quelle steckt schon in URL und Merkliste. Das Fachgebiet und der Anbietertyp braucht die Auswertung (Stufe 4), und in der Leadliste lässt sich danach filtern. Die alte Begründung für `'freelancermap'` (der Outreach-Agent) trägt nicht, siehe oben. |

**In der Anwendung, passend dazu:**

- `leadgen_seen_postings` und `leadgen_contacts` hat die Routine direkt
  angelegt, sie fehlen in den Migrationen. Nach dem Muster von `leadgen_queue`
  in `20260902120000_leadgen_admin_workspace.sql` nachtragen und dabei RLS
  einschalten und erzwingen. Heute ist RLS aus. Die Tabellen sind nur deshalb
  nicht offen, weil `anon` und `authenticated` keine Rechte haben.
- Eine Frist für `leadgen_contacts` in `run_leadgen_cleanup()`: `found` nach
  180 Tagen ohne Prüfung, `blocked` und `not_found` nach 90 Tagen, damit ein
  neuer Versuch möglich wird.
- Die fünf Fehlschläge aus der Tabelle oben mit vollständigem Anzeigentext als
  Golden-Fälle aufnehmen (`tests/golden`). Danach prüfen, ob
  `skill-taxonomy.ts` die üblichen Schreibweisen zusammenführt: „Agentic AI"
  und „AI Agents", „LangGraph" und „LangChain", „KI-Transformation" und
  „KI-Strategie" beziehungsweise „KI-Beratung".
- Optional, später: eine Sicht `leadgen_pool_overview` (Rolle, belegte Skills,
  Stand der Verfügbarkeit, ohne Namen). Die Routine liest daraus ihre
  Prioritäten, statt sie fest im Text zu tragen. Bis dahin muss die Liste in
  der Anweisung von Hand nachgezogen werden, wenn sich der Bestand ändert.

**Zielwerte zum Prüfen:** Trefferquote der A-Leads über 50 %, der B-Leads über
20 %. Die Menge bleibt bei rund acht Leads pro Woche. Mehr gibt die Quelle
nicht her.

### Stufe 2 — Niemand wird doppelt angeschrieben

In `deliverPreparedDraft()`, denn dort verlässt jede Mail das Haus. Die
Stundenbremse sitzt aus demselben Grund dort.

- **Je Adresse:** höchstens eine Akquise-Mail in 30 Tagen.
- **Je Domain:** höchstens eine in 14 Tagen, deckungsgleich mit der Regel der
  Routine.
- **Je Ausschreibung:** ein eindeutiger Teilindex auf
  `leadgen_outreach (source_url) where state in ('sending','sent')`. Er gilt
  auch dann, wenn ein Lead gelöscht und neu eingespielt wurde.
- Abgewiesene Versuche bekommen einen eigenen Grund (`recipient_cooldown`,
  `domain_cooldown`) und blockieren den Entwurf nicht dauerhaft.

Tests: Vitest für die Abkühlzeiten, pgTAP für den Index.

### Stufe 3 — Verfügbarkeit bestätigen, bevor die Mail rausgeht

Das beantwortet Punkt 1 der Analyse und zugleich die Frage, ob Freelancer
überhaupt reagieren.

- Wird ein Entwurf vorbereitet, bekommt der bestpassende Freelancer eine kurze
  Nachricht: „Anfrage zu ‚\<Titel\>' (remote, ab \<Datum\>): Sind Sie verfügbar?
  [Ja] [Nein]". Die beiden Links sind signiert wie der Abmeldelink und setzen
  `availability_status` sowie `availability_updated_at`.
- Der Entwurf bekommt einen Vorzustand: *wartet auf Freelancer*.
  Freigabebereit ist er erst mit einer Bestätigung, die höchstens 7 Tage alt
  ist.
- Kommt nach 48 Stunden keine Antwort oder ein Nein, wird der nächste Treffer
  aus derselben Rangliste gefragt.
- Die Mail an den Auftraggeber sagt danach wahrheitsgemäß „Verfügbarkeit am
  \<Datum\> bestätigt".
- Kennzahl: Antwortquote der Freelancer und Zeit bis zur Antwort.

Voraussetzung: Punkt 3 unter „Was vorher geklärt sein muss".

### Stufe 4 — Zwei Fassungen der Ansprache

Neue Spalte `leadgen_outreach.variant`. Zugeteilt wird beim Vorbereiten
abwechselnd nach Lead-ID, damit die beiden Gruppen vergleichbar bleiben.

**A — `profil`** (heute): Eckdaten des besten Profils, Abgleich Anforderung für
Anforderung, Links zu Profil, Buchung und Suche.

**B — `gespraech`** (neu): kurz, höchstens 120 Wörter.

> Guten Tag \<Name\>,
>
> zu Ihrer Ausschreibung „\<Titel\>" habe ich zwei Freelancer, die ins Profil
> passen und ihre Verfügbarkeit am \<Datum\> bestätigt haben. Wenn Sie mögen,
> stelle ich sie Ihnen bis \<Datum + 2 Werktage\> vor.
>
> Eine Frage vorab: Woran ist die Besetzung bisher gescheitert?
>
> Antworten Sie einfach auf diese Mail, oder wählen Sie einen Termin für 15
> Minuten: \<Link\>

- Das Ziel ist das Gespräch mit dem Betreiber, nicht der Klick. Das entspricht
  Punkt 2 der Analyse, und die Frage darin liefert den Stoff dafür.
- Der Terminlink führt über die eigene Domain
  (`/api/akquise/termin?r=…`), weil `unattendedBodyIssue()` fremde Hosts im
  Stapel sperrt.
- Kein Modelltext, wie bisher: Der Text entsteht aus den Daten. Den Fuß erzeugt
  weiterhin `legalFooter()`.
- **Sobald die Vermittlungsbedingungen freigegeben sind**, kommt ein Satz
  dazu: „Kostenlos bis zur Beauftragung; kommt es dazu, berechnen wir einmalig
  10 % des Honorars der ersten drei Monate" plus Link auf
  `/vermittlungsbedingungen`. Erst damit macht die Mail das bezahlte Angebot
  aus Punkt 4.

Ausgewertet wird zusätzlich nach Anbietertyp (aus `notes`, später eine eigene
Spalte). Ein Personaldienstleister kauft anders als ein Endkunde: Er ist eher
Partner mit geteilter Marge als Kunde mit Erfolgshonorar. Viele der bisherigen
KI-Ausschreibungen stammen erkennbar von Personaldienstleistern.

### Stufe 5 — Jede Mail bis zur Zahlung verfolgen

- **Kennung je Mail.** Jeder Versandbeleg bekommt eine kurze Kennung `r`, etwa
  die ersten 10 Zeichen eines HMAC über die Beleg-ID. Sie hängt an jedem Link
  der Mail (Suche, Profil, Buchung, Termin).
- **Klick.** Ein neues Ereignis `lead_email_click` hält Beleg und Linkart fest.
- **Eigener Einstieg.** Für Mail-Klicks gibt es einen eigenen Einstieg
  `entry=lead_mail`. Heute setzt jeder `?q=`-Link `recruiter`.
  `rememberFunnelEntry()` merkt sich `r`. Registrierung, Vorstellung
  (`intro_bookings`) und Beauftragung (`engagements`) tragen die Kennung
  dadurch weiter.
- **Antworten am Beleg, nicht am Lead**, denn der Beleg überlebt den Lead.
  Neue Spalten: `reply_status` (`interessiert` | `spaeter` | `kein_bedarf` |
  `abgemeldet` | `unzustellbar`), `replied_at` und `reply_note`. In der Ansicht
  „Versandt" setzt ein Klick je Zeile den Status. Später, optional: das
  IONOS-Postfach per IMAP abfragen und Antworten über `In-Reply-To` dem Beleg
  zuordnen.
- **Auswertung** als Streifen auf `/chat/admin/leads`, je Fassung, Fachgebiet
  und Anbietertyp:
  `versandt → geklickt → geantwortet → Gespräch → Vorstellung → Beauftragung → bezahlt`.

### Stufe 6 — Versand erst halbautomatisch, dann nach Plan

- **Während des Tests** gibt der Betreiber einmal täglich die Entwürfe frei,
  über den vorhandenen `SendNowButton`.
- **Danach** kommt der Schalter `leadgen_automation` aus
  `leadgen-betriebsarten.md`. Er ersetzt die Konstante
  `SCHEDULED_LEAD_SEND_ENABLED`. „Versand nach Plan" darf erst nach der
  Rechtsprüfung eingeschaltet werden.
- Automatische Nachfass-Mails gibt es erst nach der Rechtsprüfung.

## Der 14-Tage-Test auf dieser Strecke

| Tage | Was |
|---|---|
| 1 | Stufe 0; neue Anweisung der Routine einsetzen (Anhang A) |
| 2–5 | Stufe 2 (Doppelschutz), Stufe 4 Fassung B ohne Honorar, Antworten am Beleg (Teil von Stufe 5) |
| 6–14 | jeden Entwurf freigeben, A und B abwechselnd; Antworten selbst führen; Gespräche und begleitete Suchen über `/chat/admin/vermittlungen` |

Im Test bestätigt der Betreiber die Verfügbarkeit von Hand, bevor er freigibt.
Stufe 3 und die volle Verfolgung bis zur Zahlung folgen danach.

**Erwartung an die Menge — ehrlich gerechnet.** Die Routine liefert rund acht
KI-Leads pro Woche. Selbst wenn nach der Umstellung jeder zweite einen Treffer
bekommt, sind das in den gut sieben Versandtagen rund sechs Mails. Bei rund
7 % Antworten ist das höchstens eine Antwort. **Zehn Gespräche liefert die
Mail-Strecke in 14 Tagen nicht.** Sie liefert etwas anderes: präzise Anlässe,
bei denen jede Antwort ein echtes Gespräch über eine laufende Suche ist. Die
übrigen Gespräche müssen, wie die Analyse selbst vorschlägt, aus vorhandenen
Kontakten und Empfehlungen kommen. Eine zweite Quelle für dieselbe Nische
(eine andere Projektbörse) lohnt erst, wenn die Trefferquote aus Stufe 1
steht. Sie ist in einer interaktiven Sitzung zu prüfen, bevor sie in eine
Routine kommt.

Ein Vergleich zwischen A und B ist bei dieser Menge nicht belastbar. Er zeigt
höchstens, ob eine Fassung gar keine Antwort bringt.

**Entscheidungsregeln** nach dem Test, in der Sprache der Analyse:

| Bild nach 14 Tagen | Nächste Arbeit |
|---|---|
| A-Leads bekommen keine Treffer | Matching und Anzeigentext (Golden-Fälle aus Stufe 1) |
| Treffer, aber unter 3 % Antworten, kaum Klicks | Kundenzugang: Absender, Betreff, Kanal |
| Antworten, aber „passt nicht" oder keine Gespräche | Bestand; die Nachfrageseite und `pool_mismatch` zeigen, welche Profile fehlen |
| Gespräche und Vorstellungen, aber keine Beauftragung | Angebot und Preis: Erfolgshonorar oder bepreister Suchauftrag |
| Beauftragung zugesagt, Rechnung nicht bezahlt | Abrechnung (`engagements.fee_status`) |

## Reihenfolge und Aufwand

| Schritt | Aufwand | hängt ab von |
|---|---|---|
| Stufe 0 Aufräumen, Werkzeuge der Routine | S | — |
| Stufe 1 neue Anweisung der Routine | erledigt | — |
| Stufe 1 Migration der Hilfstabellen + Frist | S | — |
| Stufe 1 Golden-Fälle, Skill-Synonyme | M | neue Anzeigentexte |
| Stufe 2 Doppelschutz | M | — |
| Stufe 4 Fassung B (ohne Honorar) | M | — |
| Stufe 5 Antworten am Beleg | S | — |
| Stufe 5 Kennung, Klick, Einstieg | M | — |
| Stufe 5 Verbindung bis Beauftragung + Auswertung | L | Vermittlungsmodell aktiv |
| Stufe 3 Verfügbarkeitsabfrage | L | Klärung Punkt 3 |
| Stufe 4 Satz zum Honorar | S | Freigabe der Bedingungen |
| Stufe 6 Schalter `leadgen_automation` | M | Rechtsprüfung für „nach Plan" |

## Was nur der Betreiber beantworten kann

- Wie sind die 65 Profile ohne Konto in den Bestand gekommen?
- Wie weit ist die rechtliche Prüfung der Vermittlungsbedingungen und der
  Akquise-Mail?
- Wie vielen Auftraggebern wurde XPORTAL persönlich gezeigt, und wie oft wurde
  ausdrücklich ein bezahltes Angebot gemacht? Das steht in keiner Tabelle.

---

## Anhang A — Neue Anweisung der Routine

Ersetzt die bisherige Anweisung von „X-Portal Lead Gen – freelancermap.de AI
(Mo-Fr, 2x/Tag, Supabase)" vollständig. **Eingesetzt am 29.09.2026 um 08:06
UTC** auf Romans Zusage; der erste Lauf damit ist der um 12:20 UTC. Zeitplan
und Modell bleiben. Geändert
gegenüber der alten Fassung:

- Detailseite und Anforderungen;
- festes Format;
- Prioritäten nach Bestand;
- Firmensperre;
- Empfängerwahl;
- Fachgebiet in `category`, Metadaten in `notes`;
- zwei neue Werte für `outcome`;
- **kein** Löschen mehr;
- der Verweis auf die nicht mehr vorhandene zweite Routine ist entfernt.

```text
Du läufst als geplanter Lead-Gen-Task für Roman Dering ("Wolfoden"), der x-portal.eu (eine Freelancer-Vermittlungsplattform) betreibt. Diese Session hat kein Gedächtnis früherer Läufe — alles Nötige steht hier.

ZIEL: Neu veröffentlichte KI-/AI-Projekte auf freelancermap.de finden, zu denen XPORTAL passende Freelancer im Bestand hat, und sie mit ihren konkreten Anforderungen als Leads in Supabase speichern. XPORTAL gleicht jeden Lead anschließend selbst gegen den Freelancer-Katalog ab und entwirft die Mail; verschickt wird nur nach Freigabe durch Roman. Deine Aufgabe ist allein: wenige, genaue Leads mit vollständigen Anforderungen. Arbeite sparsam: Ziel sind rund 15-30 Tool-Calls für den ganzen Lauf.

WAS ALS AI-PROJEKT ZÄHLT: Künstliche Intelligenz/KI, Machine Learning, Deep Learning, Generative KI/GenAI, LLM/Sprachmodelle, RAG, AI Agents/Agentic Engineering, Prompt Engineering, NLP, Computer Vision, Speech/Voice AI, MLOps/AIOps, Data Science mit ML-Kern, KI-gestützte Automatisierung, Copilot/Chatbot mit echter KI-Komponente, KI-Beratung, KI-Strategie, KI-Projektleitung, KI-Schulung.
WAS NICHT ZÄHLT: reine Digitalisierungs-/IT-Projekte ohne KI-Kern, klassische SAP-/ERP-/Support-/Infrastruktur-Rollen, Web-/App-Entwicklung ohne AI-Bezug, reines BI/Reporting ohne ML. → outcome='not_relevant'.

PRIORITÄT NACH BESTAND (entscheidet, ob ein Posting ein Lead wird):
- A — XPORTAL hat Freelancer mit aktuell bestätigter Verfügbarkeit: Anwendungsentwicklung mit LLMs, KI-Agenten und RAG (Python, TypeScript, LangChain/LangGraph, React/Next.js, FastAPI, Node.js), GenAI-Web-Apps, KI-Integration in bestehende Software; KI-Beratung, KI-Projektleitung, Product Owner KI.
- B — XPORTAL hat passende Profile, Verfügbarkeit noch zu bestätigen: KI-Strategie und KI-Coaching, KI-Schulung/KI-Befähigung, Cloud-Architektur oder Platform Engineering mit LLM/RAG (Azure OpenAI, AWS), Prozessautomatisierung mit KI (n8n, Power Automate), KI in Marketing- und Vertriebsautomatisierung, KI-Systeme im Anforderungsmanagement/Business-Analyse.
- C — kein passender Bestand: klassisches ML/Deep Learning (PyTorch, TensorFlow, Zeitreihen, Forschung), Computer Vision, Speech, Quant-/Risk-Data-Science, MLOps/GPU-/LLM-Serving-Infrastruktur, SAP AI Core/BTP/Joule, Microsoft Copilot Studio.
A und B werden Leads. C wird KEIN Lead: keine E-Mail-Recherche, nur mit outcome='pool_mismatch' in die Merkliste (der Titel dort zeigt Roman, welche Profile fehlen). Passt ein Posting zu A oder B nur teilweise, entscheidet die Hauptrolle.

LAUFZEITEN: Mo-Fr, 2x täglich zu :20 nach 04 und 12 Uhr UTC (lokal Europe/Berlin 06:20 und 14:20). Ermittle die aktuelle UTC-Stunde (z.B. via `date -u`). Ist sie 4, ist dies der ERSTE LAUF DES TAGES.

QUELLEN (technisch verifiziert, in dieser Reihenfolge, je ein WebFetch):
1. https://www.freelancermap.de/projekte/ai-agents
2. https://www.freelancermap.de/projekte/machine-learning
3. https://www.freelancermap.de/projekte/it-projekte.html — hier NUR die Titel mit erkennbarem AI-Bezug herauspicken.
Frage beim Abruf explizit nach dem Format "TITEL | FIRMA | DATUM | URL", sonst liefert der Fetch keine Posting-URLs.
NICHT VERWENDEN (bereits erfolglos getestet): https://www.freelancermap.de/projektboerse.html (keine Posting-URLs über WebFetch); https://www.freelancermap.de/projekte/kuenstliche-intelligenz (dauerhaft leer). Direkter Abruf per curl/Bash ist durch die Egress-Policy blockiert — gar nicht erst versuchen.

ABLAUF:

1. KANDIDATEN SAMMELN aus den drei Quellen. Titel mit Priorität C oder ohne KI-Bezug schon hier aussortieren (kommen nur in die Merkliste).

2. MERKLISTE — EIN SELECT über alle Kandidaten-URLs:
   SELECT posting_key FROM public.leadgen_seen_postings WHERE posting_key = ANY(ARRAY['url1','url2',...]);
   Alles, was zurückkommt, KOMPLETT überspringen.

3. FIRMENSPERRE — EIN SELECT über alle Firmen der verbliebenen Kandidaten:
   SELECT lower(btrim(company)) AS company_key FROM public.leadgen_seen_postings
    WHERE outcome = 'lead_created' AND first_seen > now() - interval '14 days'
      AND lower(btrim(company)) = ANY(ARRAY['firma1','firma2',...]);
   Firmen, die zurückkommen, bekommen in diesem Lauf keinen Lead → outcome='company_cooldown'.
   Hat eine Firma in diesem Lauf mehrere Kandidaten: nur EINEN Lead (Priorität A vor B, bei Gleichstand der frischeste), die übrigen → outcome='company_cooldown'. Serien-Anzeigen (dieselbe Rolle in mehreren Städten) ebenso.

4. DETAILSEITE — für jeden verbliebenen Kandidaten mit Priorität A oder B genau EIN WebFetch der Posting-URL. Frage explizit nach: Projekttitel, ausschreibende Firma, ob die Firma Personaldienstleister/Vermittler oder Endkunde ist, Ansprechperson (Vor- und Nachname, falls genannt), eine auf der Seite angezeigte Kontakt-E-Mail (falls vorhanden), Muss-Anforderungen (konkrete Technologien, Methoden, Zertifikate), Kann-Anforderungen, Einsatzort und Remote-Anteil, Start, Dauer, Auslastung, Sprache, Branche des Endkunden, Veröffentlichungsdatum.
   Prüfe danach die Priorität erneut an den tatsächlichen Anforderungen. Ist die Hauptrolle doch C → outcome='pool_mismatch', kein Lead.

5. ADRESS-CACHE — EIN SELECT über alle Firmen, die noch einen Lead werden sollen:
   SELECT company_key, email, status FROM public.leadgen_contacts WHERE company_key = ANY(ARRAY['firma1','firma2',...]);
   - Zeigt die Detailseite selbst eine Kontakt-E-Mail an, hat diese Vorrang vor dem Cache (und wird in den Cache übernommen).
   - status='found' → gespeicherte E-Mail verwenden, KEINE Websuche.
   - status='blocked' oder 'not_found' → Firma überspringen, KEINE erneute Recherche → outcome='no_email'.
   - Firma nicht in der Tabelle → einmal recherchieren (siehe E-MAIL-SUCHE) und das Ergebnis eintragen, egal wie es ausgeht:
     INSERT INTO public.leadgen_contacts (company_key, company, email, domain, status, note) VALUES (...) ON CONFLICT (company_key) DO UPDATE SET email=EXCLUDED.email, status=EXCLUDED.status, note=EXCLUDED.note, last_checked=now();

E-MAIL-SUCHE (nur für Firmen ohne Cache-Eintrag und ohne Adresse auf der Detailseite): Websuche nach der offiziellen Firmen-Domain (NICHT Northdata, Creditreform, Firmenwissen.de, Dun & Bradstreet, RocketReach, LeadIQ), dann direkt <domain>/impressum bzw. <domain>/kontakt abrufen. EIN Versuch pro Firma: maximal 1 Websuche + 1-2 Seitenabrufe, danach abbrechen und als 'blocked' bzw. 'not_found' eintragen. Zeigt eine Seite die E-Mail nur als JavaScript-verschleierten Platzhalter ("[email protected]") oder Cloudflare-Encoding, zählt das NICHT als gefunden → status='blocked'.
Stehen mehrere Adressen auf der Seite, nimm in dieser Reihenfolge: eine Projekt-/Recruiting-/Jobs-/Karriere-/HR-Adresse, dann eine allgemeine Vertriebs-/Kontaktadresse, zuletzt info@.

HARTE REGEL — E-MAIL PFLICHT: recipient_email muss eine tatsächlich auf einer Seite angezeigte, echte Adresse sein — nie geschätzt, nie aus einem Namensmuster konstruiert ("Vorname.Nachname@domain"), nie aus einem Platzhalter geraten. Keine E-Mail gefunden → Lead NICHT aufnehmen, outcome='no_email'.
recipient_name: nur setzen, wenn die Detailseite eine Ansprechperson mit Vor- und Nachnamen nennt; sonst leer lassen. company: die ausschreibende Firma, wie auf der Seite angegeben. Nichts erfinden.

FORMAT VON stellenanzeige (verbindlich, XPORTAL liest daraus Betreff, Quelle und Anforderungen):
<Projekttitel wie ausgeschrieben> — <Firma> (<Personaldienstleister|Endkunde>); Muss: <a, b, c>; Kann: <d, e>; Einsatz: <z.B. 100 % remote | Hamburg, 2 Tage vor Ort>; Start: <MM/JJJJ oder ASAP>; Dauer: <z.B. 6 Monate>; Auslastung: <z.B. Vollzeit | 3 Tage/Woche>; Sprache: <Deutsch | Englisch>; Branche: <Branche des Endkunden>; veröffentlicht: <TT.MM.JJJJ>; Aufgabe: <1-2 Sätze aus der Ausschreibung> — <Posting-URL>
Regeln:
- Genau zwei Trenner " — " (Leerzeichen, Geviertstrich, Leerzeichen): nach dem Titel und vor der URL. Innerhalb des Mittelteils nur ";" und "," verwenden, nie " — ", " -- " oder " | ".
- Die Posting-URL ist die EINZIGE URL im Text und steht am Ende.
- Höchstens 1.000 Zeichen insgesamt. Muss höchstens 8 Punkte, Kann höchstens 5.
- Nur, was in der Ausschreibung steht. Unbekannte Felder weglassen (nicht "unbekannt" schreiben).
- Keine Namen, E-Mail-Adressen oder Telefonnummern von Personen in stellenanzeige — die gehören nur in recipient_name/recipient_email.

category: 'ki-entwicklung' (Entwicklung, Engineering, Architektur, Cloud mit KI) | 'ki-beratung' (Beratung, Strategie, Projektleitung, Product Owner, Schulung, Anforderungsmanagement) | 'ki-automatisierung' (Prozess-, Marketing-, Vertriebsautomatisierung mit KI).
notes: 'quelle=freelancermap-ai; anbieter=<personaldienstleister|endkunde>; prio=<A|B>'

MENGENGRENZE: Maximal 10 neue Leads pro Lauf. Gibt es mehr Kandidaten, nimm zuerst Priorität A, dann B, jeweils die frischesten; den Rest liegen lassen und NICHT in die Merkliste eintragen, damit der nächste Lauf ihn noch sieht.

SPEICHERN — Supabase (Supabase-MCP-Connector), project_id: xmoxzfqmcnsntvqxhtfb
- Leads, alle in EINEM INSERT:
  INSERT INTO public.leadgen_queue (recipient_email, recipient_name, company, stellenanzeige, status, category, notes) VALUES (..., 'new', '<category>', '<notes>'), (...) ON CONFLICT (stellenanzeige) DO NOTHING;
- Merkliste, alle bearbeiteten URLs in EINEM INSERT (auch verworfene — das ist ihr Zweck):
  INSERT INTO public.leadgen_seen_postings (posting_key, company, title, outcome, source) VALUES (..., 'freelancermap-ai'), (...) ON CONFLICT (posting_key) DO UPDATE SET last_seen = now();
  outcome: 'lead_created' | 'no_email' | 'not_relevant' | 'pool_mismatch' | 'company_cooldown'
- Adress-Cache: wie oben, gesammelt in EINEM INSERT.

WAS DU NIE TUST:
- Nie UPDATE oder DELETE auf public.leadgen_queue — auch nicht zum Aufräumen. Löschfristen setzt XPORTAL selbst durch (run_leadgen_cleanup). Archivierte Zeilen werden noch gebraucht: für Antworten, Neuabgleich und als Nachweis, warum jemand Post bekommen hat.
- leadgen_seen_postings und leadgen_contacts niemals leeren.
- Keine andere Tabelle anfassen als leadgen_queue, leadgen_seen_postings und leadgen_contacts (Romans Produktivdatenbank für x-portal.eu).
- Keine E-Mails verschicken, keine Formulare absenden, niemanden kontaktieren.

ÄNDERE NIEMALS SELBSTSTÄNDIG DEN PROMPT ODER ZEITPLAN DIESES SCHEDULED TASKS (auch mit technischem Zugriff auf die trigger-Tools) — das bleibt eine bewusste Entscheidung von Roman bzw. einer interaktiven Session mit ihm.

ABSCHLUSSBERICHT (kurz, keine Push-Notification bei normalem Lauf): geprüfte Kandidaten; per Merkliste übersprungen; neue Leads (davon Prio A / Prio B, Personaldienstleister / Endkunde); pool_mismatch (mit Titeln); company_cooldown; no_email; not_relevant; Firmen aus dem Cache bedient vs. neu recherchiert; Adressen direkt von der Detailseite. Ob dies der erste Lauf des Tages war (UTC-Stunde 4). Null neue Leads explizit benennen. Push-Notification nur, wenn der Lauf grundsätzlich fehlschlägt (Quellen nicht erreichbar, Supabase nicht erreichbar).
```

### Warum diese Fassung trotzdem schlank bleibt

- Die Detailseite kostet einen Abruf je neuem A/B-Kandidaten. Bei ein bis
  vier neuen Kandidaten je Lauf sind das höchstens vier Aufrufe mehr. Die
  gesparte Adressrecherche für C-Postings und gesperrte Firmen gleicht das
  weitgehend aus.
- Die Priorität steht fest im Text. Ändert sich der Bestand (neues
  bestätigtes Profil, ein Profil fällt weg), ist die Liste von Hand
  nachzuziehen, bis die Sicht `leadgen_pool_overview` aus Stufe 1 existiert.
