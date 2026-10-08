AKTUELLER STAND 08.10.2026 — Abschluss zur Übergabe (dieser Abschnitt hat Vorrang)

Bestehender Branch: codex/recruiting-saas-20261007. Nicht neu von main anfangen.
Kein Produktionsrelease, keine Produktionsmigration und keine reale Testabbuchung. Nutzer hat Abschluss und Übergabe an eine andere KI angeordnet. Auf anschließendes „weiter“ wird dieser Abschluss fertiggestellt. Seit Nutzeranweisung wird das Nutzungskontingent nicht mehr abgefragt.

BESTANDENE PRÜFUNGEN
- Vollständige Supabase-Migrationskette/pgTAP auf GitHub: 350 Assertions in 18 Dateien, Database-Run 37769733449, Commit 13fdf6a. Die 39 früheren Fehler und fehlenden Indizes sind behoben. Seitdem keine SQL-Änderung.
- Application-Run 37769733371 auf 13fdf6a grün, einschließlich Sicherheitsaudit, Lint, Typcheck, Tests und Build; Preview grün.
- Neuer lokaler Stand: 1682 Anwendungstests in 188 Dateien bestanden; Typprüfung bestanden. Abschließender Lint nach Korrektur des Effect-Loaders bestanden. Drei Kontakt-Browserprüfungen nach dieser Korrektur bestanden (1280/390 px, Tastatur, Retry, Ladefehler, keine private Adresse ohne Freigabe).
- Produktionsbuild und Performance bestanden: JS gzip 473766/520000, größter Chunk72976/120000, CSS57431/57500. Build war unmittelbar vor der kleinen Effect-Loader-Korrektur; aktuelle CI nach Push beachten.
- Fünf echte Stripe-Sandbox/API-Test-Clock-Prüfungen bestanden: 14-Tage-Kartentrial/0-EUR-Rechnung/erste Monatszahlung 19 EUR; Kündigung vor Trial-Ende ohne kostenpflichtige Rechnung; abgelehnte Zahlung mit Nachzahlung; zusätzliche Authentifizierung mit Wiederherstellung durch gültiges Ersatz-Zahlungsmittel; abgebrochener Checkout und idempotente Session-Erstellung.
- Stripe-Evidenz: docs/evidence/recruiting-stripe-sandbox-2026-10-08.json. Reproduzierbares Skript: scripts/verify-stripe-sandbox.mjs. WICHTIG: Direkte Stripe-API-Tests mit echten Sandbox-Objekten, keine vollständige App/Browser/Webhook/Supabase-End-to-End-Abnahme. Zusätzliche Authentifizierung wurde als requires_action nachgewiesen; der 3DS-Browserdialog selbst wurde nicht abgeschlossen.

NEU IMPLEMENTIERT
Private freigegebene Kontaktadresse in Anfrage-Dialog und Gesprächsübersicht; Status neu laden; ausdrücklich ausgelöster Zustellungs-Retry für ausstehende/fehlgeschlagene Benachrichtigungen. API lädt Kontaktdaten ausschließlich für den Eigentümer nach aufgezeichneter Freelancer-Freigabe, nicht für abgelehnte/historische Vorgänge; private/no-store. Retry umfasst auch fehlgeschlagene Bestätigungsmails. Fünf neue API-Rechteprüfungen. Lokale Vorschauseite /chat/preview/contact ist außerhalb development gesperrt. Keine externe Kontaktmail bei diesen Browser-/API-Tests versandt.

