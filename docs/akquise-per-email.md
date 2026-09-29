# Akquise per E-Mail: vom Mailversand zum Verkaufstest

Plan vom 29. September 2026. Er beantwortet die Frage, wie sich die
vorhandene Lead-Strecke — Recherche-Aufgabe, `leadgen_queue`, Abgleich,
Versand aus `/chat/admin/leads` — so umbauen lässt, dass sie eine
Verkaufshypothese prüft, statt nur Mails zu verschicken. Das Dokument ist so
geschrieben, dass es ohne den Gesprächsverlauf lesbar ist, in dem es
entstanden ist.

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
darauf ein Profilangebot mit dem Hinweis „kostenlos" — sie prüft damit weder
Punkt 2 noch Punkt 4, und Punkt 5 bricht nach dem Klick ab.

## Die Strecke heute

```
Recherche-Aufgabe (außerhalb des Repos, ~06:20 und ~14:20 Uhr)
   │  schreibt über den Supabase-Connector (application_name = mgmt-api)
   ▼
leadgen_queue ──► xportal-leadgen-prepare (pg_cron, alle 10 Min, 3–14 UTC)
                    POST /api/leadgen/run {mode: "prepare"}
                    runLeadPreparePass()
                      extractProjectBrief()  → ein Modellaufruf je Lead
                      buildShortlist()       → Rangliste gegen den Katalog
                      Treffer:  Entwurf in leadgen_outreach (buildMatchEmail)
                      kein Treffer: status = dismissed, Nachfrage in shortlists
   ▼
Versand: nur durch den Betreiber (SCHEDULED_LEAD_SEND_ENABLED = false seit 28.09.)
           SendNowButton / Einzelversand → deliverPreparedDraft()
           IONOS-SMTP, 40 je Stunde, 5 s Abstand, Sperrliste, Abmeldelink
   ▼
Messung:  Buchungslink ?via=lead (seit 28.09.), Profillink ?via=lead (seit 29.09.),
          Suchlink ?entry=recruiter, Antworten nur von Hand als status = replied
```

Der Zeitgeber `xportal-leadgen-window` weckt die Route weiterhin, die Route
verschickt aber nichts (`stoppedBy: "manual_only"`).

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
- Seit dem 18. September kommen nur noch ein bis drei Leads je Lauf an, und
  keiner davon hatte einen Treffer.
- **Wer löscht, ist geklärt.** Der Lösch-Melder
  (`leadgen_queue_rows_deleted`) zeigt fast täglich um ~06:22 und ~14:22 Uhr
  eine Löschung über `mgmt-api`, also über die Management-API, über die auch der
  Supabase-Connector läuft. Gelöscht werden alle `dismissed`-Zeilen, bis zum
  17. September auch `contacted`. Das Zeitmuster passt zur Recherche-Aufgabe,
  nicht zur Anwendung und nicht zu `pg_cron` (dessen Läufe löschen null
  Zeilen). Die offene Frage aus `leadgen-betriebsarten.md` ist damit
  beantwortet.

### Versand

- **58 Mails** gingen vom 8. bis 17. September raus, an nur **37 Empfänger**.
  8 Empfänger bekamen mehr als eine Mail, einer acht. Dreimal ging dieselbe
  Ausschreibung zweimal an dieselbe Adresse. Die Ursache: Die Aufgabe löscht
  den Lead, spielt die Ausschreibung später neu ein, und der neue Lead hat eine
  neue ID. Die Sperre „ein Versand je Lead" greift dann nicht mehr.
- 27 Versuche sind gescheitert: 9 `send_failed`, 5 × IONOS `450`,
  8 `unattended_content`, 5 `suppressed`.
- 4 Entwürfe vom 14. und 15. September warten noch. Sie sind abgelaufen, ihr
  Lead ist gelöscht.
- 2 Einträge hängen seit dem 14. September in `sending`. Ob sie zugestellt
  wurden, weiß niemand.
- 3 Abmeldungen.
- Antworten sind nicht systematisch erfasst: `replied` steht am Lead, und den
  löscht die Aufgabe. Im Code steht als Rückmeldung aus der ersten Welle
  „sieben Antworten auf hundert Nachrichten".
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
  den letzten 30 Tagen angegeben, alle 4 aus dem Bereich KI.
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

## Die Analyse gegen die Daten gehalten

