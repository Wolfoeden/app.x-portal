# Barrierefreiheit

Sprache: Deutsch, wie die übrigen Rechts- und Nachweisdokumente.

**Stand:** 28. August 2026.

## Rechtliche Einordnung

Das Barrierefreiheitsstärkungsgesetz (BFSG) gilt seit dem 28. Juni 2025 unter
anderem für Dienstleistungen im elektronischen Geschäftsverkehr gegenüber
**Verbrauchern**. Für XPORTAL greifen zwei voneinander unabhängige Gründe,
warum daraus derzeit keine Pflicht folgt:

1. **Kein Verbrauchergeschäft.** XPORTAL richtet sich ausschließlich an
   Unternehmer im Sinne des § 14 BGB (siehe `app/terms/page.tsx` Abschnitt 2
   und `docs/checkout-compliance.md`). Das BFSG erfasst
   Verbraucherdienstleistungen; ein reines B2B-Angebot fällt nicht darunter.
2. **Kleinstunternehmen.** Nach § 3 Abs. 3 BFSG sind Dienstleistungen von
   Unternehmen mit weniger als zehn Beschäftigten und höchstens zwei Millionen
   Euro Jahresumsatz von den Anforderungen ausgenommen.

Beide Gründe sind an Umstände gebunden, die sich ändern können. Die
Einordnung ist deshalb neu zu treffen, sobald

- das Angebot für Verbraucher geöffnet wird,
- die Schwelle von zehn Beschäftigten oder zwei Millionen Euro Umsatz erreicht
  wird, oder
- ein Vertriebspartner die Einhaltung vertraglich verlangt — das kommt in der
  Praxis vor der gesetzlichen Pflicht.

## Warum wir es trotzdem tun

Die Ausnahme befreit von der Pflicht, nicht von der Wirkung. Ein Nutzer, der
mit der Tastatur arbeitet oder einen Screenreader verwendet, kann die Anwendung
sonst nicht bedienen — unabhängig davon, ob ihn ein Gesetz schützt. Und
nachrüsten ist teurer als mitbauen, solange die Oberfläche klein ist.

## Was bereits umgesetzt ist

- Sprachauszeichnung je Seite: `lang="de"` am Wurzelelement, `lang="en"` auf
  der englischsprachigen Landingpage, deutsche Metadaten.
- Sprunglink zum Hauptinhalt beziehungsweise zum Agentenverzeichnis.
- Sichtbarer Fokus: rund 30 `:focus-visible`-Regeln, auch auf den neuen
  Seiten (Kontakt, Buchungs-Zwischenseite, Fehlerseiten).
- Formularfelder mit zugeordneten Beschriftungen, Fehlermeldungen mit
  `role="alert"`, Statusmeldungen mit `role="status"`.
- Dialoge mit `role="dialog"`, `aria-modal` und `aria-labelledby`.
- Farbtoken, die auf den verwendeten Flächen 4,5:1 erreichen — dokumentiert im
  Kommentar zu `--muted` und `--muted-light` in `app/globals.css`.
- Tabellen mit `scope="col"`, dekorative Symbole mit `aria-hidden`.

## Was offen ist

Keine dieser Lücken ist derzeit eine Rechtspflicht, alle sind Handwerk:

1. **Kein Prüfbericht gegen EN 301 549 / WCAG 2.1 AA.** Bisher gibt es
   Einzelmaßnahmen, keine systematische Prüfung.
2. **Kein automatisierter Test.** Ein Axe-Lauf über die Hauptseiten ließe sich
   in das Qualitätstor hängen.
3. **Fokusführung in Dialogen** ist nicht durchgängig geprüft — insbesondere,
   ob der Fokus beim Schließen dorthin zurückkehrt, wo er herkam.
4. **Der Chat-Verlauf** ist nicht auf die Ansage neuer Nachrichten durch einen
   Screenreader geprüft; `aria-live` ist gesetzt, aber nicht verifiziert.
5. **Keine Erklärung zur Barrierefreiheit** auf der Website. Die wäre erst bei
   einer Pflicht erforderlich, ist aber der übliche Ort, an dem ein
   Vertriebspartner nachsieht.

## Pflege

Bei jeder der oben genannten Änderungen neu bewerten, mindestens jedoch
jährlich zusammen mit `docs/processing-register.md`.