ZUGÄNGE FÜR FORTSETZUNG
Stripe CLI ist nach Nutzerfreigabe für „300 Sandbox“, acct_1U8BM82FFiyUCWGi autorisiert. Nicht erneut eine Sandbox anlegen. CLI-Konfiguration liegt außerhalb des Repos unter ../stripe-acceptance-config.toml. Auth nutzt die CLI-Anmeldung; dort liegt kein exportierbarer regulärer Test-API-Key. Keine Zugangsdaten veröffentlichen. Den früheren temporären rkcs-Schlüssel nicht verwenden. CLI per npm exec --package=@stripe/cli oder vorhandenes stripe.exe verwenden; whoami --format json prüft das Konto. STRIPE_ACCEPTANCE_ACCOUNT muss explizit acct_1U8BM82FFiyUCWGi sein. Kein --live.
Supabase: XPORTAL-Produktion xmoxzfqmcnsntvqxhtfb (17.6), keine bestehende Entwicklungsbranch gefunden. 300-Projekt uhxwaonnkvicfekzefbn ist nicht XPORTAL-Staging. GitHub Database nutzt eine kurzlebige lokale Supabase-Instanz mit vollständiger Migrationskette. Keine gehostete Testbranch oder Produktionsänderung angelegt. Der GitHub-Secret-Export wurde mangels regulärem Test-Key nicht ausgeführt.

KONKRETE RESTARBEIT BIS ZUR PRODUKTIONSFREIGABE
1. Aktuelle PR-Prüfungen auswerten. Serverseitige Berechtigungen aller CV/Link/Kalender/Team-/KI-/Profilwege gegen echten DB-Zustand vollständig abnehmen. Zentraler Rechtehelper und Team-POST-Schutz sind implementiert; nicht als offene Implementierung neu bauen.
2. Stripe-Sandbox mit XPORTAL und isoliertem Supabase verbinden; vollständige zwölf Szenarien aus dem Originalauftrag ausführen. Noch nicht durch echte integrierte Tests belegt: App-Kartencheckout, Auth-/Checkout-Abbruch mit Projekttext, echte konkurrierende Requests, signierte/doppelte/vertauschte Webhooks bis ins Credit-Ledger, erschöpfte Credits ohne Frühbelastung, Wiederholungs-Trial/Bestandskonten, vollständiger 3DS-Dialog und Wiederfreischaltung in der Anwendung. Bestehende Unit-/SQL-Tests und fünf Stripe-Fälle nutzen, nicht erneut grundlos aufsetzen.
3. Kontakt-Outbox/SMTP inkl. Zustimmung, Absturz/Lease, Retry und Widerruf integriert abnehmen. Kontakt-UI ist jetzt angeschlossen; nicht mehr als fehlend führen.
4. Betriebsfunktionen noch offen: verlässliche Sieben-Tage-Erinnerung, automatischer Zahlungsabgleich, tatsächliche Steuer-/Portal-Konfiguration. Aktuelle Sandbox-Preise/Testobjekte sind keine produktive Konfiguration.
5. SaaS-Bedingungen sind in lib/legal/policy.ts weiterhin ausdrücklich Entwurf und Live-Checkout bleibt gesperrt. Keine rechtliche Freigabe behaupten/erfinden. Nach fachlicher Freigabe die echten produktiven Preise/Steuern/Webhooks/Portal zuordnen.
6. Danach Migration/Release konkret vorbereiten, main mergen, Netlify ausrollen, geänderte Routen und Zahlungsweg live verifizieren. Kein Release allein wegen grüner Unit-Tests.
Nachrangig: Kampagnenzuordnung/Funnelreport/Retention und Komfortfunktionen. Fokus auf verkaufsfähigen Kern für Werbetraffic.

ORIGINALABNAHME — BELEGSTATUS
1 Trial: Stripe bestanden; kompletter App-Checkout offen.
2 Checkout-Abbruch: Stripe bestanden; Auth-/Draft-Rückkehr offen.
3 Konkurrenz: Stripe-Session-Idempotenz bestanden; echte konkurrierende App/DB-Requests offen.
4 Trial-Ende: Stripe-Rechnung/Zahlung bestanden; integrierte Monatsrechte offen.
5 Kündigung: Stripe-Test-Clock bestanden; kompletter Konto-UI-Weg offen.
6 Zahlungsfehler/SCA: Stripe-Zustände bestanden; App-Meldung und 3DS-Dialog offen.
7 Nachzahlung: Stripe wieder aktiv; App-Credits ohne Doppelgrant integriert offen.
8 Replay/Reihenfolge/0 EUR: Unit/SQL und echte Stripe-Nullrechnung; signierter Gesamtweg offen.
9 Erschöpfung: Unit/SQL vorhanden; integrierter Beweis ohne Frühbelastung offen.
10 Wiederholungs-Trial/Bestand: Unit/SQL vorhanden; reale integrierte Kontenprüfung offen.
11 Neue Kontakte: no_fee/DB/API/UI vorhanden; echte SMTP-Gesamtstrecke offen.
12 Mobil/Tastatur: Kontaktteil bestanden; kompletter Landing/Auth/Checkout/Draft-Weg offen.

