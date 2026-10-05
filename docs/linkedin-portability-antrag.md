# LinkedIn Member Data Portability API (3rd Party): Antragspaket

Stand: 5. Oktober 2026. Noch nicht beantragt, noch nicht umgesetzt.

## Wozu

Mit der normalen LinkedIn-Anmeldung (OpenID Connect, im Code vorbereitet)
erhält XPORTAL nur Kennung, Name, E-Mail und Profilbild. Die Member Data
Portability API (3rd Party) stellt Mitgliedern im EWR zusätzlich ihre
beruflichen Daten zur Übertragung bereit: Skills, Positionen, Ausbildung,
Projekte, Sprachen und Zertifikate. Damit ließe sich das Bewerbungsformular
weitgehend vorbefüllen.

Der Zugang wird von LinkedIn geprüft und ist nicht zugesichert. Die Daten
sind nur so vollständig wie das gepflegte Profil, und manche Bereiche stellt
LinkedIn zeitversetzt bereit. Ein sofort vollständiges Profil nach dem Klick
wird deshalb nirgends versprochen.

## Checkliste für den Antrag

- [ ] LinkedIn-Entwickler-App für XPORTAL (dieselbe wie für die Anmeldung oder eine eigene)
- [ ] Verifizierte LinkedIn-Unternehmensseite von XPORTAL, mit der App verknüpft
- [ ] Unternehmensangaben: XPORTAL, Inhaber Roman Dering, Heilig-Kreuz-Straße 18, 87600 Kaufbeuren, Deutschland; info@x-portal.eu
- [ ] Datenschutzerklärung: https://x-portal.eu/privacy (Abschnitt 5 um die LinkedIn-Übernahme ergänzen, bevor der Import live geht)
- [ ] Zweckbeschreibung (unten)
- [ ] Liste der angefragten Datenbereiche (unten), nichts darüber hinaus

## Zweckbeschreibung (Entwurf für das Antragsformular)

> XPORTAL is a German freelancer placement platform. Freelancers who apply
> on https://x-portal.eu/freelancer/apply can, at their own request, port
> their professional LinkedIn data into a draft of their XPORTAL profile
> instead of typing it again. The draft is shown to the freelancer, who
> reviews and edits it before submitting. Ported data is stored only after
> submission, labelled with its source, and is never treated as verified by
> XPORTAL. We do not request messages, connections, or any data unrelated to
> the professional profile. The freelancer can delete the profile and all
> ported data at any time.

## Angefragte Datenbereiche

Nur beruflich relevante Bereiche des Snapshots:

- Profil (Name, Überschrift, Standort auf Stadt/Region gekürzt)
- Skills
- Positionen
- Ausbildung
- Projekte
- Sprachen
- Zertifikate

Ausdrücklich **nicht**: Nachrichten, Kontakte/Verbindungen, Einladungen,
Beiträge, Reaktionen, Suchverlauf, Werbedaten. Die genauen Domain-Namen sind
vor der Umsetzung gegen die dann gültige Dokumentation zu prüfen
(Microsoft Learn: „Member Data Portability (3rd Party)“, Snapshot-Domains).

## Rechtliches

- Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahme auf
  Anfrage der Person); zusätzlich der Zustimmungsdialog von LinkedIn.
- Zweckbindung: nur der Profilentwurf. Kein Matching-Signal aus der bloßen
  Existenz oder Größe eines LinkedIn-Profils.
- Speicherung: wie beim Lebenslauf-Import; der Entwurf wird nicht
  gespeichert, mit der Bewerbung nur die übernommenen Werte und ihre Herkunft
  (`import_provenance`, Quelle `linkedin`).
- Löschung: mit dem Profil bzw. der abgelehnten Bewerbung
  (`retention_policies`).
- AI Act: Die Übernahme strukturiert Angaben der Person für die Person
  selbst. Eine spätere Bewertung oder Priorisierung von Freelancern für
  Recruiter ist neu einzuordnen (Anhang III Nr. 4).

## Umsetzung nach einer Freigabe

1. Eigener OAuth-Ablauf mit dem Portability-Scope, getrennt von der Anmeldung.
2. Adapter `lib/freelancer/import/linkedin.ts`, der denselben `ProfileDraft`
   liefert wie Lebenslauf und GitHub (`lib/freelancer/import/draft.ts`,
   Quelle `linkedin`).
3. Im Importkasten (`app/freelancer/apply/ImportPanel.tsx`) ein dritter Weg
   „LinkedIn-Daten übernehmen“, mit Hinweis auf möglichen Zeitversatz.
4. Datenschutzerklärung, Datenwege und Register ergänzen.
5. Integrationstest mit echten, zustimmenden Freelancer-Profilen.
