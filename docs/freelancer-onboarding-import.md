# Freelancer-Onboarding: Anmeldung über LinkedIn/GitHub, Import aus Lebenslauf und GitHub

Stand: 5. Oktober 2026.

## Was es gibt

- **Anmeldung** im Freelancer-Zugang (`/freelancer/apply`) zusätzlich über
  LinkedIn (OpenID Connect) und GitHub. Kunden sehen diese Knöpfe nicht.
  Beide sind hinter Schaltern aus, bis der Anbieter eingerichtet ist.
- **„Profil schneller ausfüllen“** über dem Bewerbungsformular:
  - **Lebenslauf einlesen:** Die PDF wird wie bisher hochgeladen und
    zusätzlich über `POST /api/freelancer-applications/cv-extract` von der KI
    zu einem Entwurf übertragen (`lib/openai/cv-draft.ts`, `store: false`,
    5 Auswertungen pro Nutzer und Tag). Ohne `OPENAI_API_KEY` ist der Weg
    ausgeblendet.
  - **GitHub ergänzen:** `POST /api/freelancer-applications/github-import`
    liest öffentliche Repositorys zum Nutzernamen
    (`lib/freelancer/import/github*.ts`): Sprachen und Themen werden zu
    Skill-Vorschlägen, bis zu drei Repositorys zu Projekten. Ist das Konto
    mit GitHub verknüpft, ist der Name vorbelegt und gilt als „Konto
    verbunden“.
- **Regeln** (`lib/freelancer/import/draft.ts`): Ein Entwurf füllt nur leere
  Felder und ergänzt Listen, er überschreibt nie. Projekte bleiben
  `source: "application"`, `verified: false`. Mit der Bewerbung wird die
  Herkunft gespeichert (`import_provenance`); die Prüfseite zeigt sie unter
  „Übernommen aus Import“. „Geprüft“ setzt nur die Sichtung.
- **Neue Angaben:** Kapazität (1–5 Tage pro Woche) und gewünschte Projekte,
  in Bewerbung, Profil und Dashboard. Das Matching wertet sie nicht aus.

## Einrichtung (einmalig, außerhalb des Codes)

### Datenbank

Migration `supabase/migrations/20261007090000_bewerbung_import_kapazitaet.sql`
anwenden. Sie ist rein additiv. Vorher speichert die Anwendung die neuen
Felder einfach nicht (Probe in `applicationOnboardingAvailable`).

### LinkedIn-Anmeldung

1. https://www.linkedin.com/developers/apps → App anlegen, mit der
   XPORTAL-Unternehmensseite verknüpfen.
2. Unter „Products“ **Sign In with LinkedIn using OpenID Connect** hinzufügen.
3. Unter „Auth“ als Redirect-URL eintragen:
   `https://xmoxzfqmcnsntvqxhtfb.supabase.co/auth/v1/callback`
4. Supabase-Dashboard → Authentication → Sign In / Providers → **LinkedIn
   (OIDC)** aktivieren, Client-ID und Client-Secret der App eintragen.
5. In `netlify.toml` (Produktion) `NEXT_PUBLIC_AUTH_LINKEDIN_ENABLED = "true"`
   setzen und neu bauen.

### GitHub-Anmeldung

1. https://github.com/settings/developers → **New OAuth App**.
   Homepage: `https://x-portal.eu`; Callback:
   `https://xmoxzfqmcnsntvqxhtfb.supabase.co/auth/v1/callback`.
2. Supabase-Dashboard → Providers → **GitHub** aktivieren, Client-ID und
   Secret eintragen.
3. `NEXT_PUBLIC_AUTH_GITHUB_ENABLED = "true"` in `netlify.toml`, neu bauen.

### GitHub-Import (empfohlen)

Ohne Token gilt das öffentliche Limit von 60 Abrufen pro Stunde und
Server-Adresse. Ein Fine-grained Personal Access Token **ohne jede
Berechtigung** (nur öffentliches Lesen) als `GITHUB_TOKEN` in den
Netlify-Umgebungsvariablen hebt es auf 5.000.

### Lebenslauf-Import

Braucht nur den vorhandenen `OPENAI_API_KEY`. Das Modell ist dasselbe wie
für die Projektanalyse (`DEFAULT_OPENAI_BRIEF_MODEL`); vor dem Livegang einmal
mit einem echten Lebenslauf prüfen, dass es PDF-Eingaben annimmt.

## Prüfen nach der Einrichtung

- Abgemeldet `/freelancer/apply` → „Kostenlos Profil anlegen“: LinkedIn- und
  GitHub-Knopf sichtbar; im Kundendialog (`/chat`) nicht.
- Anmeldung über LinkedIn: Name und E-Mail im Formular vorbelegt, Hinweis
  im Importkasten.
- Anmeldung über GitHub: Nutzername im Importkasten vorbelegt.
- Eigenen Lebenslauf einlesen: leere Felder gefüllt, „aus Lebenslauf: …“
  unter den Feldern, „Noch zu ergänzen“ listet Satz, Verfügbarkeit,
  Kapazität und Wunschprojekte.
- Bewerbung absenden → Prüfseite zeigt „Übernommen aus Import“.

## Nicht enthalten

- LinkedIn Member Data Portability API: Antragspaket in
  `docs/linkedin-portability-antrag.md`, Umsetzung erst nach Freigabe.
- freelancermap: erst nach einer Vereinbarung über eine Schnittstelle.