HISTORISCHE ABSCHNITTE — nachfolgende offene Punkte/Zahlen sind teilweise überholt

AKTUELLER STAND 08.10.2026 — SQL-Korrektur und Sicherheitsupdates (dieser Abschnitt hat Vorrang)

Weiter auf codex/recruiting-saas-20261007. Kein Produktionsrelease und keine reale Testabbuchung.
Letzter vollständig ausgewerteter Datenbanklauf: 37765291194, HEAD 091edd4. FK-Indizes bestanden; noch 39 Assertions in drei Credit-/Stripe-Dateien fehlgeschlagen.
Jetzt geändert: historische Guthaben ausdrücklich als Testdaten angelegt; neue Gast-/Registrierungsboni bleiben 0; Gastkonvertierung muss Reservierungen erhalten. Einmalige historische Grants behalten ihr Zeitfenster; Abo-Ablauftests erhalten echte Subscription-/Grant-Fixtures.
Neue additive Migration 20261008112129_recruiting_credit_compatibility.sql: roll_ai_credit_period weist NULL-Identitäten wieder ab; alter activate_paid_plan setzt Grant/Ablauf/erste Zahlung und erhält historische Restguthaben sowie offene Reservierungen. Vollständige pgTAP-Abnahme dieses neuen Stands steht noch aus. Nicht als behoben behaupten, bevor Actions grün ist.
Next.js/eslint-config-next auf 16.3.8, Sharp per Override auf 0.35.5. Lokaler Produktionsabhängigkeitsaudit bestanden: keine bekannten Schwachstellen. Anlass waren zwei neue hohe CI-Audit-Befunde.
Aktuelle Anwendungsprüfungen laufen; Ergebnisse/Git-HEAD in der Git-Quittung und dem Abschlussbericht außerhalb des Repos. Historische grüne 1677 Tests/Build/Performance gelten nicht automatisch für die Paketupdates.

NÄCHSTER FREIGABEMEILENSTEIN: verkaufsfähiger Kern (Werbelandingpage -> Registrierung mit Projekttext -> Karten-Trial -> Recruiting -> Zahlung/Kündigung). Zusatzreports/Komfortfunktionen zurückstellen. Keine belastbare Restzeit vorhanden, weil reale Stripe-/Browser-Abnahme noch fehlt.
1. Neue Database- und Application-Actions vollständig auswerten, übrige Fehler korrigieren. Neue SQL-Kompatibilität auch auf Legacy-Guthaben/Reservierungen prüfen.
2. Serverseitige Tarif-/Trial-/Team-/CV-Rechte und Profilfreigabe vollständig abnehmen.
3. Stripe-Sandbox/TestClocks und isolierte Supabase-Testumgebung: alle 12 Original-Szenarien, Auth-/Checkout-Draft-Erhalt, Mobil/Tastatur. Keine echten Abbuchungen.
4. Kontakt-Retry/private Anzeige im UI, Outbox-/SMTP-Fehlerfälle vervollständigen.
5. Vor Freigabe: Sieben-Tage-Erinnerung, Reconciliation, Steuer-/Portal-Konfiguration, SaaS-Bedingungen. Analytics-Kampagnenreport/Retention bleibt offen.
Erst nach bestandener Abnahme Produktion migrieren, main mergen, Netlify veröffentlichen und live verifizieren. Draft-PR #102 bleibt offen.
Kontingent: bei letzter Abfrage 28 Prozent Rest im Fünf-Stunden-Fenster; Sicherung eingeleitet. Weiterhin spätestens 25 Prozent sichern/pushen/berichten.

