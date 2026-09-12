# Marketing und SEO: Phase 1 und 2

Implementierungsstand: 12. September 2026. Basis: `a1bbe4fdea3e1fccb5d78344085679d199461e7e`.
Umfang: Phase 1 und 2; keine Änderung der Matching-, Auth-, Payment- oder Datenbanklogik.

## Bestandsaufnahme vor der Implementierung

- `app/page.tsx` leitet auf `/chat` um. `ChatWorkspace` enthält Gastzugang,
  Projektanalyse, Ergebnisdarstellung und kontextbezogene Registrierung.
- `lib/seo.ts` enthielt bereits die gemeinsame öffentliche URL-Liste für
  Sitemap und Robots. `/chat` war indexierbar, private Pfade waren gesperrt.
- Inter, die Marke, Design-Tokens und rechtliche Footer-Komponenten existierten.
- Marketingseiten, `llms.txt` und die hier ergänzten strukturierten Daten fehlten.
- `components/chat/funnel-events.ts` und `app/api/funnel-events/route.ts`
  unterstützen fünf Events, aber nur die Einstiegstypen `direct` und `recruiter`.

Gelesen wurden die im Briefing geforderten Einstiegsdateien, die relevante
Produktdokumentation und die installierte Dokumentation von Next.js **16.3.4**
unter `node_modules/next/dist/docs/`: Server/Client Components, Metadata,
Metadata-API, Robots, Sitemap, Route Handlers, JSON-LD und CSS Modules.

## Aussage und überprüfbare Grundlage

| Aussage | Geprüfte Implementierung | Grenze für die Texte |
| --- | --- | --- |
| KI strukturiert die Projektangaben. | `lib/openai/brief.ts`, `lib/domain/brief.ts` | Validierung und Quellenabgleich sind implementiert; keine Fehlerfreiheit versprechen. |
| Internes Matching ist regelbasiert. | `lib/domain/matching.ts` | Kein autonomer KI-Entscheider und keine Erfolgsprognose. |
| Match-Gründe und Lücken werden angezeigt. | `lib/presentation/chat.ts`, `components/chat/results.tsx` | Offen ist nicht automatisch unpassend; zwingende Kriterien werden je nach Feld behandelt. |
| Erfahrungsinformationen ergänzen den Abgleich. | `lib/data/freelancers.ts` (`contextEvidenceTags`), `lib/domain/matching.ts` | Erfasste Kontextinformationen können ergänzen; sie ersetzen keine Kernkompetenz. Keine umfassende semantische Auswertung sämtlicher Projekttexte behaupten. |
| Der Nutzer wählt ein Profil und weitere Schritte aus. | `components/ChatWorkspace.tsx`, Auth-Continuation | Keine automatische Beauftragung durch Suche oder Anmeldung. |
| Gastzugang und einheitliches Credit-Guthaben existieren. | `lib/ai/credit-policy.ts`, Chat-UI | Alle angezeigten Zahlen und Leistungsmengen werden aus der aktuellen Policy berechnet. |
| Genannte Skills existieren im Produktvokabular. | `lib/domain/skill-taxonomy.ts` | Taxonomie ist kein Nachweis aktueller Poolabdeckung oder Verfügbarkeit. |

Nicht als Claims verwendet: aktuelle Nutzer-/Profilzahlen, Match-Raten,
Kundenlogos, Testimonials, pauschale Verifikation, garantierte Verfügbarkeit,
Compliance-Prüfung oder Erkennung von Scheinselbständigkeit.
`docs/freelancer-pool-audit.md` ist eine historische Messung. Einige andere
Produktdokumente enthalten ältere Credit-Modelle; der aktuelle Code ist für diese
Implementierung maßgeblich. Es wurden keine produktiven Daten abgefragt.

## Umsetzung

- `MARKETING_PAGE` in `lib/seo.ts` hält URL, Titel, Beschreibung und
  Sitemap-Eigenschaften. Metadaten, interne Navigation, Sitemap und `llms.txt`
  verwenden diese Definitionen.
- Neue Server-Component-Routen:
  `/freelancer-finden`, `/it-freelancer-finden`,
  `/ki-freelancer-matching`, `/wie-funktioniert-xportal`.
- Gemeinsamer Rahmen mit bestehenden Brand-/Footer-Komponenten und Inter.
  CSS Modules verwenden die vorhandenen Farb-, Radius- und Typografie-Tokens.
  Keine Änderung an `app/globals.css`.
- Hauptinhalte, FAQ-Antworten und Preisübersicht werden serverseitig ausgegeben.
  Native `details`/`summary`, Sprunglinks und sichtbare Fokuszustände unterstützen
  Tastaturbedienung.
- `CreditSummary` liest `CREDIT_PRICES`, `CREDIT_PLANS` und
  `affordableCount`. Sie erklärt Leistungsmengen als bedingte Rechenbeispiele,
  nennt Umsatzsteuer bei kostenpflichtigen Plänen und trennt Freelancer-Honorare.
  Eine eigene `/preise`-Seite ist noch nicht Teil dieser Phase.