| Annahme der Analyse | Was die Daten sagen | Folge für die Strecke |
|---|---|---|
| Ursache für „kein Umsatz" offen | Suche → Registrierung trägt (18 von 29 beginnen). Danach bricht es ab: 2 Preisseiten, 0 Checkouts. Die Lead-Mails haben nie ein bezahltes Angebot gemacht, sie sagen „kostenlos" und „noch keine Beauftragung". | Die Ansprache muss ein Angebot enthalten, sonst misst der Test nur Interesse. |
| Credits ab 9 €, 90 Start-Credits | Teilweise überholt. Die Start-Credits wurden am 28.09. gesenkt (Gast 30, Konto 90). Das Vermittlungsmodell (10 % Erfolgshonorar) ist gebaut, hängt aber am Schalter, und die Bedingungen stehen auf „Entwurf". | Für Leads ist das Erfolgshonorar das natürliche Angebot. Bei 800 € Tagessatz und 60 Projekttagen sind 10 % **4.800 €**, das entspricht rund 250 Pro-Monaten zu 19 €. |
| Zielgruppe nach Bestand wählen | Die Recherche sucht breit. 87–90 % der Abgleiche enden ohne Treffer, jeder kostet einen Modellaufruf. | Die Recherche auf KI, IT-Beratung und Marketing beschränken. |
| Aktuell bestätigte Verfügbarkeit | Bestätigt sind 4 von 70. Die Mail zeigt „verfügbar (Stand …)" mit einem oft alten Datum. | Die Verfügbarkeit vor dem Versand beim Freelancer abfragen. |
| Zehn Gespräche führen | Die Mail bietet kein Gespräch mit XPORTAL an, und Antworten gehen verloren. | Eine zweite Fassung mit dem Gespräch als Ziel, Antworten am Versandbeleg erfassen. |
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
   Zeitplan wieder versendet. Bis dahin gibt der Betreiber frei. Für den Test
   genügt das: Zehn Gespräche brauchen keine 160 Mails am Tag.
2. **Vermittlungsbedingungen.** `PLACEMENT_TERMS.status` steht auf `draft`.
   Ein Honorar darf erst in der Mail stehen, wenn die Bedingungen freigegeben
   sind. Bis dahin bietet die Mail eine kostenlose Vorstellung und ein Gespräch
   an.
3. **Anschreiben der Freelancer.** Stufe 3 unten fragt die Verfügbarkeit per
   Mail ab. Für die 65 Profile ohne eigenes Konto ist vorher zu klären, auf
   welcher Grundlage sie im Bestand sind, zum Beispiel eine Bewerbung oder eine
   Einwilligung.

## Der Plan

### Stufe 0 — Aufräumen (ein Tag, nichts Neues)

- **Die Recherche-Aufgabe löscht nicht mehr.** Sie fügt nur noch ein und ändert
  nichts. Das Aufräumen übernimmt `run_leadgen_cleanup()` nach Frist; dafür
  ist es da. Solange die Aufgabe löscht, geht jede Antwort verloren, und
  dieselbe Ausschreibung kann ein zweites Mal verschickt werden.
- **Die zwei hängenden `sending`-Einträge** im Postfach unter „Gesendet"
  prüfen und danach auf `sent` oder `failed` setzen.
- **Die vier abgelaufenen Entwürfe** verwerfen.
- **`outreach-agent-tick`** läuft alle fünf Minuten (Mo–Fr) auf derselben
  Warteschlange (Edge Function `outreach-agent`, `outreach_log` ist leer).
  Abschalten, wenn nichts mehr davon abhängt.
- In `leadgen-betriebsarten.md` die Frage „Wer löscht?" mit dem Befund oben
  schließen.

### Stufe 1 — Die Recherche auf den Bestand ausrichten

Die Aufgabe liegt außerhalb dieses Repos. Was sie tun soll, steht deshalb hier
als Vertrag. Die Anwendung bekommt dazu **eine** Schreibfunktion, über die der
Import läuft:

```sql
public.import_leadgen_lead(
  p_recipient_email text,
  p_recipient_name  text,
  p_company         text,
  p_stellenanzeige  text,   -- 'Titel — Kurzbeschreibung — URL'
  p_category        text,   -- 'ki' | 'it-beratung' | 'marketing'
  p_lead_type       text,   -- 'endkunde' | 'personaldienstleister'
  p_posted_at       date
) returns table (inserted boolean, reason text)
```

