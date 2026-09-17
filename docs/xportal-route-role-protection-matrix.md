# XPORTAL Route-, Rollen- und Funktionsschutzmatrix

Basis: `e36d9e24e8beb41ccc8887dc3b78a529252f7c74` · 12. September 2026

## Abnahmepunkte

| ID | Typ | Nachweis |
|---|---|---|
| A-REG | automatisch | `pnpm test`: bestehendes Regressionstor, Baseline 1.066 Tests |
| A-JOURNEY | automatisch | `pnpm test:journeys`: Gast, Konto, Enterprise, Freelancer und Admin mit lokalen Fixtures |
| A-VISUAL | automatisch | `pnpm test:visual-baseline`: 24 Vollseitenaufnahmen bei 390, 768 und 1280 px |
| A-SEO | automatisch | `tests/seo.test.ts`, `tests/marketing.test.ts`, `tests/product-truth.test.ts` |
| A-PROOF | automatisch | `tests/presentation/core-journey-proof.test.ts`: gemeinsamer Beweisfaden, Fallback-Wahrheit, Ergebnissprache und progressive Preisstufe |
| A-SURFACE | automatisch | `tests/presentation/package-3-surfaces.test.ts`: gemeinsamer Sekundärseitenkopf, Auth-Übergang, Admin-Rahmen und vollständige Agent-Grid-Entfernung |
| A-CONSOLIDATION | automatisch | `tests/presentation/package-4-release.test.ts`: extrahierte Chat-Verhalten, reduzierter Einstieg, flache Sidebar, fokussierter Kontodialog und freigegebene AGB |
| A-RELEASE-VISUAL | automatisch | `pnpm test:visual-release`: Gast, Marketing, AGB, Preisdialog und Admin bei 390, 768 und 1280 px |
| A-PERF | automatisch | `pnpm check:performance`: gzip-Budgets für JavaScript/CSS und Rohbudget für öffentliche Assets |
| A-A11Y | automatisch/manuell | Rollen-Journeys plus M-A11Y-FOKUS und M-A11Y-STRUKTUR |
| M-A11Y-FOKUS | manuell | Bei 390 px: Menü öffnen, Tab/Shift+Tab bleibt darin, Escape schließt, Fokus kehrt zum Menüknopf zurück; geschlossenes Menü erhält keinen Fokus |
| M-A11Y-STRUKTUR | manuell | Jede öffentliche Route hat genau eine sichtbare H1; Text ist mindestens 12 px; 200 % Zoom bleibt ohne Funktionsverlust bedienbar |
| M-COMMERCIAL | manuell | `/preise` und Konto → Tarife: Basic 9 €/500, Pro 19 €/1.250, Business 50 €/4.000; Enterprise Flex 0 € Grundgebühr und 2 Cent je abgerechnetem Credit; Stripe nur nach exakter externer Konfiguration |
| M-EXTERNAL | manuell | Externe Buchungslinks zeigen Ziel und senden erst nach bewusstem Klick weiter |
| M-30S | automatisch/manuell | Marketing-Einstieg nennt im ersten View Produkt, KI-Anteil, Regel-Match, Verantwortung, Startguthaben und nächsten Schritt; Browserprüfung bei breitem, mittlerem und schmalem Viewport |

## Rollen und Kern-Journeys

| Rolle | Einstieg und geschützte Funktion | Autorisierung | Abnahme |
|---|---|---|---|
| Gast | `/chat`: Projekttext, strukturierter Brief, interner Match, transparente Lücken, 100 Credits | anonyme Sitzung; kein Speichern/Kontakt/Agentennutzen | A-JOURNEY, A-REG, A-VISUAL, A-PROOF, M-A11Y-FOKUS |
| Konto | `/chat`, `/mein-team`: Projekte, Merkliste, Kontostand | bestätigtes Konto; Besitzprüfung serverseitig | A-JOURNEY, A-REG, A-VISUAL |
| Monatspläne / Enterprise Flex | Konto → Guthaben oder laufender Verbrauch, Teamzuordnung zum Billing Owner, sichere Checkout-/Anfragewege | Konto + Unternehmereigenschaft; Stripe zusätzlich nur mit konfigurierter Payment-Link-ID | A-JOURNEY, A-REG, A-PROOF, M-COMMERCIAL |
| Freelancer | `/freelancer/apply`: Bewerbung, CV/Avatar, Status, Profilpflege, Metriken | Gast sieht Auth-Gate; eigenes Konto sieht nur eigenes Profil | A-JOURNEY, A-REG, A-VISUAL, A-PROOF |
| Admin | `/chat/admin/*`: Betrieb, Nachfrage, Leads, Bewerbungen und KI-Kosten | Admin-Claim; Fixture-Routen nur lokal | A-JOURNEY, A-REG, A-VISUAL, A-SURFACE |

