# Pflichten des Bestellwegs

Die Zahlungsabwicklung ist noch nicht angebunden. Dieses Dokument hält fest,
was der Bestellweg leisten muss, damit er beim ersten zahlenden Kunden
rechtmäßig ist — geschrieben, bevor er gebaut wird, weil ein Checkout billiger
richtig entsteht als nachträglich korrigiert.

Sprache: Deutsch, abweichend vom Rest von `docs/`. Der Gegenstand ist deutsches
Recht, und eine Übersetzung der Begriffe würde sie unschärfer machen.

**Kein Ersatz für Rechtsberatung.** Die Liste benennt, wo Prüfungsbedarf
besteht. Die Fassung der AGB, die Haftungsregelung und die Beschränkung auf
Unternehmer gehören vor dem Verkaufsstart auf den Tisch einer Kanzlei mit
IT-Recht-Schwerpunkt.

## Die Grundentscheidung: ausschließlich Unternehmer

XPORTAL richtet sich ausschließlich an Unternehmer im Sinne des § 14 BGB. Das
ist in `app/terms/page.tsx` (Abschnitt 2), im Impressum und im Plan-Dialog
sichtbar gemacht und liegt als `BUSINESS_ONLY_NOTICE` in
`lib/legal/policy.ts`.

Diese Entscheidung trägt nur unter einer Bedingung:

> **Der Bestellweg muss die Unternehmereigenschaft abfragen und das Ergebnis
> speichern.** Ein Satz in den AGB genügt nicht. Bestellt eine Person als
> Verbraucher und war das für XPORTAL erkennbar oder wurde es nicht geprüft,
> gilt Verbraucherrecht — unabhängig davon, was in den AGB steht.

Daraus folgt für die Umsetzung:

- Pflichtfeld „Ich bestelle als Unternehmer im Sinne des § 14 BGB“ als
  bewusste Bestätigung, nicht vorausgewählt.
- Pflichtfeld Firma sowie optional USt-IdNr.; ohne Firmenangabe kein Abschluss.
- Bestätigung, Zeitpunkt und die angezeigte AGB-Fassung (`TERMS_VERSION`)
  am Vertrag speichern. Ohne diesen Nachweis ist die Beschränkung im
  Streitfall wertlos.
- Bei einer angegebenen USt-IdNr. aus einem anderen EU-Staat: Prüfung über das
  VIES-Bestätigungsverfahren, Ergebnis samt Zeitpunkt archivieren.

## Was durch die B2B-Beschränkung entfällt

Diese Punkte gelten nur für Verbraucherverträge und sind bei einem sauber
geprüften B2B-Bestellweg nicht einschlägig. Sie stehen hier, damit später
nachvollziehbar ist, *warum* sie fehlen:

| Pflicht | Grundlage | Warum entbehrlich |
|---|---|---|
| Widerrufsbelehrung und Muster-Widerrufsformular | § 355 BGB, Art. 246a EGBGB | Widerrufsrecht besteht nur für Verbraucher |
| Zustimmung zum vorzeitigen Leistungsbeginn bei digitalen Inhalten | § 356 Abs. 5 BGB | setzt ein Widerrufsrecht voraus |
| Beschriftung „zahlungspflichtig bestellen“ | § 312j Abs. 3 BGB | gilt für Verbraucherverträge im elektronischen Geschäftsverkehr |
| Kündigungsbutton | § 312k BGB | gilt für Verbraucherverträge über Dauerschuldverhältnisse |
| Preise inklusive Umsatzsteuer | PAngV | die PAngV gilt für Angebote gegenüber Verbrauchern |

Fällt die Beschränkung — etwa weil der Bestellweg die Eigenschaft doch nicht
prüft oder das Angebot geöffnet wird —, wird jede Zeile dieser Tabelle wieder
zur Pflicht. Dann ist dieses Dokument neu zu schreiben, nicht zu ergänzen.

## Was auch im B2B-Geschäft gilt

### Elektronischer Geschäftsverkehr (§ 312i BGB)

Anders als § 312j gilt § 312i **auch zwischen Unternehmern**. Er lässt sich
zwar abbedingen (§ 312i Abs. 2 BGB), aber nur ausdrücklich — und die Pflichten
sind ohnehin gute Praxis. Umzusetzen sind:

- angemessene Mittel, Eingabefehler vor Abgabe der Bestellung zu erkennen und
  zu korrigieren (Bestellübersicht mit Zurück-Möglichkeit);
- Information über die einzelnen technischen Schritte zum Vertragsschluss;
- Angabe, ob der Vertragstext gespeichert wird und ob er zugänglich ist;
- unverzüglicher Zugang einer Bestätigung des Bestelleingangs auf
  elektronischem Weg;
- Möglichkeit, die Vertragsbedingungen abzurufen und in wiedergabefähiger Form
  zu speichern.

### Bestellübersicht

Unmittelbar vor der Abgabe der Bestellung, ohne Scrollen erreichbar:

- gewählte Leistung (Plan oder Credit-Menge);
- Nettopreis, Umsatzsteuerbetrag und Bruttobetrag;
- bei einem Plan: Laufzeit, automatische Verlängerung und Kündigungsfrist
  (ein Monat, siehe AGB Abschnitt 7);