HISTORISCHER STAND — untenstehende Zahlen und offene Punkte können überholt sein
AKTUELLER STAND 08.10.2026 — maßgeblich vor den älteren Abschnitten unten

Anwendung lokal geprüft: 1677 Tests bestanden, 0 fehlgeschlagen, 187 Dateien. Acht neue Rechte-/Team-Mutationsprüfungen enthalten. Lint und Typprüfung bestanden. Produktionsbuild bestanden. Sämtliche Performance-Budgets bestanden: JavaScript470867/520000 Byte gzip, größter Chunk72996/120000, CSS57431/57500.

GitHub-Verbindung funktioniert. Zwischenstände189b9fc undcccb1c5 erfolgreich gepusht; die Git-Quittung nennt den neuesten HEAD. Commit9b91559 aus dem anderen Konto war hier nicht auffindbar. Entsprechende Änderungen wurden aus dem überprüfbaren Checkout rekonstruiert. Keine Produktion ausgerollt.

OFFEN FÜR DIE FERTIGSTELLUNG
P0: Vollständige Supabase-Datenbanktests reparieren und erneut über GitHub Actions prüfen. Der frühere Lauf spielte die Migrationen erfolgreich ein, scheiterte aber an39 Assertions in ai_credit_period.test.sql, ai_credits.test.sql, stripe_subscription_lifecycle.test.sql plus fehlenden FK-Indizes. Erwartungen an neue Gast-/Registrierungsboni sind veraltet; Perioden-/Legacy-/Reservierungsverhalten auf echte Fehler prüfen, nicht pauschal Erwartungen ersetzen. Zwei belegte fehlende Indizes wurden in20261008104126_recruiting_foreign_key_indexes.sql ergänzt; deren CI-Ergebnis noch abwarten.
P0: Die vollständige serverseitige Tarif-/Trial-/Team-/CV-Berechtigung und Profilfreigabe abnehmen; neuer Team-POST-Schutz und zentraler alter Helper sind implementiert und getestet.
P1: Stripe-Sandbox/TestClocks, echte Supabase-Testumgebung, alle12 ursprünglichen End-to-End-Szenarien, Auth-/Checkout-Draft-Erhalt, mobile/Tastatur-Tests. Keine echte Abbuchung als Test.
P1: Kontakt-Retry und private Kontaktanzeige im UI vollständig anschließen, Outbox-/SMTP-Fehlerfälle abnehmen.
P2: Sieben-Tage-Erinnerung, automatische Reconciliation, Steuer-/Portal-Konfiguration, Analytics-Kampagnenzuordnung/Report/Retention, rechtliche Freigabe der neuen SaaS-Bedingungen. Erst nach Abnahme Produktionsmigration, Main-Merge, Netlify-Release und Live-Verifikation.

Die 25-Prozent-Grenze gilt weiterhin für das zuerst erschöpfte Kontingentfenster. Frühzeitig sichern.

ÄLTERER DETAILABGLEICH MIT DEM ORIGINALPLAN — Zahlen/Prüfstände unten sind historisch

XPORTAL - Abschluss des Arbeitsabschnitts und Übergabe, 07.10.2026

VERDIKT
Der implementierte Zwischenstand ist übergabefähig, die vollständige Recruiting-SaaS ist noch NICHT abgenommen oder produktionsreif. Die Weiterentwicklung wurde an der neu gesetzten Kontingentgrenze beendet: 25 Prozent Rest. Bei ihrer ersten Abfrage nach der Änderung waren bereits nur 19 Prozent im Fünf-Stunden-Fenster verfügbar. Danach nur laufende Änderungen geprüft und gesichert. Keine Produktionsmigration, kein Main-Merge, kein Live-Deployment, keine reale Testabbuchung und kein externer E-Mail-Test wurden ausgeführt.

