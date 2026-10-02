# Vermittlungshonorar: Rechnung über Stripe

Seit dem 30.09.2026 ist das Vermittlungsmodell für die Produktion
eingeschaltet (`NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED` in `netlify.toml`).
Kunden fragen Freelancer über XPORTAL an, der Betreiber stellt vor, und bei
einer Beauftragung fällt einmalig das Honorar nach
`lib/placement/config.ts` an (10 % der ersten 3 Monate, höchstens 60
Projekttage, zuzüglich 19 % USt., 14 Tage Zahlungsziel). Beispiel auf den
Seiten: 600 € Tagessatz × 15 Projekttage × 10 % = 900 € netto. Die Rechnung
geht erst nach einer erfassten Beauftragung raus, nie für einen Termin oder
ein Erstgespräch allein.

## Ablauf im Admin (`/chat/admin/vermittlungen`)

1. **Vorstellen**: gibt den Kalender frei und schreibt beiden Seiten.
2. **Beauftragung erfassen**: Tagessatz, Projekttage der ersten drei Monate,
   Start. Das Honorar rechnet der Server nach der Fassung der Bedingungen, der
   der Kunde zugestimmt hat.
3. **Rechnung über Stripe**: Rechnungsanschrift eintragen (Firma, E-Mail,
   Straße, PLZ, Ort, optional USt-IdNr.), „Rechnung erstellen und senden“.
   Stripe legt Kunde und Rechnung an, vergibt die Rechnungsnummer, erzeugt das
   PDF und schickt die Rechnung per Mail. Nummer, Link und PDF stehen danach an
   der Beauftragung.
4. **Zahlung**: `invoice.paid` aus dem Stripe-Webhook setzt den Stand auf
   „Bezahlt“ und zählt im Umsatztrichter. Eine Überweisung außerhalb von
   Stripe verbucht „Zahlung von Hand verbuchen“.

Bricht ein Versuch ab, setzt der nächste Klick fort: Kunde und Rechnung
werden nicht doppelt angelegt (Idempotenzschlüssel je Beauftragung). Weicht
der Betrag der Stripe-Rechnung vom Honorar ab, wird sie nicht verschickt.

Vorerst nur Empfänger in Deutschland. Rechnungen ins Ausland (Reverse Charge)
von Hand stellen und unter „Rechnung außerhalb von Stripe gestellt?“ mit der
Nummer eintragen.

## Suchauftrag: „XPORTAL sucht für Sie“

Unter jedem Suchergebnis (mit und ohne Treffer) kann der Kunde XPORTAL
beauftragen, passende Freelancer persönlich vorzustellen — als Gast mit
E-Mail und Firma, mit Konto ohne weitere Angaben. Er stimmt dabei den
Vermittlungsbedingungen zu (`placement_terms_accepted` mit `mandate: true`).

1. Der Auftrag erscheint unter **Vermittlungen → Suchaufträge offen** und in
   der Übersicht unter „Zu erledigen“; der Betreiber bekommt eine Mail.
2. **Zuordnen**: Vorschläge aus dem Abgleich (Treffer und Teiltreffer) oder
   ein beliebiges aktives Profil. Jede Zuordnung legt eine gewöhnliche Anfrage
   (`intro_bookings`, `manual_review`) an — mit dem Zeitpunkt der Zustimmung
   aus dem Auftrag und seinen Kontaktdaten. Zuordnen verschickt nichts.
3. **Vorstellen** wie bei jeder Anfrage; danach gelten Nachfassen,
   Beauftragung und Rechnung unverändert.
4. Stand des Auftrags von Hand: in Bearbeitung, vorgestellt, abgeschlossen,
   abgelehnt. Je Projekt ist höchstens ein Auftrag offen.

Benötigt die Migration `20261003090000_suchauftraege.sql`. Ohne sie zeigt die
Vermittlungsseite einen Hinweis statt der Liste, und das Absenden im Chat
meldet einen Fehler.

