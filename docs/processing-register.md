# Verzeichnis von Verarbeitungstätigkeiten

Nach Art. 30 Abs. 1 DSGVO. Das Verzeichnis beschreibt, **was** verarbeitet
wird; `docs/processor-register.md` beschreibt, **wer** dabei als
Auftragsverarbeiter mitwirkt, und `docs/tom.md`, **wie** die Daten geschützt
sind. Die drei Dokumente gehören zusammen und werden zusammen gepflegt.

Sprache: Deutsch, abweichend vom Rest von `docs/`. Es ist ein Dokument, das
einer deutschen Aufsichtsbehörde vorgelegt wird.

**Stand:** 28. August 2026 · abgeleitet aus dem Code, nicht aus Absichten.
Jede Zeile ist an der Datenschutzerklärung, den Migrationen und den
Retention-Policies überprüfbar.

## Verantwortlicher

| | |
|---|---|
| Verantwortlicher | 300 – Inhaber Roman Dering, Einzelunternehmen |
| Anschrift | Heilig-Kreuz-Straße 18, 87600 Kaufbeuren, Deutschland |
| Kontakt | info@x-portal.eu, https://x-portal.eu/contact |
| Datenschutzbeauftragter | nicht benannt — die Voraussetzungen des Art. 37 DSGVO und des § 38 BDSG liegen nach derzeitiger Einschätzung nicht vor (unter 20 Personen ständig mit automatisierter Verarbeitung befasst, keine Kerntätigkeit nach Art. 37 Abs. 1 lit. b/c). **Bei Wachstum erneut prüfen.** |
| Aufsichtsbehörde | Bayerisches Landesamt für Datenschutzaufsicht, Promenade 18, 91522 Ansbach |

## Verarbeitungstätigkeiten

### 1. Bereitstellung der Website und Anwendung

- **Zweck:** Auslieferung der Seiten, Fehleranalyse, Abwehr von Missbrauch.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO (sicherer, stabiler Betrieb).
- **Betroffene:** alle Besucher.
- **Datenkategorien:** IP-Adresse, Zeitpunkt, aufgerufene URL, Referrer,
  Browser- und Geräteangaben, Antwortstatus (Netlify-Protokolle); in der
  Anwendungsdatenbank ausschließlich HMAC-Ableitungen der IP für die
  Ratenbegrenzung (`rate_limit_counters`).
- **Empfänger:** Netlify, Inc.
- **Drittland:** siehe Auftragsverarbeiter-Register.
- **Fristen:** Netlify-Protokolle nach Kontoeinstellung; Zähler der
  Ratenbegrenzung täglich (`run_rate_limit_cleanup()`).

### 2. Gastzugang, Konto und Anmeldung

- **Zweck:** Zuordnung von Projekten zu einem Zugang, dauerhaftes Konto,
  Wiederherstellung, Missbrauchsschutz.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO für Bereitstellung und
  vorvertragliche Maßnahmen; Art. 6 Abs. 1 lit. f DSGVO für Sicherheit.
- **Betroffene:** Nutzer mit Gastzugang oder Konto.
- **Datenkategorien:** anonyme Benutzerkennung, E-Mail-Adresse,
  Anmeldeanbieter, Authentifizierungsmetadaten, Sitzungsdaten,
  Gast-Übertragungsnachweise (`guest_claims`).
- **Empfänger:** Supabase; Google nur nach ausdrücklicher Wahl der
  Google-Anmeldung.
- **Fristen:** ungenutzte anonyme Konten und abgelaufene Übertragungsnachweise
  nach 30 Tagen.

### 3. Projektbeschreibung, Chat und KI-Strukturierung

- **Zweck:** Überführung einer Projektbeschreibung in einen strukturierten
  Anforderungsbrief; regelbasierter Abgleich mit Profilen.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO; ergänzend lit. f für
  Kosten- und Missbrauchskontrolle.
- **Betroffene:** Nutzer; mittelbar die in einer Beschreibung genannten
  Personen.
- **Datenkategorien:** Nachrichten, Projekte, strukturierte Anforderungen,
  Matching-Ergebnisse und Bewertungs-Snapshots, Zeitstempel.
