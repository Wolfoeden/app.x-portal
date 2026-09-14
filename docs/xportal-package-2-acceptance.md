# XPORTAL Abnahme · Paket 2 · 14. September 2026

Basis: `e36d9e24e8beb41ccc8887dc3b78a529252f7c74` (`origin/main`)

## Ergebnis

Paket 2 ist im lokalen Arbeitsstand umgesetzt. Marketing, Chat, Ergebnisse,
Kontodialog, Freelancer-Onboarding und Agentenkatalog erzählen denselben
prüfbaren Produktablauf. Bestehende Funktionen bleiben durch das vollständige
Regressionstor geschützt. Es wurde nichts gepusht oder deployt.

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

Alle Zahlen werden aus `lib/ai/credit-policy.ts` bezogen. Der
Enterprise-Abschluss bleibt gesperrt, solange
`lib/legal/policy.ts` den AGB-Status `draft` ausweist.

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
- Chat-Composer und Ergebnisansicht setzen den Beweisfaden fort; Karten
  trennen Profilbelege von vor dem Kontakt offenen Punkten.
- Der Kontodialog zeigt zuerst den Ist-Zustand, dann konkrete Aktionskosten und
  erst danach eine einzelne bezahlte Enterprise-Stufe.
- Das Freelancer-Onboarding nutzt denselben Markenrahmen und macht den Status
  im Beweisfaden sichtbar.
- Der Agentenkatalog beschreibt konkrete Aufgaben, Ergebnisse und Grenzen vor
  dem Anmeldehinweis.

Die Prüfung deckte zwei Fehler auf, die vor Abnahme korrigiert und erneut
geprüft wurden: `/agent` erhält ohne lokale Supabase-Konfiguration nun eine
read-only Vorschau statt eines Absturzes; außerdem verdrängt das Gast-Gate den
Produktbeweis nicht mehr. Ein mobiler Doppelkontext im Freelancer-Header und
ein zu schwacher Textkontrast wurden ebenfalls korrigiert.

## Verbleibende externe Freigabegrenze

Die AGB sind weiterhin ein ungeprüfter Entwurf. Deshalb bleibt der
Enterprise-Self-Service technisch deaktiviert. Eine anwaltliche Freigabe,
Stripe-Testabnahme, Produktions-Smoke und Deploy-Verifikation sind getrennte,
noch nicht autorisierte Release-Schritte; sie sind nicht Teil dieser lokalen
Abnahme.
