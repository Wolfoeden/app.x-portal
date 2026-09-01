# Technische und organisatorische Maßnahmen

Nach Art. 32 DSGVO. Bisher lagen diese Angaben verstreut in
`docs/security-operations.md`, in Migrationskommentaren und im Code — nachweisen
ließen sie sich damit nicht. Dieses Dokument fasst sie so zusammen, dass es
einem Kunden als Anlage zu einem Auftragsverarbeitungsvertrag und einer
Aufsichtsbehörde als Nachweis vorgelegt werden kann.

Sprache: Deutsch, wie `docs/processing-register.md` und
`docs/checkout-compliance.md`.

**Stand:** 28. August 2026. Jede Maßnahme nennt, woran sie überprüfbar ist.
Was noch offen ist, steht unter „Bekannte Lücken“ — ein TOM-Dokument, das
Lücken verschweigt, ist der Nachweis seiner eigenen Unbrauchbarkeit.

## 1. Vertraulichkeit

### Zutrittskontrolle

Kein eigener Serverbetrieb. Rechenzentren und physische Sicherheit
verantworten Netlify und Supabase; die Nachweise liegen in deren Zertifizierungen
und im Auftragsverarbeiter-Register.

### Zugangskontrolle (wer erreicht das System)

- Authentifizierung ausschließlich über Supabase Auth; anonyme Sitzungen,
  E-Mail-Anmeldung und optional Google.
- Administrativer Zugang zur Anwendung nur bei **beiden** Bedingungen: ein
  Rollen-Claim in `app_metadata` oder eine konfigurierte Nutzer-ID **und** eine
  E-Mail-Adresse auf der Server-Allowlist. Eine E-Mail-Adresse allein vergibt
  keine Rechte (`lib/auth/current-user.ts`).
- Ein Admin-Konto muss dauerhaft sein; anonyme Sitzungen sind ausgeschlossen.
- Zugang zu Supabase Studio nur für namentlich benannte Betreiber, mit MFA,
  vierteljährlicher Überprüfung der Mitgliedschaft und sofortigem Entzug.

### Zugriffskontrolle (wer sieht welche Daten)

- **Row Level Security auf allen 28 Tabellen**, zusätzlich mit
  `force row level security`, sodass sie auch für den Tabelleneigentümer gilt.
  Überprüfbar mit `supabase/tests/database/rls_isolation.test.sql`.
- Der veröffentlichbare Supabase-Schlüssel ist keine Autorisierungsgrenze;
  die Durchsetzung liegt in der Datenbank.
- Der Service-Role-Schlüssel wird ausschließlich serverseitig verwendet und
  ist über `import "server-only"` gegen ein versehentliches Bündeln im Client
  gesichert (`lib/supabase/admin.ts`).
- Lebensläufe liegen in einem privaten Bucket. Ein Gast erhält weder das
  Dokument noch einen Hinweis auf seine Existenz; ein angemeldeter Nutzer nur
  zu einem Profil, das im neuesten gespeicherten Ergebnis seines eigenen
  Projekts als Empfehlung ausgewiesen ist. Der Abruf läuft über eine
  kurzlebige signierte URL und wird protokolliert.
- Profilbilder liegen ebenfalls in einem privaten Bucket und werden über eine
  Route ausgeliefert, die bei jedem Abruf prüft, ob der Pfad noch das aktuelle
  Bild eines existierenden Profils ist
  (`app/api/freelancer/avatar-image/[...path]/route.ts`).

### Trennungskontrolle

- Mandantentrennung über `owner_user_id` in Verbindung mit RLS, nicht über
  Filter im Anwendungscode.
- Produktion und lokale Entwicklung laufen gegen getrennte Supabase-Projekte.
- Betriebsprotokolle enthalten keine Inhalte; eine Feldsperrliste in
  `lib/audit/write.ts` entfernt Schlüssel, die auf Inhalte, Token, Passwörter,
  Karten-, E-Mail- oder Telefondaten hindeuten.

### Pseudonymisierung

- IP-Adressen werden nie im Klartext gespeichert, sondern ausschließlich als
  HMAC-SHA-256-Ableitung mit einem serverseitigen Geheimnis von mindestens 32
  Zeichen. In der Produktion verweigert die Anwendung den Start der
  Pseudonymisierung ohne dieses Geheimnis (`lib/security/request.ts`).
- Gegenüber der OpenAI-API wird nur eine pseudonyme Sicherheitskennung
  übermittelt, keine Kontokennung.
- Bestätigungstoken der Whitelist liegen nur als SHA-256-Hex in der Datenbank.

## 2. Integrität

### Weitergabekontrolle

- Ausschließlich TLS; in der Produktion zusätzlich HSTS mit einem Jahr
  Gültigkeit und `includeSubDomains`, dazu `upgrade-insecure-requests`.
