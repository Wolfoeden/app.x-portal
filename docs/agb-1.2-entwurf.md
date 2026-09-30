# AGB 1.2 und Vermittlungsbedingungen: Entwurf zur rechtlichen Prüfung

Stand 30.09.2026 · Anlass: UX-Audit F02 („AGB und Preise widersprechen sich noch“)

**Status: Entwurf. Nicht veröffentlicht.** Die geltende AGB-Fassung ist 1.1
(`TERMS_VERSION` in `lib/legal/policy.ts`), die geltenden
Vermittlungsbedingungen sind `vermittlung-2026-09-1`
(`PLACEMENT_TERMS.version` in `lib/placement/config.ts`). Beide bleiben
unverändert, bis die Formulierungen unten geprüft und freigegeben sind.
Dieses Dokument ist keine rechtliche Wirksamkeitsprüfung.

Was schon ohne Vertragsänderung geändert wurde (Produkttexte, keine
Vertragstexte): Startseite, Preisseite, Credit-Übersicht und der
Anfrage-Dialog nennen jetzt dieselben Regeln, alle aus
`lib/billing/credit-rules.ts`:

- Ohne Konto: 30 Credits, einmalig.
- Mit kostenlosem Konto: 90 Credits insgesamt, einmalig; das Gastguthaben
  wird ersetzt, nicht addiert.
- Das Startguthaben füllt sich nicht monatlich auf.
- Fällt die KI-Analyse aus oder scheitert eine Recherche technisch, wird
  nichts belastet.
- Anfrage und Vorstellung sind kostenlos und brauchen kein Abo.

## Übersicht der Widersprüche

| Stelle | Heute | Tatsächliche Regel | Vorschlag |
| --- | --- | --- | --- |
| AGB §5 | „Jeder Zugang hat ein monatliches Kontingent“, das sich jede Periode auffüllt | Gast 30 und Konto 90 Credits einmalig; Enterprise ohne Kontingent, nach Verbrauch | §5 neu (A) |
| AGB §6 | „Eine nachträgliche verbrauchsabhängige Mehrberechnung ist im aktuellen Enterprise-Modell nicht vorgesehen.“ | Enterprise: 0,02 € netto je Credit, monatlich nach Verbrauch; nur Bestandsverträge (50 €/3.000 Credits) sind pauschal | §6 Abs. 2 neu (B) |
| AGB §10 | Nennt kein Honorar; „XPORTAL stellt den Kontakt her“ | Vermittlungshonorar bei Beauftragung nach den Vermittlungsbedingungen | §10 Abs. 4 neu (C) |
| Vermittlungsbedingungen §2 | „Suche, Anfrage, Vorstellung und Erstgespräch sind kostenlos.“ | Die Suche kostet Credits (Analyse 3, Recherche 30) | §2 Satz 2 neu (D) |
| Vermittlungsbedingungen | Offen: wer schuldet, was auslöst, vorbekannte Kontakte, Folgeprojekte, Ende und Änderungen | siehe (E) | §§ 3a, 5, 5a neu (E) |

## (A) AGB §5 Credits, neue Fassung

> **5. Credits**
>
> (1) Die Nutzung KI-gestützter Funktionen wird in Credits abgerechnet. Die
> Anwendung zeigt vor einer kostenpflichtigen Aktion an, wie viele Credits
> sie kostet. Die veröffentlichten Funktionspreise sind Festpreise in
> Credits.
>
> (2) **Startguthaben.** Ein Gastzugang erhält einmalig 30 Credits. Mit
> einem kostenlosen Konto stehen einmalig insgesamt 90 Credits zur
> Verfügung; ein bestehendes Gastguthaben wird dabei durch dieses
> Guthaben ersetzt und nicht hinzugerechnet. Das Startguthaben füllt sich
> nicht auf.
>
> (3) **Monatstarife.** In einem kostenpflichtigen Monatstarif steht das dem
> Tarif zugeordnete Kontingent zur Verfügung. Es füllt sich zu Beginn
> jeder Abrechnungsperiode auf und verfällt an deren Ende; nicht genutzte
> Credits werden nicht übertragen und nicht vergütet.
>
> (4) **Nutzungstarif (Enterprise).** Im Nutzungstarif gibt es kein
> Kontingent. Abgerechnet werden die in der Abrechnungsperiode
> verbrauchten Credits zum veröffentlichten Preis je Credit (§6 Abs. 2).
>
> (5) **Fehlgeschlagene Läufe.** Scheitert eine KI-Analyse oder eine
> Recherche aus technischen Gründen, werden dafür keine Credits
> belastet. Ein abgeschlossener Recherche-Lauf wird auch dann berechnet,
> wenn er keine passenden Profile findet.
>
> (6) Credits sind kein Zahlungsmittel, nicht übertragbar und werden nicht
> in Geld ausgezahlt. Wird ein Konto vom Nutzer gelöscht oder aus
> wichtigem Grund beendet, verfallen verbleibende Credits ohne
> Erstattung. Bei ordentlicher Kündigung bleibt das Kontingent bis zum
> Ende der bereits bezahlten Periode nutzbar.

Bitte prüfen: ob Abs. 5 als Zusage formuliert werden soll (technisch
umgesetzt: Ausfall der Analyse → Reservierung wird freigegeben; gescheiterte
Recherche → keine Belastung) oder als „in der Regel“.

## (B) AGB §6 Abs. 2, neue Fassung