REPOSITORY UND FORTSETZUNG
Repository: https://github.com/Wolfoeden/app.x-portal
Branch: codex/recruiting-saas-20261007
Ausgangspunkt: origin/main d0ebb0b815a0a3c548b8f83be57596c5380c877b
Erster gesicherter/push-verifizierter Abschnitt: 545f426
Arbeitsverzeichnis: C:\Users\roman\Documents\Codex\2026-10-07\bei-10-kontingent-schlie-e-die\work\xportal
Den aktuellen Remote-HEAD nennt die separate Git-Quittung. Nicht in alten, schmutzigen XPORTAL-Checkouts weiterarbeiten. Keine fremden uncommitteten Änderungen wurden übernommen.

LETZTER GESICHERTER ABSCHNITT
Aktuelle Prüfung unter Node 24.19.0: 1613 Tests bestanden, 56 fehlgeschlagen in 186 Dateien. Lint ohne Fehler/Warnungen, Typprüfung und Produktionsbuild bestanden. Performance: JavaScript gzip 539050 / 520000 Bytes; übrige Budgets bestanden. Keine neue Browser-, SQL-, Stripe- oder Live-Abnahme.
Geändert: Profilseite verwendet profilspezifische Freigabe plus zentrale Trial-/Tarifrechte; Link-Fallback und Profil-CTA führen in den selbstständigen Arbeitsbereich mit Profilkontext; dortige alte Provisionshinweise entfernt. Abrechnungs-Initialabruf ist abbrechbar und schreibt nach Unmount keine Zustände. React-Memo-Abhängigkeit und ungenutzte Imports/FAQ-Argument bereinigt. FAQ-Anker ergänzt. Betroffene Link-/Profil-/Auth-Vertragstests aktualisiert. Übrige fehlgeschlagene Tests ausdrücklich nicht abgeschaltet oder pauschal abgeschwächt.
Priorität im nächsten Modell: 56 Fehler einzeln fachlich triagieren; verbliebene aktive Alttexte und vollständige Berechtigungen prüfen; Bundle reduzieren; dann vollständige Supabase-/Stripe-/Browser-Abnahme wie unten beschrieben.
Neue Kontingentregel: spätestens bei25 Prozent Rest stoppen und Commit/Push/Prüfbericht/Übergabe sichern; ab30-35 Prozent Reserve vorbereiten. Kontoübergreifend geteilt, anderer Chat verschafft keine eigene Quote.

ABGLEICH MIT DEINEM PLAN
1. Produktentscheidung - umgesetzt als Software-Abo in neuen Hauptwegen. Recruiting-Positionierung, keine neue Provision im neuen Kontakt-/Beauftragungsmodell. Offen: vollständiger Audit sämtlicher aktiver Nebenwege und alter manueller Vermittlungshinweise.

2. Bestandsaufnahme/Arbeitsweise - aktueller main geprüft; isolierter Branch; Next.js 16.3.6, React 19.2.8, TypeScript 5.9.3 und Supabase-Pakete aus dem Lockfile. Stripe bleibt serverseitiger REST-Adapter mit fixierter API-Version. Relevante Anweisungen/Docs gelesen. Offen: vollständige Live-Konfigurationsinventur Stripe/Supabase/Netlify und vollständiger Datenbank-Migrationslauf.

3. Vermittlungsgebühren entfernen - neue Vorgänge tragen unveränderlich no_fee, historische Vorgänge legacy_placement. Gebühren-/Rechnungsschutz und historische Übernahme in Migrationen implementiert und isoliert geprüft. Neue Kontaktfreigabe läuft über Freelancer, nicht Roman. Offen: sämtliche aktiven UI-, E-Mail-, Admin-, CV-/Kalender- und Hintergrundpfade auditieren; verbliebene Vermittlungs-/Vorstellungstexte bereinigen, historische Texte konditional bewahren; neue SaaS-Bedingungen rechtlich freigeben.

4. Trial - 14 Tage, einmalig90 Credits, Karte, bestätigte E-Mail, persistente Checkout-/Trial-Claims, keine neuen Gast-/Registrierungsboni und Bestandsbalance implementiert. Texte überstehen Registrierung/Checkout über tab-lokalen Speicher; Rohtext nicht in URLs oder Stripe-Metadaten. Offen: echter Browser+Stripe-Test inklusive Abbruch, E-Mail-Bestätigung, Reload/Tabwechsel, erneuter Trial-Versuche und Bestandskonten; Funktionen aller gewählten Tarife auch im Trial serverseitig vollständig anschließen.

