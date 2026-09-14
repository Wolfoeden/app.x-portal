# XPORTAL Abnahme · Paket 2 · 14. September 2026

Basis: `e36d9e24e8beb41ccc8887dc3b78a529252f7c74` (`origin/main`)

## Ergebnis

Paket 2 wurde mit Paket 3 auf `main` veröffentlicht. Marketing, Chat,
Ergebnisse, Freelancer-Onboarding und Agentenkatalog erzählen denselben
prüfbaren Produktablauf. Paket 4 konsolidiert anschließend den Chat-Einstieg
und den Kontodialog; die Funktionsverträge bleiben durch das vollständige
Regressionstor geschützt.

## Gemeinsamer Beweisfaden

| Schritt | Verantwortlich | Aussage |
|---|---|---|
| Anforderung beziehungsweise Profil | Nutzer | Projektkontext oder Profildaten werden eingegeben |
| Struktur | KI beziehungsweise XPORTAL-Basis | KI strukturiert freien Projekttext; ein technischer Fallback wird ausdrücklich nur als Basis bezeichnet |
| Match | feste Regeln | Muss-Kriterien, Profilbelege und offene Lücken bestimmen das Ergebnis; der Score ist kein KI-Urteil |
| Entscheidung | Nutzer beziehungsweise Kunde | Speichern, externe Recherche, Kontakt und Buchung benötigen eine bewusste Aktion |

Der Ablauf wird über `components/product/MatchProtocol.tsx` auf Marketing,
Chat, Ergebnisansicht und Freelancer-Portal wiederverwendet. Die
Aufgabenvorlagen unter `/agent` zeigen analog Ausgangspunkt, Ergebnis und
Ausführungsgrenze.

## Produkt- und Preiswahrheit

| Frage | Veröffentlichtes Modell |
|---|---|
| Was tut XPORTAL? | Projektanforderungen strukturieren, interne Profile regelbasiert vergleichen und Belege sowie Lücken sichtbar machen |
| Was macht die KI? | Freien Projekttext strukturieren und ausgewählte Aufgabenvorlagen vorbereiten |
| Was bleibt regelbasiert? | Matching und Score aus Muss-Kriterien, Profilfeldern und dokumentierten Nachweisen |
| Wer löst Aktionen aus? | Der Nutzer; keine automatische Recherche, Kontaktaufnahme oder Buchung |
| Gast | 100 Credits pro Monat |
| Konto | 300 Credits pro Monat |
| Projektanalyse | 3 Credits |
| Externe Recherche | 30 Credits nach Bestätigung |
| Enterprise | 50 Euro netto pro Monat, 3.000 Credits, keine Verbrauchsnachberechnung |

Alle Zahlen werden aus `lib/ai/credit-policy.ts` bezogen. Die AGB-Fassung 1.0
wurde nach der vom Betreiber bestätigten anwaltlichen Prüfung zum
14. September 2026 freigegeben. Der bestehende Enterprise-Abschluss ist damit
aktiv; Preis, Unternehmereigenschaft und Zahlungslogik bleiben unverändert.

## Automatische Abnahme

| Gate | Ergebnis |
|---|---|
| `pnpm lint` | bestanden |
| `pnpm typecheck` | bestanden |
| `pnpm test` | 114 Dateien, 1.074 Tests bestanden |
| bestehendes Regressionstor | alle 1.066 Basistests erhalten |
| Paket-2-Beweisfaden | 4 neue Präsentationstests bestanden |
| `pnpm build` | Production-Build bestanden; 32 statische Seiten erzeugt und dynamische Routen kompiliert |
| `pnpm test:journeys` | 13 von 13 Rollen-, Produktwahrheits- und Accessibility-Journeys bestanden |

Die Journey-Suite prüft zusätzlich zum bisherigen Rollenbestand die
30-Sekunden-Produktwahrheit auf Marketing, die konkrete Agentendarstellung,
den Ergebnis-Beweisfaden, die Aktionskosten und den gemeinsamen
Freelancer-Ablauf. Fünf repräsentative Seiten werden bei exakt 390 px
automatisiert auf horizontalen Überlauf geprüft.

## Visuelle und manuelle Abnahme

- `/freelancer-finden`, der Gast-Chat, ein Match-Ergebnis, der Preisdialog,
  `/freelancer/apply?preview=1` und `/agent` wurden im lokalen Browser in
  breitem, mittlerem und schmalem Layout geprüft.
- Marketing zeigt im ersten sichtbaren Bereich Nutzen, Zuständigkeiten,
  Startguthaben, Preis der Projektanalyse und den nächsten Schritt.
- Ergebnisansicht und Karten trennen Profilbelege von vor dem Kontakt offenen
  Punkten; der leere Chat-Einstieg bleibt bewusst kompakt.
- Der Kontodialog zeigt Guthaben und genau eine bezahlte Enterprise-Stufe ohne
  zusätzliche Verbrauchserklärung.
- Das Freelancer-Onboarding nutzt denselben Markenrahmen und macht den Status
  im Beweisfaden sichtbar.
- Der Agentenkatalog beschreibt konkrete Aufgaben, Ergebnisse und Grenzen vor
  dem Anmeldehinweis.

Die Prüfung deckte zwei Fehler auf, die vor Abnahme korrigiert und erneut
geprüft wurden: `/agent` erhält ohne lokale Supabase-Konfiguration nun eine
read-only Vorschau statt eines Absturzes; außerdem verdrängt das Gast-Gate den
Produktbeweis nicht mehr. Ein mobiler Doppelkontext im Freelancer-Header und
ein zu schwacher Textkontrast wurden ebenfalls korrigiert.

## Fortgeführte Release-Grenzen

Die rechtliche Freigabe wurde am 14. September 2026 in der zentralen Policy
dokumentiert. Stripe-Webhook, Checkout und Produktionszustand bleiben
eigenständige technische Release-Gates und werden in Paket 4 erneut geprüft.