- `Organization` und `WebSite` werden im Root-Layout ausgegeben;
  `BreadcrumbList` entspricht der sichtbaren Navigation jeder Marketingseite.
  JSON-LD wird gegen schließende Script-Tags escaped.
  Kein `sameAs`, kein Rating und kein erfundener Autor.
- Die vier Seiten sind Produkt-/Landingpages. Deshalb kein `Article`- oder
  `FAQPage`-Markup. Bei späteren redaktionellen Artikeln sind reale Autoren,
  Quellen und gepflegte Veröffentlichungs-/Änderungsdaten zu ergänzen.
- Die Sitemap behält bestehende öffentliche Seiten. Ein Build-Datum wird nicht
  mehr als Inhaltsänderung ausgegeben.

## Crawler-Entscheidungen

Die bisherige Wildcard-Policy erlaubte öffentliche Inhalte auch für die
genannten KI-Systeme. Diese Freigabe bleibt erhalten und ist nun für
`OAI-SearchBot`, `GPTBot` und `Google-Extended` separat konfiguriert.
Dies ist eine Erhaltungsentscheidung, keine neue Trainingseinwilligung
und kein Rankingversprechen.

Spezifische Bot-Gruppen erben die Wildcard-Sperren nicht. Deshalb erzeugt dieselbe
Funktion für jede freigegebene Gruppe die vollständige private Sperrliste.
Neben den bisherigen Pfaden werden deren nackte Verzeichnis-URLs und bereits
per Netlify als noindex behandelte `/chat/*`-Unterseiten erfasst.
Exakte Allow-Regeln verhindern, dass die Freigabe von `/chat` seine privaten
Unterseiten freigibt. Robots ist keine Zugriffskontrolle; die vorhandenen
Auth- und Noindex-Mechanismen bleiben erhalten.

Geprüfte Primärquellen:

- [OpenAI: Crawler-Übersicht](https://developers.openai.com/api/docs/bots):
  OAI-SearchBot dient der Suche; GPTBot hat eine separate Trainingsfunktion.
- [Google: Google-Extended](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended):
  steuert Gemini-Training und Grounding, nicht das Google-Suchranking.
- [Google: Robots-Auswertung](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec):
  spezifische Gruppen werden nicht mit der Wildcard-Gruppe kombiniert.
- [llms.txt-Spezifikation](https://llmstxt.org/):
  ergänzende Maschinenlesbarkeit für unterstützende Systeme. Kein
  Google-Rankingfaktor wird behauptet.

## Funnel und spätere Messung

`app/page.tsx`, `ChatWorkspace`, Matching, Auth, Payment, Datenbank und
Funnel-Event-Schema bleiben unverändert. An `app/chat/page.tsx` wurde ausschließlich
die Metadatendefinition zentralisiert; Titel und Beschreibung bleiben erhalten.
CTAs sind einfache Links zu `/chat` ohne Query-Parameter, die Aktionen auslösen.

Die bestehende Attribution kann organische Landingpage, Ratgeber und Kampagne
noch nicht zuverlässig unterscheiden. Diese Implementierung fügt keine
irreführenden Entry-Werte und keine parallele Analytics-Lösung hinzu. Eine
aktuelle Produktions-Conversion-Baseline liegt für diese Arbeit nicht vor.
Vor einer späteren Homepage auf `/`: verfügbare Audit-Events und Analytics
read-only auswerten, Zeitraum und Stichprobe dokumentieren und einen gesonderten
Plan für Attribution und Homepage erstellen. Der direkte Produkteinstieg
`/chat` muss bestehen bleiben.

Phase 3 bis 6 (Preise als eigene Seite, Presse, Ratgeber, Vergleiche und
Homepage) sind nicht implementiert.

## Prüfen und lokal starten

Voraussetzungen: Node.js >= 22.13, pnpm; Lockfile unverändert.

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm start --port 3011
```

Die Marketingseiten benötigen keine produktiven Zugangsdaten. Ein lokal
erreichbarer Chat ohne Service-Konfiguration belegt nur den UI-Einstieg,
nicht den Live-Abgleich mit Supabase/OpenAI.

Die Tests prüfen zentrale SEO-Ausgaben und effektive Robots-Pfadregeln,
alle vier Server-Renderings, eindeutige H1/Metadaten, Sprungziele und Links,
Breadcrumbs, Skill-Vokabular und die Kostenanzeige. Der Pricing-Regressionstest
ändert die zentrale Policy einschließlich eines Preises mit Nachkommastellen
und prüft die resultierende Darstellung.

Verifiziert: `pnpm check` nach Phase 1 und Phase 2 erfolgreich. Phase 2:
112 Testdateien, 1.066 Tests. Der normale Produktionsbuild mit Next.js 16.3.4
rendert alle vier Seiten statisch vor; kein Preview-Schalter und keine
deaktivierte Typprüfung. HTTP-Smokes gegen den lokalen Produktionsserver:
alle vier Seiten und `/chat` antworten mit 200, `/` mit 307 nach `/chat`.
H1, Titel, Beschreibung, Canonical, JSON-LD und deutscher Hauptinhalt sind im
initialen HTML vorhanden.