5. Stripe - serverseitige Sessions, erlaubte Price-IDs, Karte verpflichtend, verifizierte kanonische Subscription/Invoice, Signatur/Replay/0-EUR-Schutz, Perioden-Grants und Reconcile-Endpunkt implementiert. Offen: tatsächliche Testprodukt-/Preis-/Webhook-/Portal-Zuordnung, VAT-/Steuerprüfung, sämtliche realen Sandbox-/Test-Clock-Szenarien; automatischer Wiederabgleich für inaktive Konten statt nur nutzergetriggertem Reconcile; Zeitüberschreitungen/Parallelität unter realen Bedingungen.

6. Kündigung/Erinnerungen/Zugang - Kontooberfläche, Portal und Kündigungs-Endpunkt mit Stripe-Enddatum und festgehaltener Kündigung implementiert; getrennte bezahlte/trial Rechte. Offen: Stripe-Erinnerung tatsächlich7 Tage vorher einstellen und Versand/Dedup prüfen; Kündigung vor Trial-Ende, Portal-Reaktivierung, SCA/Zahlungsfehler/Nachzahlung real testen; zuverlässige Benachrichtigung und Retry. Öffentliche Profilseite auf denselben zentralen Trial-/Tarif- und Profilfreigabe-Check wie die Kalenderroute umgestellt. Vollständiger Audit von CV-/Link-/Team-Rechten und alten Helpern bleibt offen. Lesbarkeit alter Projekte/Abrechnung nach Ablauf durchgängig prüfen.

7. Website - Landingpage, Preise9/19/50 EUR netto, primärer14-Tage-CTA, Karte90 Credits/Verlängerung, gekennzeichnetes fiktives Ergebnisbeispiel, Kontooberfläche, Kontaktfreigabe und eingeschränkte /agent-Weiterleitung implementiert. Lokale Screenshots erstellt. Offen: vollständige mobile/tastatur-/Screenreader-/Fehlerzustands-Abnahme, verbliebene alte Ergebnis-/Profil-/Nebenwegtexte und SEO/Schema-Regressionsprüfungen. Screenshots sind lokale Darstellung und Fixtures, keine Live- oder Zahlungsevidenz.

8. Recruiting-Prozess - vorhandene Mandate/Chats/Merkliste verwendet, Anforderungen/Belege/offene Punkte und gezielte freigegebene Kontakte integriert. Private Kontaktansicht, freelancerbestimmte Freigabe und explizite Zustellungswiederholung im Backend. Offen: UI für wiederholte Zustellung und bestätigte Kontakt-E-Mail vervollständigen; vollständige API-/SMTP-/Outbox-Integration, Wiederholungs-/Absturzfälle und berechtigte CV/Export/Team-Wege prüfen. Kein unbeaufsichtigter automatischer Retry/Sweep konfiguriert. Versand ist physisch mindestens-einmal, nicht garantiert exakt-einmal.

9. Matchingfehler - generelle Trennung von Bedienanweisungen und Kandidatenanforderungen, bewahrte echte Muss-/Ausschlusskriterien und unbekannte Nachweise; Recherche-/Kontaktverbote serverseitig durchgesetzt; Regressionstests vorhanden. Offen: Live-Abnahme mit echten unvollständigen Profilen und dem ursprünglichen Fehlersatz sowie weiteren Formulierungen. Lokale Regressionen ersetzen keine live bestätigte Passung.

10. Ereignismessung - neue erlaubte Ereignisse, consent-gated Browser/API, separate serverbestätigte Zahlung/Trial-Ereignisse, DB-Dedup, interne/Test-Markierung, erste erfolgreiche Analyse und gespeicherte Auswahl angeschlossen. Einwilligung v3 fordert Zustimmung für den geänderten Messzweck neu an; keine sensiblen Inhalte als Parameter. Offen: vollständiger Funnel-Report/Admin-Auswertung, verlässliche Kampagnen-Verknüpfung über Registrierung und Stripe-Webhooks, server-/clientseitige Zählung konsistent auswerten, technische Fehler überall anschließen, Aufbewahrung/Export/Löschung der neuen Messdaten; Reddit-Konfiguration falls tatsächlich benötigt. Keine IDs erfunden. Analytics-SQL/RLS wurde noch nicht separat ausgeführt.