- **Empfänger:** Supabase; OpenAI Ireland Ltd. für den zur Strukturierung
  erforderlichen Text nebst pseudonymer Sicherheitskennung. Anfragen laufen mit
  `store: false`; anbieterseitige Missbrauchsprotokolle bleiben davon unberührt.
- **Fristen:** Nachrichten in inaktiven Projekten 180 Tage; inaktive Projekte
  und Match-Snapshots 365 Tage.

### 4. Recherche externer Freelancer-Profile

- **Zweck:** Auf ausdrückliche Anforderung Suche nach öffentlich zugänglichen
  beruflichen Profilen.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO für die angeforderte
  Leistung; Art. 6 Abs. 1 lit. f DSGVO für die Verarbeitung der Profildaten
  der recherchierten Personen (Vermittlung beruflicher Kontakte).
- **Betroffene:** recherchierte Freelancer — Personen, die **nicht** selbst
  Daten übermittelt haben.
- **Datenkategorien:** Name, Rolle, Kompetenzen, Tätigkeiten, Projekte,
  berufliche URLs, Quell-URLs, Zeitpunkt der Recherche, Ergebnis-Snapshots.
- **Besondere Pflicht:** Information nach Art. 14 DSGVO spätestens einen Monat
  nach der Erhebung. Überwacht unter `/chat/admin/outreach`; Text aus
  `lib/freelancer/outreach.ts`; Versand durch einen Menschen.
- **Fristen:** 30 Tage ab Recherche, danach automatische Löschung ohne
  Einwilligung (`run_sourced_candidate_cleanup()`).

### 5. Freelancer-Bewerbungen, Profile und Lebensläufe

- **Zweck:** Aufnahme in den kuratierten Katalog, Prüfung, Darstellung.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (Bewerbung als
  vorvertragliche Maßnahme); Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO für
  die Bereitstellung und Freigabe des Lebenslaufs.
- **Betroffene:** Freelancer.
- **Datenkategorien:** Name, Kontaktadresse, Rolle, Kompetenzen, Sprachen,
  Standort, Verfügbarkeit, Sätze, Buchungsadresse, Profilbild, Lebenslauf als
  PDF, Prüfvermerke.
- **Empfänger:** Supabase (Datenbank und private Speicher-Buckets); Kunden
  sehen ein freigegebenes Profil, den Lebenslauf nur nach gesonderter Freigabe
  und nur zu einem Profil aus dem eigenen aktuellen Ergebnis.
- **Fristen:** Lebenslauf bis zum Widerruf oder Wegfall des Zwecks;
  Profildaten bis zur Löschung des Profils.

### 6. Vermittlung und Buchungsanfragen

- **Zweck:** Herstellung des Kontakts zwischen Kunde und Freelancer.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO; lit. f für die
  Nachvollziehbarkeit der Vermittlung.
- **Datenkategorien:** ausgewähltes Profil, Vermittlungsstatus,
  Buchungsklicks, Zeitstempel.
- **Empfänger:** der jeweilige Buchungsanbieter **erst nach dem Klick des
  Nutzers**; keine Einbettung, keine automatische Verbindung.
- **Fristen:** Vermittlungsnachweise bis zu 730 Tage.

### 7. Whitelist / Early Access

- **Zweck:** Verwaltung der Anmeldung und Versand der gewünschten Start- und
  Onboarding-Informationen.
- **Rechtsgrundlage:** Einwilligung, Art. 6 Abs. 1 lit. a DSGVO.
- **Datenkategorien:** Name, E-Mail-Adresse, Land, Quelle,
  Einwilligungszeitpunkt.
- **Fristen:** unbestätigte Einträge 30 Tage
  (`run_whitelist_pending_cleanup()`); bestätigte Prüfung nach 365 Tagen.
- **Empfänger:** 1&1 IONOS SE als Auftragsverarbeiter für den Versand der
  Bestätigungsmail; Verarbeitung innerhalb der EU.