- Hinweis auf das Verhältnis von monatlichem Kontingent und erworbenen
  Credits (AGB Abschnitt 5) — ohne ihn ist unklar, was verfällt.

### Preisangaben

Nettopreise mit dem Zusatz „zzgl. USt.“ sind zulässig. Umgesetzt in
`components/chat/account.tsx` über `planPriceSuffix()`. Der Einzelpreis eines
Credits (`PRODUCT_CREDIT_EURO_PER_UNIT`, derzeit 1/60 €) wird in der Oberfläche
noch nirgends angezeigt; sobald der Kauf möglich ist, braucht er dieselbe
Behandlung.

### Rechnung

- Pflichtangaben nach § 14 UStG vollständig, insbesondere fortlaufende
  Rechnungsnummer, Leistungszeitpunkt, Steuersatz und Steuerbetrag.
- **E-Rechnung:** Seit dem 1. Januar 2025 muss jedes inländische Unternehmen
  E-Rechnungen im strukturierten Format empfangen können. Die Pflicht zur
  *Ausstellung* greift gestaffelt (2027 beziehungsweise 2028 abhängig vom
  Vorjahresumsatz). Vor dem Verkaufsstart ist zu klären, ob der gewählte
  Zahlungsdienstleister ein Format nach EN 16931 erzeugt oder ob ein eigener
  Rechnungslauf nötig wird. Eine PDF-Rechnung ist keine E-Rechnung.
- **Grenzüberschreitend in der EU:** Bei einem Kunden mit gültiger
  ausländischer USt-IdNr. greift das Reverse-Charge-Verfahren. Die Rechnung
  weist dann keine deutsche Umsatzsteuer aus, trägt beide USt-IdNr. und den
  Hinweis „Steuerschuldnerschaft des Leistungsempfängers“. Ohne
  VIES-Prüfung ist dieser Weg nicht belastbar.
- **Aufbewahrung:** Rechnungen und die zugehörigen Belege zehn Jahre
  (§ 147 AO, § 257 HGB). Diese Frist geht der Löschregel in der
  Datenschutzerklärung vor und braucht einen eigenen, von der
  Kontolöschung unabhängigen Speicherort.

### Vertragsbestätigung

Nach Abschluss unverzüglich eine Bestätigung in Textform mit
Leistungsbeschreibung, Preis, Laufzeit, Kündigungsmöglichkeit und der
angewendeten AGB-Fassung. Das setzt einen E-Mail-Versandweg voraus — der ist
laut `docs/processor-register.md` noch offen und damit ein harter
Vorläufer des Verkaufsstarts.

## Datenschutz und Auftragsverarbeitung

- Der Zahlungsdienstleister ist vor dem Einsatz in
  `docs/processor-register.md` aufzunehmen: Rechtsträger, AV-Vertrag,
  Unterauftragsverarbeiter, Region und Übermittlungsgrundlage.
- Die Datenschutzerklärung braucht einen eigenen Abschnitt zu Zahlung und
  Rechnungsstellung mit Rechtsgrundlage (Art. 6 Abs. 1 lit. b DSGVO und, für
  die Aufbewahrung, lit. c) und den handelsrechtlichen Fristen.
- **Keine Zahlungsdaten in eigener Hand.** Kartendaten und Kontoverbindungen
  gehören ausschließlich in die gehostete Oberfläche des Dienstleisters. Nur
  Referenzen, Betrag, Status und Zeitpunkt werden gespeichert. Damit bleibt der
  PCI-DSS-Aufwand bei SAQ A.
- Die Kontolöschung (`app/api/account/delete/route.ts`) muss die
  Rechnungsdaten aussparen; sie unterliegen der gesetzlichen Aufbewahrung. Die
  heutige Löschung würde sie mitnehmen und ist vor dem Verkaufsstart
  entsprechend anzupassen.

## Prüfliste vor dem ersten zahlenden Kunden

1. Unternehmerabfrage vorhanden, nicht vorausgewählt, Ergebnis am Vertrag
   gespeichert.
2. AGB-Fassung am Vertrag gespeichert und im Bestellweg abrufbar.
3. Bestellübersicht mit Netto, Steuer, Brutto, Laufzeit und Kündigungsfrist.
4. Eingabefehler vor Abgabe korrigierbar.
5. Bestellbestätigung in Textform verschickt — E-Mail-Anbieter ausgewählt und
   im Verarbeitungsregister eingetragen.
6. Rechnung mit allen Angaben nach § 14 UStG, E-Rechnung geklärt.
7. VIES-Prüfung und Reverse-Charge-Hinweis für EU-Ausland.
8. Zahlungsdienstleister im Verarbeitungsregister, AV-Vertrag angenommen.
9. Datenschutzerklärung um Zahlung und Rechnungsstellung ergänzt.
10. Kontolöschung schont die handelsrechtlich aufzubewahrenden Belege.
11. Anwaltliche Prüfung von AGB, Haftungsregelung und B2B-Beschränkung
    abgeschlossen.