11. Abnahme - NOCH NICHT ERFÜLLT. Typprüfung und Produktionsbuild bestanden. Gesamttests: 1613 bestanden, 56 fehlgeschlagen in 186 Dateien. Lint ohne Fehler/Warnungen. Typprüfung und Produktionsbuild erneut unter Node 24.19.0 bestanden. Client-JavaScript-Budget weiter überschritten:539050/520000 Bytes. Fokussierte Agentenprüfung: Recruiting169 Unit-Tests und19 SQL-Assertions; Billing39 Unit-Tests und26 SQL-Assertions; Root17 Fokusprüfungen. Diese Zahlen sind getrennte, teilweise überlappende Läufe und dürfen nicht zu einem Gesamtwert addiert werden. SQL verwendet isolierte PGlite-Fixtures, kein vollständiges Supabase-Projekt. ALLE12 Abnahmepunkte des ursprünglichen Plans müssen end-to-end noch abgeschlossen werden; insbesondere reale Stripe-Sandbox/TestClocks, Kontaktzustellung und mobile/auth/Checkout-Fehlerfälle.

12. Lieferung - Implementierung,4 additive Migrationen, Fachdocs, Umgebungsvariablen ohne neue Secrets, lokale Screenshots, Prüfbericht, Rückweghinweise und Übergabeprompt liegen vor. Offen: grüne Freigabe-Gates, tatsächliche Stripe-/Supabase-Konfiguration, rechtliche Freigabe, autorisierte Produktionsmigration und Deployment plus Live-Prüfung. Push allein bedeutet keinen Live-Release.

PRIORITÄTEN FÜR DEN NÄCHSTEN AGENTEN
P0:56 fehlgeschlagene Tests einzeln gegen den neuen Vertrag bewerten. Veraltete Expectations sinnvoll aktualisieren, echte Fehler beheben. Keine Sicherheitsprüfungen löschen, um grün zu werden.
P0: JavaScript-Budget beheben. Die bisherigen Lintfehler und Warnungen sind beseitigt.
P0: Trial-Berechtigung über sämtliche serverseitigen CV/Link/Kalender/Team-/KI-Wege vereinheitlichen und schützen.
P1: Isoliertes Supabase-Staging mit vollständiger Migrationskette, RLS/Advisors, Konkurrenztests und Bestandsdaten-Snapshot.
P1: Isoliertes Stripe-Testkonto konfigurieren; die12 geforderten Abnahmeszenarien mit Browser/TestClocks dokumentiert durchführen. Keine echten Abbuchungen.
P1: Kontaktfreigabe/Retry/private Kontaktanzeige und Auth/Checkout/Draft-Erhalt vollständig end-to-end prüfen.
P2: Automatische Reconciliation,7-Tage-Erinnerung, zuverlässige Zustellungsbehandlung, Steuer-/Portal-Konfiguration, Analytics-Zuordnung/Report/Retention.
P2: Rechtliche Freigabe; dann konkrete autorisierte Migration/Release und live verifizieren.

TESTBEFEHLE
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm exec vitest run
pnpm build
pnpm check:performance
node scripts/check-recruiting-schema.mjs (PGLITE_MODULE_PATH gemäß docs/recruiting-workflow.md)
node scripts/check-billing-schema.mjs (externer gepinnter Verifier gemäß docs/recruiting-billing.md)
node scripts/capture-recruiting-preview.mjs <Ausgabeverzeichnis> (lokaler dev-Server3107)

FACHDOKUMENTATION
docs/recruiting-billing.md, docs/recruiting-workflow.md, docs/recruiting-ui.md und docs/recruiting-measurement.md. Einzelne frühe Checkpoint-Notizen darin sind historisch; dieser Bericht und die finalen Prüfprotokolle bestimmen den Abschlussstatus. Ältere lokale Node-Laufzeit erzeugte Deprecation-Warnungen; Verifikation mit der geforderten Node22+-Laufzeit nachholen.

