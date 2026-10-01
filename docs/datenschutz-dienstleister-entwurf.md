# Datenschutz: Dienstleister mit Namen nennen – Entwurf zur Entscheidung

Stand 01.10.2026 · Anlass: UX-Audit P2 („Benannte Dienstleister und
verständliche Datenwege direkt zugänglich machen“)

**Status: Entwurf. Nicht veröffentlicht.** Die Datenschutzerklärung
(`app/privacy/page.tsx`) nennt Dienstleister bewusst nur nach Aufgabe und
Sitz; die Namen gibt es auf Anfrage (Abschnitte 1 und 9). Ob das so bleibt,
entscheidet der Verantwortliche. Dieses Dokument ist keine Rechtsberatung.

Schon umgesetzt, ohne die Datenschutzerklärung zu ändern:

- `/datenwege` fasst in klarer Sprache zusammen, was mit einer eingefügten
  Projektbeschreibung passiert. Jede Aussage dort steht so schon in der
  Datenschutzerklärung. Verlinkt aus dem Chat (unter dem Eingabefeld), dem
  Seitenfuß und der Preisseite.
- Die Preisseite sagt nicht mehr „Hosting und Datenbank in der EU“, sondern
  „Datenbank in der EU“: Der Hosting-Dienstleister hat seinen Sitz in den USA
  (Abschnitt 9).

## Vorschlag: Namen in Abschnitt 9 und auf /datenwege

Die Namen stammen aus `docs/processor-register.md`. Vor einer
Veröffentlichung bitte prüfen, ob die Verträge (AVV/DPA) wie dort vermerkt
abgeschlossen sind.

| Aufgabe | Dienstleister | Sitz / Verarbeitungsort |
| --- | --- | --- |
| Hosting und Auslieferungsnetz | Netlify, Inc. | USA; Auslieferung über Standorte in der EU |
| Datenbank, Anmeldung, Dokumentenspeicher, Sicherungen | Supabase, Inc. | Sitz USA; Projekt in Irland (`eu-west-1`) – Sitz bitte anhand des DPA bestätigen |
| KI-Funktionen (Analyse, externe Recherche) | OpenAI Ireland Ltd. | Irland; Unterauftragsverarbeiter laut OpenAI-Liste |
| E-Mail-Versand | 1&1 IONOS SE | Montabaur, Deutschland; Verarbeitung in der EU |
| Zahlung (erst nach Klick auf einen Tarif) | Stripe Payments Europe, Ltd. | Dublin, Irland; Weitergabe an Stripe, Inc. (USA) |
| Schutz des Kontaktformulars | Intuition Machines, Inc. (hCaptcha) | USA |
| Anmeldung (nur auf Wunsch) | Google | je nach Google-Bedingungen |
| Terminbuchung (nur nach Klick) | der angezeigte Buchungsanbieter, z. B. Calendly LLC | USA |

### Textbaustein für Abschnitt 9 (ersetzt den ersten Absatz)

> Je nach genutzter Funktion erhalten folgende Empfänger Daten. Wir nennen
> Aufgabe, Unternehmen, Sitz und Verarbeitungsort, damit Sie vor der Nutzung
> einer Funktion entscheiden können, ob Sie sie nutzen wollen.

Danach die Liste wie bisher, je Eintrag mit dem Firmennamen aus der Tabelle.
In Abschnitt 1 entfällt dann der Satz „Dienstleister werden hier nach Aufgabe
und Verarbeitungsort benannt, nicht mit Firmennamen …“.

### Bitte prüfen

- Ob die Nennung von Netlify und hCaptcha (Sitz USA) mit dem jeweiligen
  Übermittlungsmechanismus (DPF/SCC) belegt ist, wie Abschnitt 9 es zusagt.
- Ob Google als Anmeldeanbieter genannt werden soll; Microsoft ist nicht
  aktiv und gehört nicht in die Liste.
- Ob nach einer Änderung bestehende Nutzer informiert werden müssen.

## Nach der Freigabe

1. Abschnitte 1 und 9 in `app/privacy/page.tsx` anpassen.
2. In `app/datenwege/page.tsx` die Namen ergänzen und den Satz „Die Namen der
   Dienstleister nennen wir Ihnen auf formlose Anfrage“ streichen.
3. Tests laufen lassen (`tests/marketing`, `tests/seo.test.ts`).