## Seitenrouten

| Route/Familie | Rollen | Funktionsvertrag | Abnahme |
|---|---|---|---|
| `/` | alle | Einstieg erklärt das Produkt über `/freelancer-finden`; die Anwendung bleibt direkt unter `/chat` erreichbar | A-REG (`tests/marketing.test.ts`), A-PROOF, M-30S |
| `/chat` | Gast, Konto, Enterprise | kompakter Dialogeinstieg, Brief, regelbasierte Ergebnisse, Projektverwaltung und externe Recherche nur nach Bestätigung | A-REG, A-JOURNEY, A-VISUAL, A-PROOF, A-CONSOLIDATION, A-RELEASE-VISUAL |
| `/mein-team` | Konto, Enterprise | kontoübergreifende Merkliste mit sichtbarer H1 | A-REG, A-JOURNEY, M-A11Y-STRUKTUR |
| `/freelancer-finden`, `/it-freelancer-finden`, `/ki-freelancer-matching`, `/wie-funktioniert-xportal` | alle | servergerenderte Produktinformation, Match-Protokoll, aktuelle Preise, CTA zum kontextfreien Start | A-SEO, A-VISUAL, A-PROOF, M-30S |
| `/freelancer/apply` | Freelancer | Auth-Gate, Bewerbung, Prüfung, Dashboard und Aktualisierung ohne Datenverlust; derselbe Beweisfaden wie im Recruiting | A-REG, A-JOURNEY, A-VISUAL, A-PROOF |
| `/contact` | alle | Kontaktformular, Captcha, klare Erfolgs-/Fehlerzustände und gemeinsamer Kontextstempel | A-REG (`tests/api/contact-route.test.ts`), A-SURFACE, A-JOURNEY, M-A11Y-STRUKTUR |
| `/imprint`, `/privacy`, `/terms` | alle | Anbieter-, Datenschutz- und Vertragsstatus im gemeinsamen Markenrahmen und mit sichtbarem Dokumentstatus | A-SEO, A-REG, A-VISUAL, A-SURFACE, A-JOURNEY, M-COMMERCIAL |
| `/booking/[id]` | Konto | sichere Zwischenseite, sichtbares externes Ziel, Hostprüfung, kein automatisches Weiterleiten | A-REG (`tests/security/booking-hosts.test.ts`), A-SURFACE, A-JOURNEY, M-EXTERNAL |
| `/auth/complete`, `/auth/callback`, `/auth/confirm` | Gast, Konto | Anmeldung und Claim erhalten Projektkontext; Codes werden vor Sitzungsaufbau aus der sichtbaren URL entfernt | A-REG (`tests/auth/*`, `tests/chat/auth-continuation.test.ts`), A-SURFACE |
| `/unsubscribe` | Empfänger | Werbung erst nach POST abmelden; Transaktionsmails bleiben möglich | A-REG (`tests/email/unsubscribe.test.ts`) |
| `/chat/preview/*` | lokal | deterministische, nicht indexierte Abnahme ohne Produktion/OpenAI | A-JOURNEY, A-VISUAL |
| `/chat/admin/{users,demand,freelancers,leads,ai-usage}` | Admin | Auswertung und Betrieb mit serverseitiger Rollenprüfung | A-REG (`tests/admin/*`, `tests/ai/admin-usage.test.ts`), A-JOURNEY |
| `not-found`, `error`, `global-error` | alle | deutsche Wiederherstellung mit Supportkennung, nächstem Schritt und XPORTAL-Markenlogik | A-REG, A-SURFACE, A-JOURNEY, M-A11Y-STRUKTUR |

## API-Familien