## Anfrage ohne Konto und „Gespräche“

- Gäste fragen im Chat ohne Registrierung an: E-Mail, Firma, optional Name,
  Zustimmung zu den Bedingungen. Höchstens drei Anfragen je Gast und zehn je
  Adresse am Tag; ein Honigtopf-Feld hält Formular-Bots ab. Im Admin steht
  dann „ohne Konto, E-Mail unbestätigt“: vor der Vorstellung kurz prüfen.
- „Gespräche“ (`/gespraeche`, Seitenleiste) zeigt Kunden ihre Anfragen und
  Freelancern mit Konto die Anfragen an ihr Profil, sobald vorgestellt wurde.
- 14 Tage nach der Vorstellung fragt XPORTAL dort **jede Seite für sich**, ob
  es zur Beauftragung kam; bei „noch im Gespräch“ nach 45 Tagen noch einmal.
  Beide Antworten stehen im Admin, ein Widerspruch („ja“ gegen „nein“) ist
  markiert.
- Per Mail geht nur ein kurzer Hinweis mit Link (ohne Anmeldung) zu diesem
  Gespräch. Der Zeitplan `xportal-placement-follow-ups` (pg_cron, täglich
  06:52 UTC) ruft dafür `/api/admin/introductions/follow-ups` mit dem
  Geheimnis `placement_run_token` aus dem Supabase-Vault auf; in Netlify
  steht dasselbe als `PLACEMENT_RUN_SECRET`. Der Knopf im Admin bleibt.

## Einrichtung (einmalig)

**In Stripe**

1. Einstellungen → Unternehmensdaten: Name „XPORTAL — 300, Inhaber Roman
   Dering“, Anschrift wie im Impressum. Einstellungen → Rechnungen: die
   USt-IdNr. DE459643156 als Steuer-ID des Kontos hinterlegen und auf
   Rechnungen anzeigen. Ohne Absenderangaben ist die Rechnung nicht
   vollständig (§ 14 UStG).
2. Steuersatz: nichts zu tun. Die erste Rechnung nimmt den aktiven,
   exklusiven 19-%-Satz für Deutschland aus dem Konto und legt ihn an, wenn
   es keinen gibt („USt.“). Wer einen bestimmten Satz vorgeben will, trägt
   seine ID als `STRIPE_PLACEMENT_TAX_RATE_ID` ein; dann wird genau dieser
   geprüft (aktiv, exklusiv, 19 %).
3. Entwickler → API-Schlüssel: einen eingeschränkten Schlüssel anlegen mit
   Schreibrecht auf Customers, Invoices, Invoice Items und Tax Rates.
4. Entwickler → Webhooks: Der bestehende Endpunkt
   `https://x-portal.eu/api/stripe/webhook` empfängt `invoice.paid` bereits
   (geprüft am 30.09.2026).
5. Einstellungen → Rechnungen → Zahlungsarten: Überweisung und/oder Karte für
   Rechnungen freischalten.

**In Netlify** (Umgebungsvariablen, Projekt app-x-portal-chat, Produktion)

- `STRIPE_SECRET_KEY` = der eingeschränkte Schlüssel (`rk_live_…`), als
  Geheimnis markiert

Fehlt er, zeigt der Admin statt des Formulars einen Hinweis, und die
Rechnung wird von Hand gestellt.

**In der Datenbank** — vor dem Deploy, sonst scheitern Suche und Admin:

- `supabase/migrations/20260930090000_placement_invoices.sql`
- `supabase/migrations/20260930100000_bewerbung_suchziel_ohne_kalender.sql`

Beide nur hinzufügend bzw. lockernd und idempotent.

## Lokal ansehen

`pnpm dev` mit `NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED=true`, dann
`/chat/preview/vermittlung` (Panel mit Testdaten) und
`/freelancer/apply?preview=form&quelle=arbeitsagentur` (Bewerbungsformular).
Beide Vorschauen gibt es nur in der Entwicklung.
