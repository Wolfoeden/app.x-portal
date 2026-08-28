# Sicherheitslücken melden

Danke, dass Sie sich die Mühe machen. Melden Sie einen Fund bitte **nicht**
als öffentliches Issue.

## Kontakt

- E-Mail: info@x-portal.eu
- Formular: https://x-portal.eu/contact

Maschinenlesbar: https://x-portal.eu/.well-known/security.txt

## Was wir zusagen

| | |
|---|---|
| Eingangsbestätigung | innerhalb von 3 Werktagen |
| Erste Einschätzung | innerhalb von 10 Werktagen |
| Statusmeldung | mindestens alle 14 Tage bis zum Abschluss |

Wir nennen Sie auf Wunsch, wenn der Fund behoben ist. Ein Bug-Bounty-Programm
gibt es nicht; wir zahlen keine Prämien.

## Was hilft

- Betroffene URL oder Datei, Zeitpunkt und die Schritte zum Nachvollziehen.
- Was Sie erreichen konnten — und was daraus folgen würde.
- Ihre Einschätzung zur Schwere, gern mit CVSS, aber nicht zwingend.

## Grenzen beim Testen

Sie dürfen gegen die Produktionsumgebung testen, solange Sie:

- **ausschließlich eigene Konten und eigene Daten** verwenden;
- keine fremden personenbezogenen Daten abrufen, speichern oder weitergeben —
  ein Beweis, dass ein Zugriff möglich *wäre*, genügt uns;
- keine Last- oder Denial-of-Service-Tests fahren;
- keine Daten verändern oder löschen, die Ihnen nicht gehören;
- keine Phishing- oder Social-Engineering-Versuche gegen Personen unternehmen.

Wer sich daran hält, muss von uns keine rechtlichen Schritte befürchten.

## Bekannte, bereits erfasste Punkte

Diese stehen in `docs/tom.md` unter „Bekannte Lücken“ und sind uns bewusst —
eine Meldung dazu ist nicht nötig:

- die durchgesetzte Content-Security-Policy erlaubt derzeit noch
  `script-src 'unsafe-inline'` (die Nonce-Fassung läuft im Report-Only-Modus);
- es gibt keine Schadcode-Prüfung hochgeladener Dateien;
- statische Codeanalyse und Secret-Scanning im Push-Pfad fehlen noch.

## Umfang

Im Umfang: `x-portal.eu` und die zugehörigen API-Routen.

Nicht im Umfang: die Infrastruktur unserer Dienstleister (Netlify, Supabase,
OpenAI, Buchungsanbieter). Melden Sie Funde dort bitte direkt bei den
jeweiligen Anbietern.