- **Stand:** Das Doppelbestätigungsverfahren ist seit dem 01.09.2026 in
  Betrieb — die Bestätigungsmail geht raus, `confirmation_sent_at` hält den
  Versand fest. Ein Eintrag ohne Bestätigung darf weiterhin nicht
  angeschrieben werden; der Aufräum-Job löscht ihn nach 30 Tagen.

### 8. Kontaktanfragen

- **Zweck:** Bearbeitung und Beantwortung eines Anliegens.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO bei vertraglichem Bezug,
  sonst lit. f.
- **Datenkategorien:** Name, E-Mail-Adresse, Betreff, Nachrichtentext.
  **Ausdrücklich nicht:** IP-Adresse, Browserkennung, Referrer.
- **Empfänger:** 1&1 IONOS SE als Auftragsverarbeiter. Seit dem 01.09.2026
  gehen zwei Nachrichten raus: eine Benachrichtigung an das Betreiberpostfach
  (`CONTACT_NOTIFICATION_EMAIL`, ersatzweise die Impressumsadresse) mit dem
  vollständigen Anliegen, und eine Eingangsbestätigung an den Absender, die
  seine eigene Nachricht als Zitat wiedergibt. Die Adresse im Formular ist
  ungeprüft; das Zitat ist als Zitat gekennzeichnet, und hCaptcha sowie fünf
  Anfragen je Stunde und IP begrenzen, wie oft dieser Weg begangen werden kann.
- **Fristen:** Löschung nach Erledigung, Prüfung spätestens nach 365 Tagen;
  bei vertraglichem Bezug ggf. handelsrechtliche Aufbewahrung.

### 9. Nutzungsmessung und Guthaben

- **Zweck:** Zuordnung des KI-Verbrauchs zu einem Konto, Kostenkontrolle,
  Abrechnung von Credits.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO; lit. f für die
  Missbrauchs- und Kostenkontrolle.
- **Datenkategorien:** Kontobezug, Zeitfenster, Token- und Kostenkennzahlen,
  Reservierungen, Ledger-Einträge. Keine Chatinhalte.
- **Fristen:** 90 bis 400 Tage je Kontotyp; abrechnungsrelevante
  Ledger-Daten Prüfung nach 2.555 Tagen.

### 10. Sicherheit, Protokollierung und Auditierung

- **Zweck:** Nachvollziehbarkeit sicherheitsrelevanter Zugriffe,
  Missbrauchsabwehr.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO; Art. 32 DSGVO als Pflicht
  zur Sicherstellung.
- **Datenkategorien:** Ereignisname, Akteur oder Tombstone, Zieltyp,
  Ergebnis, Trace-ID, gefilterte Metadaten. Eine Sperrliste verhindert, dass
  Inhalte, Token, Adressen oder Telefonnummern in Metadaten landen.
- **Fristen:** Audit-Nachweise bis zu 730 Tage, danach Löschung oder
  Pseudonymisierung.

### 11. Akquise gegenüber Auftraggebern (Leads)

- **Zweck:** Ansprache von Unternehmen, die eine Projekt- oder
  Stellenausschreibung veröffentlicht haben, mit dem Angebot der Vermittlung.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO (Direktwerbung gegenüber
  Unternehmen als berechtigtes Interesse, Erwägungsgrund 47). Die Zulässigkeit
  der Ansprache selbst richtet sich zusätzlich nach § 7 UWG.
- **Betroffene:** Ansprechpartner der ausschreibenden Unternehmen.
- **Datenkategorien:** Firmenname, Name des Ansprechpartners,
  Kontaktadresse, Text und Adresse der Ausschreibung, interne Kategorie und
  Notiz (`leadgen_queue`); Betreff und Wortlaut der verschickten Nachricht,
  Zeitpunkt, Absender, verwendetes Modell (`leadgen_outreach`).
- **Herkunft:** nicht bei der betroffenen Person erhoben, sondern aus der
  von ihr veröffentlichten Ausschreibung und dem dort verlinkten
  Firmenprofil. Die Information nach Art. 14 DSGVO steht deshalb im Fuß
  jeder Nachricht (`lib/leadgen/outreach-message.ts`) und geht mit der
  ersten Ansprache raus, nicht später.