RÜCKWEG
Noch keine Produktionsänderung erfolgt: Branch ungemergt lassen. Vor Migration Bestandssnapshot anlegen. Nach späterer Migration Identitäts-/Grant-Ledger und unveränderliche kommerzielle Tags behalten, neue Checkouts sperren und laufende Trial-/Abo-Konten zuerst mit Stripe abgleichen. Nicht pauschal Migrationen rückwärts ausführen oder alte Gebühren für neue Vorgänge wieder aktivieren.

MODELLEMPFEHLUNG (JUDGMENT)
Für die anspruchsvolle Endabnahme mit Abrechnung, Konkurrenz, Bestandsverträgen und Zugriffsrechten: GPT-6 Astra, Reasoning xhigh. Für eng abgegrenzte Implementierungs-/Testkorrekturen ist GPT-6.1 Sol mit high eine ressourcenschonende Alternative. Empfehlung auf Basis des Restauftrags und offizieller Modellbeschreibungen, keine Garantie eines bestandenen Releases.
https://developers.openai.com/api/docs/models/gpt-6-astra
https://developers.openai.com/api/docs/models/gpt-6.1-sol

AKTUALISIERUNG 08.10.2026
Commit 189b9fc wurde tatsächlich nach GitHub gepusht und verifiziert. Der im anderen Konto erwähnte Commit 9b91559 ist hier nicht vorhanden; dessen berichtete Korrekturen wurden im verfügbaren Checkout nachvollzogen.
Aktuelle Gesamttests: 1657 bestanden / 12 fehlgeschlagen. Neue Änderungen: alter paid-access-Helper auf zentrale Recruiting-Rechte delegiert, Team-Einladung an aktive Berechtigung gebunden, große Matching-Importkante aus Browseranzeige entfernt, falsche Verfügbarkeitsbestätigung durch Betreiber entfernt, Preisseiten-Navigation/Datenwege ergänzt, alte Gebühren-/Bonus-/Kontakt-Testannahmen fachlich angepasst.
GitHub-Datenbankprüfung der vorherigen Revision läuft mit vollständiger Migrationskette, scheitert aber an alten Credit-/Perioden-/Lifecycle-Erwartungen und query_plan_evidence.sql. Diese Datenbankfehler sind noch offen. Keine Produktionsmigration und kein Main-Merge.
Noch fehlgeschlagene Anwendungstests:
api/project-detail-recovery-route.test.ts: project detail deterministic recovery restores a persisted partial match with the current booking link
presentation/availability.test.ts: availability with its date says XPORTAL confirms an old statement before the introduction when it introduces
presentation/chat-cv-ui.test.ts: Kurzlinks auf der Profilkarte nennt unter der Zeile, was ein Abo bei diesem Profil öffnet
presentation/chat-cv-ui.test.ts: Kurzlinks auf der Profilkarte öffnet ohne Vermittlungsmodell, wie bisher Kalender und Lebenslauf, mit Konto
presentation/chat-cv-ui.test.ts: booking button in the placement model asks for an introduction instead of opening a calendar, with or without an account
presentation/chat.test.ts: chat presentation shows provenance and the direct booking link
presentation/chat.test.ts: chat presentation keeps a partial match bookable while labelling it as not recommended
presentation/core-journey-proof.test.ts: Paket 2: gemeinsamer Beweisfaden verweist aus der Kontoverwaltung auf die einzige Preisseite
presentation/package-4-release.test.ts: Paket 4: Konsolidierung und Freigabe haelt den Zahlungsdialog frei von einer zweiten Preisliste
presentation/payment-links.test.ts: enterprise contact routes the single enterprise offer through the configured address
presentation/privacy-config.test.ts: production privacy and authentication configuration names processors by role, never by company
presentation/profile-conversion.test.ts: profile card first reading level puts the meeting before Merken, as it is read and tabbed
