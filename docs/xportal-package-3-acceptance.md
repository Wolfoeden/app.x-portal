# XPORTAL Abnahme · Paket 3 · 14. September 2026

Basis: `e36d9e24e8beb41ccc8887dc3b78a529252f7c74` (`origin/main`)

## Ergebnis

Paket 3 ist im lokalen Arbeitsstand umgesetzt. Kontakt, Recht, Auth,
Fehlerzustände, Buchungs-Zwischenseite und Admin verwenden denselben
XPORTAL-Markenrahmen, dieselben Foundation-Tokens und eine gemeinsame
Informationslogik. Agent Grid ist vollständig aus dem Produkt entfernt. Es
wurde nichts gepusht oder deployt.

## Sekundärflächen

`PublicDocumentIntro` vereinheitlicht die bisher route-spezifischen Einstiege:
Eyebrow, H1, erklärender Text und ein sachlicher Kontextstempel bilden auf
Kontakt, Impressum, Datenschutz, AGB, Fehlerseiten, Auth-Abschluss und Buchung
dieselbe Hierarchie.

| Fläche | Sichtbarer Kontext |
|---|---|
| Kontakt | zugesagte Antwortzeit |
| Impressum | Anbieterform |
| Datenschutz | dokumentierter Datenfluss |
| AGB | rechtliche Freigabe weiterhin ausstehend |
| Auth-Abschluss | laufende Prüfung oder neuer Link erforderlich |
| Fehler/404 | Wiederherstellung beziehungsweise Routencode |
| Buchungs-Zwischenseite | externer Übergang erst nach bewusstem Klick |

Der Auth-Abschluss behält seine Sicherheitsreihenfolge: Zugangsdaten werden
zuerst aus der sichtbaren URL entfernt und erst danach wird die Sitzung
erstellt. Die alte Sonderkarte und ihre Workspace-CSS-Regeln wurden entfernt.

Die Seitenstruktur ist nun semantisch `Rahmen → Header → Main → Footer`. Die
Pflichtlinkgruppe ist kein verschachtelter zweiter Footer mehr. Dadurch besitzt
jede öffentliche Sekundärfläche genau ein Haupt- und ein Seitenfuß-Landmark.

## Admin

- Sechs echte Admin-Ansichten und die fixture-basierte Vorschau verwenden
  `AdminSurface` als einzigen Arbeitsrahmen.
- `AdminPageHeader`, `AdminMetricStrip`, `AdminSectionHeader` und
  `AdminDisclosure` bleiben die gemeinsamen Datenprimitiven.
- Die Navigation trägt dieselbe Bild- und Wortmarke wie die öffentliche Seite
  und bietet einen sichtbaren Rückweg zur App.
- Metriken bleiben auf breiten Ansichten kompakt; auf kleinen Ansichten werden
  sie zu Zweispaltenblöcken und Tabellen zu beschrifteten Arbeitskarten.
- Authentifizierung, Audit-Events, Datenabfragen und alle bestehenden Admin-
  Aktionen wurden nicht verändert.

## Agent Grid entfernt

Entfernt wurden:

- `/chat/agent-grid` und `/chat/preview/agent-grid`;
- `/api/agent-grid/analyze`;
- Workspace, BPMN-Canvas und Feature-CSS;
- sechs Module unter `lib/agent-grid`;
- die Abhängigkeit `bpmn-js`; insgesamt entfielen 20 Pakete aus dem Installationsbaum;
- sechs ausschließlich Agent Grid betreffende Testdateien mit 27 Tests;
- Navigation, Schutzmatrix- und SEO-Verweise.

Der Produktions-Build erzeugt weder die Seite noch die API. Ein alter
Seitenlink fällt deshalb auf die gebrandete 404-Seite; die entfernte API liefert
keinen Handler mehr.

## Testtor-Abgleich

Die ursprüngliche Baseline enthielt 1.066 Tests. Davon gehörten 27 ausschließlich
zum nun ausdrücklich entfernten Agent Grid. Das fachfremde Regressionstor ist
daher nachvollziehbar:

`1.066 Basistests − 27 entfernte Featuretests + 8 Tests aus Paket 1/2 + 5 Tests aus Paket 3 = 1.052 Tests`

Kein Test einer erhaltenen Funktion wurde entfernt. Die fünf neuen Paket-3-
Tests schützen den gemeinsamen Sekundärseitenkopf, die Auth-Reihenfolge, den
Admin-Rahmen und die vollständige Agent-Grid-Entfernung.

## Abnahme

| Gate | Ergebnis |
|---|---|
| `pnpm lint` | bestanden |
| `pnpm typecheck` | bestanden |
| `pnpm test` | 109 Dateien, 1.052 Tests bestanden |
| `pnpm build` | bestanden; keine Agent-Grid-Seite und keine Agent-Grid-API im Route-Manifest |
| `pnpm test:journeys` | 17 von 17 bestanden |
| exakter Mobile-Reflow | acht repräsentative Routen bei 390 px ohne horizontalen Dokumentüberlauf |
| visueller Browsercheck | Kontakt, AGB, Buchung und Admin in breitem, mittlerem und schmalem Layout geprüft |

## Verbleibende externe Freigabegrenze

Die AGB bleiben ein ungeprüfter Entwurf. Der Enterprise-Self-Service bleibt
deshalb deaktiviert. Rechtliche Freigabe, Stripe-Test, Push und Deployment sind
weiterhin getrennte, nicht ausgeführte Release-Schritte.