Sie prüft das Format und dedupliziert über die Quelladresse der Ausschreibung,
nicht über den ganzen Text. Sie lehnt Adressen auf der Sperrliste ab, ebenso
Empfänger, die in den letzten 30 Tagen schon Post bekommen haben (siehe
Stufe 2). Durchsetzen kann die Datenbank das gegenüber der Aufgabe nicht, weil
die Management-API als `postgres` schreibt. Die Funktion ist deshalb der eine
dokumentierte Weg, und der Lösch-Melder zeigt, wenn jemand daran vorbei
schreibt.

Neue Spalten in `leadgen_queue`: `lead_type`, `posted_at`, `source_url`
(erzeugt aus `leadSourceUrl()`, eindeutig).

**Vorschlag für die Anweisung der Recherche-Aufgabe** (an ihre bestehende
Anweisung anzuhängen):

```
Regeln für das Einspielen von Leads in XPORTAL:

1. Nur Ausschreibungen aus diesen Fachgebieten:
   - ki: KI-/AI-Beratung, KI-Engineering, LLM/Agenten/RAG, KI-Schulung
   - it-beratung: Anforderungsmanagement, Business-Analyse, IT-Projektleitung,
     IT-Architektur/Governance, Digitalisierung
   - marketing: SEO, SEA/Google Ads, Performance-Marketing, Paid Social
   Alles andere überspringen.
2. Nur Ausschreibungen, die höchstens 5 Tage alt sind und remote oder im
   DACH-Raum stattfinden.
3. Einordnen: Personaldienstleister (Agentur, Vermittler, Projektbörse im
   Auftrag) oder Endkunde (das Unternehmen, das den Freelancer selbst
   beauftragt).
4. Einspielen ausschließlich über
   select * from public.import_leadgen_lead(...);
   Niemals UPDATE oder DELETE auf leadgen_queue ausführen, auch nicht zum
   Aufräumen.
5. Am Ende berichten: gefunden / eingespielt / abgelehnt mit Grund.
```

Das spart Modellaufrufe (jeder Abgleich kostet einen) und hebt die
Trefferquote. **Zielwerte zum Prüfen:** mindestens 50 neue Leads je Woche in
den drei Gebieten, Trefferquote über 30 %.

### Stufe 2 — Niemand wird doppelt angeschrieben

In `deliverPreparedDraft()`, denn dort verlässt jede Mail das Haus. Die
Stundenbremse sitzt aus demselben Grund dort.

- **Je Adresse:** höchstens eine Akquise-Mail in 30 Tagen.
- **Je Domain:** höchstens eine in 7 Tagen. Eine Agentur mit fünf Recruitern
  bekommt sonst fünf Mails in einer Woche.
- **Je Ausschreibung:** ein eindeutiger Teilindex auf
  `leadgen_outreach (source_url) where state in ('sending','sent')`. Er gilt
  auch dann, wenn der Lead gelöscht und neu eingespielt wurde.
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
  aus derselben Rangliste gefragt. `shortlist.matches` liegt ohnehin vor.
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

Ausgewertet wird zusätzlich getrennt nach `lead_type`: Ein
Personaldienstleister kauft anders als ein Endkunde. Er ist eher Partner mit
geteilter Marge als Kunde mit Erfolgshonorar.

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
- **Antworten am Beleg, nicht am Lead**, denn der Lead wird gelöscht, der Beleg
  bleibt. Neue Spalten: `reply_status` (`interessiert` | `spaeter` |
  `kein_bedarf` | `abgemeldet` | `unzustellbar`), `replied_at` und
  `reply_note`. In der Ansicht „Versandt" setzt ein Klick je Zeile den Status.
  Später, optional: das IONOS-Postfach per IMAP abfragen und Antworten über
  `In-Reply-To` dem Beleg zuordnen.
- **Auswertung** als Streifen auf `/chat/admin/leads`, je Fassung und je
  Fachgebiet:
  `versandt → geklickt → geantwortet → Gespräch → Vorstellung → Beauftragung → bezahlt`.
- **Optional:** Besucher zählen, ohne Cookie (zum Beispiel serverseitig über
  Netlify). Für die Mail-Strecke nicht nötig, denn die Kennung ersetzt es.

### Stufe 6 — Versand erst halbautomatisch, dann nach Plan

