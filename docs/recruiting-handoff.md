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
