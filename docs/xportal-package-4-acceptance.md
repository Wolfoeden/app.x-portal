# XPORTAL Abnahme · Paket 4 · 14. September 2026

Basis: `ea00b57c0767382bf5b0b2166d88ef8f447782af` (`origin/main` vor Paket 4)

## Ergebnis

Paket 4 konsolidiert den veröffentlichten Produktstand, ohne fachliche
Funktionen zu entfernen. `ChatWorkspace` delegiert klar abgegrenztes Verhalten
an drei Module; der leere Einstieg, die Projektliste und der Kontodialog wurden
gezielt von erklärendem Ballast befreit.

## Konsolidierung

- `components/chat/sidebar-chat-list.tsx` kapselt Ladezustand und flache
  Projektliste. Datum und Workflow-Kategorien werden nicht mehr angezeigt.
- `components/chat/welcome.tsx` kapselt Einstieg und Aufgabenvorschläge. Der
  leere Chat zeigt weder Prozessdiagramm noch Credit-Werbetext.
- `components/chat/usage-presentation.ts` kapselt alle abgeleiteten
  Guthaben-/Fortschrittstexte.
- Die grafische Bildmarke wurde aus den oberen Einstiegen von öffentlichem
  Header und Chat-Sidebar entfernt; die zugängliche XPORTAL-Wortmarke bleibt.

## Zahlung und AGB

Der Kontodialog zeigt nur Guthaben, Enterprise-Plan, erforderliche Bestätigung
der Unternehmereigenschaft und die Buchungsaktion. Preis, Credits,
Stripe-Ziel, Checkbox-Validierung und Webhook-Verarbeitung bleiben funktional
unverändert.

Die AGB-Fassung 1.0 ist gemäß der Betreiberbestätigung anwaltlich geprüft und
seit dem 14. September 2026 freigegeben. `TERMS_STATUS = "approved"` aktiviert
den bereits vorhandenen Bestellweg.

## Performance- und Assetbudget

| Budget | Grenze |
|---|---:|
| JavaScript, gzip gesamt | 480.000 Byte |
| größtes JavaScript-Asset, gzip | 120.000 Byte |
| CSS, gzip gesamt | 48.000 Byte |
| größtes CSS-Asset, gzip | 22.000 Byte |
| öffentliche Assets, roh gesamt | 250.000 Byte |
| größtes öffentliches Asset, roh | 150.000 Byte |

`pnpm check:performance` misst nach jedem Produktions-Build die erzeugten
Assets und bricht bei einer Überschreitung mit dem betroffenen Budget ab.

## CSS- und Routenbeleg

Entfernt wurden ausschließlich Regeln, deren zugehörige UI in Paket 4 entfernt
wurde: Bildmarkenabstände, Sidebar-Gruppen/Metadaten, Startprotokoll und
Verbrauchserklärung. Die Routen- und Rollenmatrix, Journey-Tests, neue visuelle
Release-Screenshots und der Produktions-Build belegen die erhaltenen Flächen.
Agent Grid bleibt aus Navigation, Sitemap und Route-Manifest entfernt.

## Finale Abnahme

| Gate | Soll |
|---|---|
| `pnpm audit --prod --audit-level=high` | keine bekannte hohe/kritische Produktionslücke |
| `pnpm check` | Lint, Typecheck, 1.057 Tests, Build und Performancebudget grün |
| `pnpm test:journeys` | 17 Rollen- und Accessibility-Journeys grün |
| `pnpm test:visual-release` | 15 Referenzbilder bei 390, 768 und 1280 px grün |
| Produktions-Smokes | Root, Chat, AGB, API-Gesundheit und entfernte Altprodukt-Routen geprüft |

Die 24 Aufnahmen der eingefrorenen Baseline werden nicht überschrieben. Die
15 Paket-4-Aufnahmen bilden ein separates, fortlaufendes Release-Gate.