- **Empfänger:** 1&1 IONOS SE als Mailversender; OpenAI für den Entwurf des
  Anschreibens. Dem Modell werden Firmenname, Ansprechpartner und
  Ausschreibungstext übergeben, nicht die Kontaktadresse.
- **Drittland:** siehe Auftragsverarbeiter-Register.
- **Fristen:** nie angeschriebene Leads 90 Tage ab Import, angeschriebene
  Leads mitsamt Versandprotokoll 365 Tage ab dem Versand
  (`retention_policies`, `run_leadgen_cleanup()`, täglich um 02:55 UTC).
  Ein Widerspruch beendet die Frist sofort.
- **Entscheidung eines Menschen:** Jede Nachricht wird durch einen Klick des
  Betreibers ausgelöst, im Einzelfall oder als ausdrücklich bestätigter
  Stapel von höchstens 20 Nachrichten. Es gibt keinen Zeitplan und keinen
  Automatismus, der ohne diesen Klick verschickt.
## Schwellenwertprüfung zur Datenschutz-Folgenabschätzung

Art. 35 DSGVO verlangt eine DSFA, wenn eine Verarbeitung voraussichtlich ein
hohes Risiko für die Rechte und Freiheiten natürlicher Personen zur Folge hat.
Geprüft wurde die kritischste Tätigkeit, Nummer 4 — die Recherche von
Profildaten aus öffentlichen Quellen ohne Kenntnis der betroffenen Person.

| Kriterium (WP 248) | Trifft zu | Begründung |
|---|---|---|
| Bewerten oder Einstufen (Scoring) | teilweise | Profile werden nach dokumentierten Regeln gefiltert und sortiert; keine Bewertung der Person durch ein Modell. |
| Automatisierte Entscheidung mit Rechtswirkung | nein | Die Auswahl trifft der Nutzer; Art. 22 DSGVO ist nicht einschlägig. |
| Systematische Überwachung | nein | Keine fortlaufende Beobachtung, sondern eine einmalige Recherche je Anfrage. |
| Besondere Kategorien nach Art. 9 | nein | Ausdrücklich unerwünscht, vertraglich untersagt, nicht erhoben. |
| Umfangreiche Verarbeitung | nein | Höchstens drei Kandidaten je Suche, Löschung nach 30 Tagen ohne Einwilligung. |
| Abgleich oder Zusammenführung von Datensätzen | teilweise | Rechercheergebnisse werden mit dem Anforderungsbrief abgeglichen, nicht mit anderen Personendatenbeständen. |
| Daten schutzbedürftiger Personen | nein | Berufliche Daten von Selbständigen. |
| Innovative Technologie | teilweise | Einsatz eines Sprachmodells zur Strukturierung und Websuche. |
| Betroffene an der Ausübung von Rechten gehindert | nein | Widerspruch und Löschung sind formlos möglich; die Information nach Art. 14 wird aktiv versandt. |

**Ergebnis:** Zwei Kriterien treffen teilweise zu, keines vollständig. Die
Schwelle „hohes Risiko“ wird nach derzeitiger Einschätzung nicht erreicht; eine
DSFA ist nicht erforderlich. Die Einschätzung stützt sich wesentlich auf drei
Begrenzungen, die im Code verankert sind: höchstens drei Kandidaten je Suche,
automatische Löschung nach 30 Tagen ohne Einwilligung und keine
Veröffentlichung ohne Einwilligung.

**Neu zu bewerten,** sobald eine dieser Begrenzungen fällt, die Recherche auf
Vorrat läuft, Rechercheergebnisse dauerhaft gespeichert werden oder ein Modell
Personen bewertet statt Anforderungen abzugleichen. Diese Prüfung ist
mindestens jährlich zu wiederholen und das Ergebnis hier festzuhalten.

## Pflege

Zu ändern bei jeder neuen Datenkategorie, jedem neuen Empfänger, jeder neuen
Frist und jeder Änderung an einer Rechtsgrundlage. Eine Migration, die eine
Tabelle mit personenbezogenen Daten anlegt, ohne dass hier eine Zeile
entsteht, ist unvollständig.
