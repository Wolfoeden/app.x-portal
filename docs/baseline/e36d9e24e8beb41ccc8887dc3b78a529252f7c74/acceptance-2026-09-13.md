# XPORTAL Abnahme · Paket 0 und 1 · 13. September 2026

Basis: `e36d9e24e8beb41ccc8887dc3b78a529252f7c74` (`origin/main`)

## Automatische Abnahme

| Gate | Ergebnis |
|---|---|
| `pnpm lint` | bestanden |
| `pnpm typecheck` | bestanden |
| `pnpm test` | 113 Dateien, 1.070 Tests bestanden |
| `pnpm build` | Production-Build bestanden; alle App-Routen erzeugt |
| `pnpm test:journeys` | 11 Rollen-, Produktwahrheits- und Accessibility-Journeys bestanden |

Die 1.066 Tests der Basis bleiben vollständig enthalten. Vier neue Tests sichern
Enterprise-Vertrag, AGB-Sperre sowie Cardano-/Whitelist-SEO ab.

## Visuelle und manuelle Abnahme

- 24 Baseline-Screenshots decken acht repräsentative Seiten/Zustände bei 390,
  768 und 1280 px ab.
- Die neue Oberfläche wurde lokal bei 390 und 1280 px auf
  `/freelancer-finden`, `/terms`, `/freelancer/apply?preview=1`, `/agent` und
  `/cardano` geprüft. Ein dabei entdeckter Legal-CTA-Kontrastfehler wurde
  korrigiert und erneut visuell geprüft.
- Der 390-px-Reflow dient zugleich als konservativer Ersatz für eine
  200-Prozent-Zoom-Abnahme auf einem 780-px-Ausgangsviewport. Fünf zentrale
  Routen haben dabei genau eine sichtbare H1 und keinen horizontalen
  Dokumentüberlauf.
- Das mobile Projektmenü ist geschlossen `inert`, fokussiert nach dem Öffnen
  den Schließen-Knopf, reagiert auf Escape und gibt den Fokus an den
  Menüknopf zurück. Dies wird in Chromium automatisch ausgeführt.
- Konto und Enterprise zeigen denselben Vertrag: 50 Euro netto pro Monat,
  3.000 Credits und keine nachträgliche verbrauchsabhängige Berechnung. Solange
  die AGB nicht rechtlich freigegeben sind, besitzt die Buchungsaktion kein
  `href` und kann keinen Stripe-Abschluss starten.
- Sichere Buchungsziele und der Verzicht auf automatische Weiterleitung bleiben
  durch `tests/security/booking-hosts.test.ts` geschützt. Ein realer externer
  Buchungslink wird erst im Release-Smoke mit einem freigegebenen Datensatz
  angeklickt.

## Externe Freigabegrenze

Die AGB bilden den aktuellen Produktstand ab, sind aber weiterhin ein Entwurf.
Eine anwaltliche Freigabe und der anschließende Wechsel von `TERMS_STATUS` auf
`approved` sind Voraussetzungen für den Self-Service-Vertragsabschluss. Diese
externe Prüfung ist kein durch Code ersetzbarer Abnahmepunkt.

Produktionssysteme, Stripe, echte Supabase-Daten und externe Buchungsziele
wurden in dieser lokalen, fixture-basierten Abnahme nicht verändert.