> (2) Alle Preise verstehen sich als Nettopreise zuzüglich der gesetzlichen
> Umsatzsteuer. Der Preis eines Monatstarifs gilt je Abrechnungsperiode.
> Im Nutzungstarif (Enterprise) gibt es keine Grundgebühr; berechnet wird
> monatlich nachträglich der Verbrauch in Credits zum veröffentlichten
> Preis je Credit, derzeit 0,02 € netto. Für vor dem [Datum] geschlossene
> Enterprise-Verträge mit festem Monatspreis gilt weiterhin der vereinbarte
> Festpreis ohne verbrauchsabhängige Mehrberechnung. Maßgeblich ist der zum
> Zeitpunkt der Bestellung angezeigte Preis.

Bitte prüfen: Stichtag für Bestandsverträge (`enterprise_legacy`, 50 € /
3.000 Credits); ob eine Obergrenze oder Vorabinformation bei hohem
Verbrauch zugesagt werden soll.

## (C) AGB §10, neuer Abs. 4

> (4) Fragt der Nutzer über XPORTAL einen Freelancer an und stellt XPORTAL
> ihn vor, gelten ergänzend die
> [Vermittlungsbedingungen](/vermittlungsbedingungen). Kommt es zu einer
> Beauftragung, schuldet der Nutzer XPORTAL danach ein
> Vermittlungshonorar. Anfrage, Vorstellung und Erstgespräch sind
> kostenlos; ein Monatstarif ist dafür nicht erforderlich und ersetzt das
> Honorar nicht.

## (D) Vermittlungsbedingungen §2, Satz 2 neu

> Anfrage, Vorstellung und Erstgespräch sind kostenlos. Für die Suche
> selbst gelten die Credit-Regeln der Allgemeinen Geschäftsbedingungen.
> Kommt keine Beauftragung zustande, entsteht kein Honorar.

## (E) Vermittlungsbedingungen, Ergänzungen

> **3a. Wer das Honorar schuldet**
>
> Das Honorar schuldet das Unternehmen, für das die Anfrage gestellt
> wurde, also die bei der Anfrage angegebene Firma oder die Inhaberin bzw.
> der Inhaber des anfragenden Kontos. Beauftragt ein mit ihm verbundenes
> Unternehmen (§ 15 AktG) den vorgestellten Freelancer, gilt das als
> Beauftragung durch den Kunden. Der Freelancer zahlt nichts.

> **5. Was die Bindung auslöst**
>
> Die Bindung beginnt mit der Vorstellung per E-Mail durch XPORTAL (§2),
> nicht schon mit dem Anzeigen eines Profils im Suchergebnis. Beauftragen
> Sie einen vorgestellten Freelancer innerhalb von
> 12 Monaten nach der Vorstellung, fällt das Honorar an, auch wenn
> die Beauftragung direkt, über Dritte oder für ein anderes Projekt
> erfolgt. Für Folgeaufträge nach Ablauf der ersten 3 Monate der
> Zusammenarbeit fällt kein weiteres Honorar an.

> **5a. Bereits bekannte Kontakte**
>
> Haben Sie mit dem Freelancer in den 12 Monaten vor der Vorstellung
> bereits zusammengearbeitet oder über eine Zusammenarbeit verhandelt,
> fällt kein Honorar an, wenn Sie XPORTAL das innerhalb von 14 Tagen
> nach der Vorstellung in Textform mitteilen und auf Nachfrage belegen.

> **4. (Ergänzung) Ende und Änderungen**
>
> Endet die Zusammenarbeit vor Ablauf der ersten 3 Monate, berechnet sich
> das Honorar nach den tatsächlich geleisteten und vergüteten Projekttagen,
> höchstens 60. Ändern sich Tagessatz oder Umfang in diesem Zeitraum,
> wird die Rechnung angepasst; zu viel Gezahltes wird erstattet.

Bitte prüfen: ob die Erstattung bei vorzeitigem Ende (Abs. 4) gewollt ist;
ob die Einrede „bekannter Kontakt“ eine Frist braucht und welche Belege
genügen; ob §3a die Haftung verbundener Unternehmen wirksam regeln kann.
Die Zahlen (10 %, 3 Monate, 60 Tage, 12 Monate, 14 Tage) kommen im
Code aus `PLACEMENT_TERMS`; die neue Fassung braucht eine neue Kennung
(z. B. `vermittlung-2026-10-1`), damit gespeicherte Zustimmungen der
jeweils gültigen Fassung zugeordnet bleiben.

## Weitere Punkte (keine Vertragstexte)

1. **„Enterprise“ umbenennen.** Der Tarif ohne Grundgebühr ist für
   Gelegenheitsnutzer gedacht; „Enterprise“ klingt nach Großkunde. Vorschlag:
   „Nach Nutzung“ oder „Flex“. Betrifft Preisseite, AGB §§5–6, Stripe-Produkt
   und `CREDIT_PLANS.enterprise_flex.label`. Erst nach Freigabe der AGB
   ändern, damit Vertrag und Oberfläche denselben Namen tragen.
2. **Kontaktadresse.** Enterprise-Anfragen gehen an eine private Domain
   (`ENTERPRISE_CONTACT.email` in `lib/billing/payment-links.ts`). Für
   Rechnungen und Verträge eine Adresse unter der Produktdomain einrichten
   (Audit P2).
3. **Rechenbeispiel Vermittlung.** Preisseite und Bedingungen zeigen
   600 € × 15 Tage × 10 % = 900 € netto. Das Audit rechnet zusätzlich den
   Höchstfall (800 € × 60 Tage × 10 % = 4.800 €). Ob der Höchstfall
   genannt werden soll, ist eine Vertriebsentscheidung.

## Nach der Freigabe

1. Texte in `app/terms/page.tsx` und `app/vermittlungsbedingungen/page.tsx`
   übernehmen.
2. `TERMS_VERSION` auf `1.2` und `PLACEMENT_TERMS.version` auf die neue
   Kennung setzen; bestehende Nutzer nach AGB §15 informieren.
3. `tests/marketing.test.ts` und die Legal-Tests laufen lassen.