- **Während des Tests** gibt der Betreiber einmal täglich den Stapel frei,
  über den vorhandenen `SendNowButton`. Deckel: 10 am Tag.
- **Danach** kommt der Schalter `leadgen_automation` aus
  `leadgen-betriebsarten.md` (dort vollständig beschrieben). Er ersetzt die
  Konstante `SCHEDULED_LEAD_SEND_ENABLED`. „Versand nach Plan" darf erst nach
  der Rechtsprüfung eingeschaltet werden.
- Automatische Nachfass-Mails gibt es erst nach der Rechtsprüfung. Jede
  weitere Mail ist ein weiterer Anlass für eine Abmahnung.

## Der 14-Tage-Test auf dieser Strecke

| Tage | Was |
|---|---|
| 1–2 | Stufe 0, Anweisung der Recherche-Aufgabe anpassen (Stufe 1) |
| 3–5 | Stufe 2 (Doppelschutz), Stufe 4 Fassung B ohne Honorar, Antworten am Beleg (Teil von Stufe 5) |
| 6–14 | täglich 8–10 Mails freigeben, A und B abwechselnd; Antworten selbst führen; Gespräche und begleitete Suchen über `/chat/admin/vermittlungen` |

Stufe 3 (Verfügbarkeitsabfrage) und die volle Verfolgung bis zur Zahlung
folgen danach, weil sie länger brauchen. Im Test bestätigt der Betreiber die
Verfügbarkeit von Hand, bevor er freigibt. Die Analyse hält manuelle
Unterstützung in dieser Phase ausdrücklich für richtig.

**Erwartung an die Menge.** Bei rund 7 % Antworten ergeben 80 Mails etwa fünf
bis sechs Antworten. Für zehn Gespräche braucht es also bessere Zielgenauigkeit
(Stufe 1) oder rund 150 Mails. Unterschiede zwischen A und B sind bei dieser
Menge nur erkennbar, wenn sie groß sind, etwa doppelt so viele Antworten.
Kleinere Unterschiede sind Rauschen.

**Entscheidungsregeln** nach dem Test, in der Sprache der Analyse:

| Bild nach 14 Tagen | Nächste Arbeit |
|---|---|
| unter 3 % Antworten, kaum Klicks | Kundenzugang: Zielgruppe, Absender, Betreff, Kanal |
| Antworten, aber „passt nicht" oder keine Gespräche | Bestand und Matching; die Nachfrageseite zeigt, welche Profile fehlen |
| Gespräche und Vorstellungen, aber keine Beauftragung | Angebot und Preis: Erfolgshonorar oder bepreister Suchauftrag |
| Beauftragung zugesagt, Rechnung nicht bezahlt | Abrechnung (`engagements.fee_status`) |

## Reihenfolge und Aufwand

| Schritt | Aufwand | hängt ab von |
|---|---|---|
| Stufe 0 Aufräumen | S | — |
| Stufe 1 Anweisung der Aufgabe | S | Zugriff auf die Aufgabe |
| Stufe 1 `import_leadgen_lead()` + Spalten | M | — |
| Stufe 2 Doppelschutz | M | — |
| Stufe 4 Fassung B (ohne Honorar) | M | — |
| Stufe 5 Antworten am Beleg | S | — |
| Stufe 5 Kennung, Klick, Einstieg | M | — |
| Stufe 5 Verbindung bis Beauftragung + Auswertung | L | Vermittlungsmodell aktiv |
| Stufe 3 Verfügbarkeitsabfrage | L | Klärung Punkt 3 |
| Stufe 4 Satz zum Honorar | S | Freigabe der Bedingungen |
| Stufe 6 Schalter `leadgen_automation` | M | Rechtsprüfung für „nach Plan" |

## Was nur der Betreiber beantworten kann

- Wo läuft die Recherche-Aufgabe, und wie lautet ihre Anweisung? Ohne sie
  lassen sich Stufe 0 und Stufe 1 nicht umsetzen.
- Wie sind die 65 Profile ohne Konto in den Bestand gekommen?
- Wie weit ist die rechtliche Prüfung der Vermittlungsbedingungen und der
  Akquise-Mail?
- Wie vielen Auftraggebern wurde XPORTAL persönlich gezeigt, und wie oft wurde
  ausdrücklich ein bezahltes Angebot gemacht? Das steht in keiner Tabelle.