| API-Familie | Funktion und Schutz | Abnahme |
|---|---|---|
| `/api/chat`, `/api/freelancer-search`, `/api/workspace/bootstrap` | Briefing, regelbasierter Match, explizite externe Recherche, Workspace-Zustand | A-REG: `tests/domain/*`, `tests/openai/*`, `tests/api/external-freelancer-search-route.test.ts`, `tests/data/workspace-bootstrap.test.ts` |
| `/api/projects*`, `/api/project-collections*`, `/api/saved-freelancers` | Besitzgebundene Projekte, Sammlungen und Merkliste | A-REG: Projekt-/Workspace-/Auth-Tests; A-JOURNEY |
| `/api/auth/{session,prepare-claim,claim,email-state}` | Gastkonto, Kontextübernahme, E-Mail-Zustand | A-REG: `tests/auth/*`, `tests/chat/auth-continuation.test.ts` |
| `/api/ai/credits`, `/api/team/members` | Plan-/Credit-Snapshot, freiwilliges Limit, Teamfreigabe | A-REG: `tests/ai/*`, `tests/data/plan-teams.test.ts`, `tests/presentation/team-invitation.test.ts` |
| `/api/stripe/webhook` | signierte, idempotente Enterprise-Aktivierung und Vertragsbestätigung | A-REG: `tests/api/stripe-webhook-route.test.ts`, `tests/security/stripe-signature.test.ts`, `tests/presentation/order-confirmation.test.ts` |
| `/api/freelancer-applications*`, `/api/freelancer/{profile,avatar*}`, `/api/freelancer-events` | eigene Bewerbung, CV/Avatar, Profilpflege und Metriken | A-REG: `tests/freelancer/*`, `tests/api/freelancer-cv-route.test.ts`, `tests/data/freelancer-cvs.test.ts` |
| `/api/freelancers/[id]/{book,cv}`, `/api/introductions` | geschützter CV, Buchungs- und Einführungsworkflow | A-REG: `tests/api/freelancer-cv-route.test.ts`, `tests/api/introductions-route.test.ts`, `tests/security/booking-hosts.test.ts` |
| `/api/contact`, `/api/unsubscribe` | Captcha/Rate-Limit und Abmeldung | A-REG: `tests/api/contact-route.test.ts`, `tests/api/captcha-gate.test.ts`, `tests/email/unsubscribe.test.ts` |
| `/api/admin/*` | Admin-Auswertung, Bewerbungen, Leads, Outreach, Automation | A-REG: `tests/admin/*`, `tests/leadgen/*`, `tests/api/ai-provider-route.test.ts` |
| `/api/leadgen/run` | signierter, limitierter Lauf mit Deduplizierung/Stopregeln | A-REG: `tests/api/leadgen-run-route.test.ts`, `tests/leadgen/*`, `tests/sourcing/*` |
| `/api/account/{export,delete}` | eigener Export und Löschung | A-REG: Auth-/Request-/RLS-Regressionstor; manuelle Kontoabnahme vor Release |
| `/api/health`, `/api/csp-report`, `/api/funnel-events` | Betriebsstatus, CSP-Berichte, minimierte Funnelereignisse | A-REG: `tests/health/route.test.ts`, `tests/security/csp.test.ts`, `tests/audit/write.test.ts` |

## Freigaberegel

Die Freigabe bleibt an `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:performance`, `pnpm test:journeys` und `pnpm test:visual-release` gebunden. Paket 2 ergänzt A-PROOF und M-30S. Paket 3 ergänzt A-SURFACE und entfernt auf ausdrücklichen Produktentscheid Agent Grid samt seinen 27 isolierten Tests; alle fachfremden Basistests bleiben Teil des Regressionstors. Paket 4 ergänzt A-CONSOLIDATION, A-RELEASE-VISUAL und A-PERF. Die eingefrorene Screenshot-Baseline wird nicht ersetzt. Eine Änderung ohne zugeordneten Abnahmepunkt erweitert zuerst diese Matrix.

Aktuelle Protokolle: `docs/baseline/e36d9e24e8beb41ccc8887dc3b78a529252f7c74/acceptance-2026-09-13.md`, `docs/xportal-package-2-acceptance.md`, `docs/xportal-package-3-acceptance.md` und `docs/xportal-package-4-acceptance.md`.