- Content-Security-Policy mit `default-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, `frame-src 'none'` und einer engen `connect-src`.
  Eine Nonce-basierte Fassung läuft im Report-Only-Modus und ersetzt die
  durchgesetzte, sobald die Meldungen ausgewertet sind
  (`lib/security/csp.ts`, `proxy.ts`).
- Weitere Header: `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`, kein `X-Powered-By`.
- Weiterleitungen auf externe Buchungsziele nur zu Hosts einer Allowlist;
  alles andere über eine Zwischenseite mit sichtbarer Zieladresse
  (`lib/freelancer/booking-hosts.ts`).

### Eingabekontrolle

- Jede schreibende Route prüft die Herkunft über `Origin` und
  `Sec-Fetch-Site` und lehnt ab, wenn beide fehlen.
- Jede Eingabe wird gegen ein `strict`-Zod-Schema geprüft; Anfragekörper
  haben eine harte Größengrenze vor dem Parsen.
- Hochgeladene Dateien werden nach dem Upload serverseitig anhand ihrer ersten
  Bytes geprüft — PDF für Lebensläufe, JPEG/PNG/WebP für Profilbilder. Die
  Angaben des Clients zu Typ und Größe werden nicht übernommen.
- Sicherheitsrelevante Zugriffe erzeugen einen Audit-Eintrag mit Akteur,
  Aktion, Ziel, Ergebnis und Trace-ID; für besonders sensible Lesezugriffe
  schlägt die Aktion fehl, wenn der Audit-Eintrag nicht geschrieben werden kann.

## 3. Verfügbarkeit und Belastbarkeit

- Verwaltetes Hosting mit CDN (Netlify) und verwaltete Datenbank mit
  automatischen Sicherungen (Supabase, Projekt in `eu-west-1`).
- Ratenbegrenzung über einen gemeinsamen Zähler in der Datenbank, damit sie
  über alle Funktionsinstanzen hinweg greift; ein lokaler Zähler bleibt als
  Untergrenze bestehen, falls die Datenbank nicht antwortet
  (`lib/security/shared-rate-limit.ts`).
- Monatliches Budget und harte Obergrenze für Anbieterkosten, mit Warn- und
  Stoppschwellen.
- Gesundheitsprüfung unter `/api/health`; Alarme auf Ausfälle, erhöhte
  5xx-Raten, Authentifizierungsfehler, Anbieterfehler und Quotenablehnungen
  (`docs/security-operations.md`).
- Dokumentierter Rückrollweg in `docs/deployment-and-rollback.md`.

## 4. Verfahren zur regelmäßigen Überprüfung

- Qualitätstor bei jedem Pull Request und auf `main`: Lint, Typprüfung,
  Testlauf, Produktionsbuild und `pnpm audit --prod --audit-level=high`
  (`.github/workflows/quality.yml`).
- Datenbanktests für Row Level Security und die Guthaben-RPCs unter
  `supabase/tests/database/`.
- Löschfristen liegen als `retention_policies` in der Datenbank und werden von
  `pg_cron`-Jobs vollzogen, nicht von einer Erinnerung.
- Auftragsverarbeiter werden vor dem Einsatz in
  `docs/processor-register.md` erfasst; ein Anbieter ohne Eintrag wird nicht
  angebunden.
- Schlüsselrotation nach Ausscheiden von Mitarbeitenden, bei Verdacht auf
  Offenlegung, bei einem Anbietervorfall und turnusmäßig.
- Meldeweg für Vorfälle mit Beweissicherung, Eingrenzung und Bewertung der
  Meldepflichten nach Art. 33 und 34 DSGVO.

## 5. Auftragskontrolle

Auftragsverarbeiter, Zweck, Region und Übermittlungsgrundlage sind in
`docs/processor-register.md` einzeln geführt. Eine Weisung außerhalb des dort
dokumentierten Zwecks erfolgt nicht.

## Bekannte Lücken

Offen und in dieser Reihenfolge zu schließen:

1. **Kein DKIM für x-portal.eu.** SPF und DMARC (`p=none`) stehen seit dem
   01.09.2026 in der Netlify-DNS-Zone, DKIM fehlt noch — der Selektor kommt
   aus dem IONOS-Panel. Ohne ihn ist der Absender bei Gmail und Outlook nur
   halb authentifiziert, was die Zustellung der Bestätigungen gefährdet.
2. **Durchgesetzte CSP erlaubt weiterhin `script-src 'unsafe-inline'`.** Die
   Nonce-Fassung läuft im Report-Only-Modus; vor dem Umschalten müssen die
   statisch vorgerenderten Seiten geklärt sein.
3. **RLS-Tests laufen nicht in CI.** Die Supabase-CLI fehlt im Workflow; die
   Tests werden derzeit nur manuell ausgeführt.
4. **Keine statische Codeanalyse und kein Secret-Scanning** im Push-Pfad, kein
   Dependabot.
5. **Kein veröffentlichter Meldeweg für Schwachstellen** (`security.txt`,
   `SECURITY.md`).
6. **Keine Schadcode-Prüfung hochgeladener Dateien.** Vertretbar, solange
   Uploads aus einem kuratierten Kreis stammen und nur Betreiber sie öffnen;
   neu zu bewerten, sobald das nicht mehr gilt.

Geschlossen am 01.09.2026: **Kein E-Mail-Anbieter.** IONOS ist über
`lib/email/deliver.ts` angebunden, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD` und `EMAIL_FROM` sind in der Produktionsumgebung gesetzt. In
Betrieb sind der Double-Opt-in der Whitelist, die Vertragsbestätigung in
Textform und die beiden Nachrichten zum Kontaktformular.
