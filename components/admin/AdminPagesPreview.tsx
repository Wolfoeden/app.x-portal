import type { ReactNode } from "react";

import {
  AdminMetricStrip,
  AdminPageHeader,
  AdminSectionHeader,
  type AdminMetric,
} from "./AdminDataPrimitives";

import styles from "./admin-pages-preview.module.css";

export const ADMIN_PREVIEW_VIEWS = [
  "users",
  "demand",
  "profiles",
  "freelancers",
  "leads",
  "outreach",
  "ai-usage",
] as const;

export type AdminPreviewView = (typeof ADMIN_PREVIEW_VIEWS)[number];

type Tone = "default" | "accent" | "warning" | "danger" | "muted";

type PreviewCell = {
  main?: ReactNode;
  meta?: ReactNode;
  badge?: { label: string; tone?: Tone };
  tags?: readonly string[];
  action?: string;
};

type PreviewRow = {
  key: string;
  tone?: Tone;
  cells: readonly PreviewCell[];
};

type PreviewConfig = {
  eyebrow: string;
  title: string;
  description: string;
  metrics: readonly AdminMetric[];
  filters: readonly string[];
  sectionTitle: string;
  sectionDescription: string;
  resultLabel: string;
  columns: readonly string[];
  rows: readonly PreviewRow[];
};

const CONFIGS: Record<AdminPreviewView, PreviewConfig> = {
  users: {
    eyebrow: "Admin / Analyse",
    title: "Nutzeraktivität",
    description:
      "Konten, tatsächliche Aktivität und stille Nutzer sind getrennt lesbar — ohne redundante Kontotyp-Spalte.",
    metrics: [
      { label: "Registriert", value: "326", detail: "284 Konten · 42 Gäste" },
      { label: "Aktiv · 30 Tage", value: "87", detail: "mindestens eine Nachricht", tone: "accent" },
      { label: "Neue Konten", value: "24", detail: "im gewählten Zeitraum" },
      { label: "Noch ohne Nachricht", value: "197", detail: "Aktivierung prüfen", tone: "warning" },
    ],
    filters: ["30 Tage", "Alle Konten", "Zuletzt aktiv"],
    sectionTitle: "Aktive und stille Konten",
    sectionDescription: "Identität, Nutzung und Handlungsbedarf in dieser Reihenfolge.",
    resultLabel: "87 aktive Konten",
    columns: ["Nutzer", "Nutzung · 30 Tage", "Letzte Aktivität", "Konto", "Signal"],
    rows: [
      {
        key: "user-1",
        tone: "accent",
        cells: [
          { main: "anna@northstar.de", meta: "Anna Neumann · registriert" },
          { main: "18 Nachrichten", meta: "6 Suchen · 3 Exporte" },
          { main: "Heute, 09:42", meta: "vor 18 Minuten" },
          { badge: { label: "Scale", tone: "accent" }, meta: "1.420 / 2.000 Credits" },
          { badge: { label: "Aktiv", tone: "accent" }, meta: "keine Aktion" },
        ],
      },
      {
        key: "user-2",
        cells: [
          { main: "jonas@atelier.io", meta: "Jonas Richter · registriert" },
          { main: "4 Nachrichten", meta: "1 Suche" },
          { main: "Gestern, 16:08", meta: "vor 17 Stunden" },
          { badge: { label: "Starter" }, meta: "420 / 500 Credits" },
          { badge: { label: "Beobachten", tone: "muted" }, meta: "wenig Nutzung" },
        ],
      },
      {
        key: "user-3",
        tone: "warning",
        cells: [
          { main: "lea@studio-elf.de", meta: "Lea Weber · registriert" },
          { main: "0 Nachrichten", meta: "keine Suche" },
          { main: "Noch nie aktiv", meta: "Konto seit 12 Tagen" },
          { badge: { label: "Starter" }, meta: "500 / 500 Credits" },
          { badge: { label: "Aktivieren", tone: "warning" }, meta: "Onboarding prüfen" },
        ],
      },
    ],
  },
  demand: {
    eyebrow: "Admin / Analyse",
    title: "Nachfrageprofile",
    description:
      "Wiederkehrende Kompetenzbedarfe und echte Kataloglücken zeigen, welche Freelancer als Nächstes beschafft werden sollten.",
    metrics: [
      { label: "Analysierte Bedarfe", value: "42", detail: "jüngster Lauf je Projekt", tone: "accent" },
      { label: "Externe Nachfrager", value: "31", detail: "1 internes Konto entfernt" },
      { label: "Ohne verlässliches Match", value: "29 %", detail: "10 von 35 messbaren Ergebnissen", tone: "warning" },
      { label: "Beschaffungsprioritäten", value: "3", detail: "wiederholt gesucht + Lücke", tone: "warning" },
    ],
    filters: ["90 Tage", "Externe Nutzung", "Sortierung: Versorgungslücke"],
    sectionTitle: "Nachfrageprofile nach Beschaffungsrelevanz",
    sectionDescription:
      "Profile entstehen aus normalisierten Pflichtkompetenzen; unklare Briefings erhöhen nicht die Lückenquote.",
    resultLabel: "8 Profile · 1 internes Konto ausgeschlossen",
    columns: ["Nachfrageprofil", "Nachfrage", "Trend", "Abdeckung", "Kontext", "Empfehlung"],
    rows: [
      {
        key: "demand-1",
        tone: "warning",
        cells: [
          { main: "SAP S/4HANA + Programmmanagement", tags: ["SAP S/4HANA", "Programmmanagement", "SAP FI/CO"], meta: "häufig offen: Transformation, Cutover" },
          { main: "12 Bedarfe · 29 %", meta: "9 externe Nachfrager · zuletzt heute" },
          { main: "+71 %", meta: "7 im Vorzeitraum" },
          { main: "Ø 0,7 Vorschläge", meta: "58 % ohne verlässliches Match" },
          { main: "Hybrid / Vor Ort", meta: "München · Frankfurt · Deutsch" },
          { badge: { label: "Beschaffen", tone: "warning" }, meta: "Kandidatenbeschaffung priorisieren" },
        ],
      },
      {
        key: "demand-2",
        tone: "warning",
        cells: [
          { main: "HubSpot + RevOps", tags: ["HubSpot", "Revenue Operations", "CRM"], meta: "häufig offen: Lifecycle Automation" },
          { main: "9 Bedarfe · 21 %", meta: "7 externe Nachfrager · gestern" },
          { main: "Neu", meta: "zuvor kein Bedarf" },
          { main: "Ø 1,3 Vorschläge", meta: "33 % ohne verlässliches Match" },
          { main: "Remote / Hybrid", meta: "DACH · Deutsch / Englisch" },
          { badge: { label: "Lücke prüfen", tone: "warning" }, meta: "Katalog und Pflichtskills prüfen" },
        ],
      },
      {
        key: "demand-3",
        tone: "accent",
        cells: [
          { main: "FP&A + Controlling", tags: ["FP&A", "Controlling", "M&A"], meta: "keine wiederkehrende Kernlücke" },
          { main: "7 Bedarfe · 17 %", meta: "6 externe Nachfrager · vor 3 Tagen" },
          { main: "−22 %", meta: "9 im Vorzeitraum" },
          { main: "Ø 2,6 Vorschläge", meta: "0 % ohne verlässliches Match" },
          { main: "Hybrid", meta: "Hamburg · Berlin · Deutsch" },
          { badge: { label: "Abgedeckt", tone: "accent" }, meta: "Bestand beobachten" },
        ],
      },
    ],
  },
  profiles: {
    eyebrow: "Admin / Analyse",
    title: "Profil-Performance",
    description:
      "Reichweite, Interesse und Konversion bilden eine lesbare Kette. Bereitschaftsprobleme stehen direkt am Profil.",
    metrics: [
      { label: "Sichtbare Profile", value: "48", detail: "42 vollständig" },
      { label: "Mit Reichweite", value: "31", detail: "im Zeitraum gezeigt", tone: "accent" },
      { label: "Mit Interesse", value: "9", detail: "Kontakt oder Shortlist" },
      { label: "Terminbuchungen", value: "3", detail: "aus Profilinteraktionen", tone: "warning" },
    ],
    filters: ["30 Tage", "Alle Profile", "Konversion"],
    sectionTitle: "Profile nach Wirkung",
    sectionDescription: "Bereitschaft vor Reichweite; Reichweite vor Konversion.",
    resultLabel: "48 Profile",
    columns: ["Profil", "Bereitschaft", "Reichweite", "Interesse", "Konversion", "Letzte Aktivität"],
    rows: [
      {
        key: "profile-1",
        tone: "accent",
        cells: [
          { main: "Mara Hoffmann", meta: "Senior Product Designer · Berlin" },
          { badge: { label: "Einsatzbereit", tone: "accent" }, meta: "Terminlink vorhanden" },
          { main: "126 Ansichten", meta: "34 Shortlist-Impressionen" },
          { main: "12 Kontakte", meta: "9,5 % Kontaktrate" },
          { main: "3 Buchungen", meta: "25 % aus Kontakten" },
          { main: "Heute, 08:54" },
        ],
      },
      {
        key: "profile-2",
        cells: [
          { main: "David Kern", meta: "Data Engineer · Remote" },
          { badge: { label: "Einsatzbereit", tone: "accent" }, meta: "ab sofort" },
          { main: "64 Ansichten", meta: "21 Shortlist-Impressionen" },
          { main: "4 Kontakte", meta: "6,3 % Kontaktrate" },
          { main: "1 Buchung", meta: "25 % aus Kontakten" },
          { main: "Gestern, 15:20" },
        ],
      },
      {
        key: "profile-3",
        tone: "warning",
        cells: [
          { main: "Selin Yilmaz", meta: "Change Managerin · Köln" },
          { badge: { label: "Blockiert", tone: "warning" }, meta: "Terminlink fehlt" },
          { main: "0 Ansichten", meta: "noch nie ausgespielt" },
          { main: "0 Kontakte" },
          { main: "0 Buchungen" },
          { main: "Vor 16 Tagen" },
        ],
      },
    ],
  },
  freelancers: {
    eyebrow: "Admin / Arbeit",
    title: "Bewerbungen",
    description:
      "Offene Entscheidungen zuerst: Profilstand, fehlende Unterlagen und Freigabeaktion sind ohne Seitwärtsscrollen sichtbar.",
    metrics: [
      { label: "Neu eingegangen", value: "7", detail: "noch nicht geprüft", tone: "warning" },
      { label: "In Prüfung", value: "3", detail: "aktive Entscheidungen", tone: "accent" },
      { label: "Freigegeben", value: "48", detail: "im Matching sichtbar" },
      { label: "Abgelehnt", value: "11", detail: "abgeschlossene Fälle", tone: "muted" },
    ],
    filters: ["Alle", "Neu", "In Prüfung", "Freigegeben"],
    sectionTitle: "Offene Bewerbungen",
    sectionDescription: "Kandidatenprofil, Einsatzdaten und fehlende Unterlagen in einer Zeile.",
    resultLabel: "10 offene Fälle",
    columns: ["Kandidat", "Kompetenzen", "Einsatz", "Profilstand", "Eingang & Status", "Aktion"],
    rows: [
      {
        key: "application-1",
        tone: "warning",
        cells: [
          { main: "Tobias Winter", meta: "Interim CFO · Hamburg · tobias@example.test" },
          { tags: ["FP&A", "M&A", "Controlling", "+3"] },
          { main: "1.450 € / Tag", meta: "ab sofort" },
          { badge: { label: "2 / 3", tone: "warning" }, meta: "Terminlink fehlt" },
          { badge: { label: "Neu", tone: "warning" }, meta: "Heute, 08:12" },
          { action: "Prüfen →" },
        ],
      },
      {
        key: "application-2",
        tone: "accent",
        cells: [
          { main: "Mina Özdemir", meta: "CRM Lead · Remote · mina@example.test" },
          { tags: ["HubSpot", "Lifecycle", "RevOps"] },
          { main: "980 € / Tag", meta: "ab 15.09." },
          { badge: { label: "Vollständig", tone: "accent" }, meta: "CV · Honorar · Terminlink" },
          { badge: { label: "In Prüfung", tone: "accent" }, meta: "Gestern, 17:34" },
          { action: "Fortsetzen →" },
        ],
      },
      {
        key: "application-3",
        tone: "warning",
        cells: [
          { main: "Lars König", meta: "Cloud Architect · München · lars@example.test" },
          { tags: ["AWS", "Kubernetes", "FinOps", "+2"] },
          { main: "Honorar fehlt", meta: "in 2 Wochen" },
          { badge: { label: "1 / 3", tone: "danger" }, meta: "CV und Honorar fehlen" },
          { badge: { label: "Neu", tone: "warning" }, meta: "Vor 2 Tagen" },
          { action: "Prüfen →" },
        ],
      },
    ],
  },
  leads: {
    eyebrow: "Admin / Arbeit",
    title: "Sales-Pipeline",
    description:
      "Offene Leads sind nach nächstem sinnvollen Schritt sortiert. Automatischer Versand wird ausdrücklich als Versandaktion benannt.",
    metrics: [
      { label: "Offen", value: "64", detail: "bearbeitbare Leads", tone: "accent" },
      { label: "Neu", value: "18", detail: "noch ohne Kontakt", tone: "warning" },
      { label: "Kontaktiert", value: "29", detail: "Follow-up prüfen" },
      { label: "Archiv", value: "12", detail: "nicht weiter verfolgen", tone: "muted" },
    ],
    filters: ["Suche: fintech", "Status: Offen", "Kategorie: Alle"],
    sectionTitle: "Offene Opportunities",
    sectionDescription: "Konto, Kontakt, nächster Schritt und Aktivität ohne CRM-Rauschen.",
    resultLabel: "64 Leads · Seite 1 von 7",
    columns: ["Unternehmen & Kontakt", "Segment", "Status & nächster Schritt", "Aktivität", "Aktion"],
    rows: [
      {
        key: "lead-1",
        tone: "warning",
        cells: [
          { main: "Northstar Payments", meta: "Julia Stein · Head of Operations" },
          { tags: ["Fintech", "51–200", "Berlin"] },
          { badge: { label: "Neu", tone: "warning" }, meta: "Erstkontakt vorbereiten" },
          { main: "Heute erstellt", meta: "noch keine Nachricht" },
          { action: "Öffnen →" },
        ],
      },
      {
        key: "lead-2",
        tone: "accent",
        cells: [
          { main: "Evertide Energy", meta: "Martin Groß · People Director" },
          { tags: ["Energy", "201–500", "Hamburg"] },
          { badge: { label: "Kontaktiert", tone: "accent" }, meta: "Follow-up in 2 Tagen" },
          { main: "E-Mail vor 3 Tagen", meta: "geöffnet · keine Antwort" },
          { action: "Follow-up →" },
        ],
      },
      {
        key: "lead-3",
        cells: [
          { main: "Studio Orbit", meta: "Nina Faust · Managing Director" },
          { tags: ["Creative", "11–50", "Köln"] },
          { badge: { label: "Qualifiziert" }, meta: "Bedarf konkretisieren" },
          { main: "Notiz gestern", meta: "Interim Product Lead gesucht" },
          { action: "Bearbeiten →" },
        ],
      },
    ],
  },
  outreach: {
    eyebrow: "Admin / Betrieb",
    title: "Informationspflicht",
    description:
      "Überfällige und bald fällige Fälle stehen oben; bereits informierte Personen bleiben zur Nachvollziehbarkeit am Ende.",
    metrics: [
      { label: "Überfällig", value: "3", detail: "heute bearbeiten", tone: "danger" },
      { label: "Bald fällig", value: "5", detail: "höchstens 3 Tage", tone: "warning" },
      { label: "Offen", value: "27", detail: "innerhalb der Frist" },
      { label: "Informiert", value: "41", detail: "nachweisbar erledigt", tone: "muted" },
    ],
    filters: ["Offene zuerst", "Alle Quellen", "30 Tage"],
    sectionTitle: "Fristen nach Dringlichkeit",
    sectionDescription: "Friststatus, Erhebungszeitpunkt und Quellennachweis pro Person.",
    resultLabel: "35 offene Fälle",
    columns: ["Person", "Frist", "Status", "Recherchiert", "Quellen"],
    rows: [
      {
        key: "outreach-1",
        tone: "danger",
        cells: [
          { main: "Dr. Eva Brandt", meta: "e.brandt@example.test" },
          { main: "Vor 2 Tagen", meta: "02.09.2026" },
          { badge: { label: "Überfällig", tone: "danger" }, meta: "Information senden" },
          { main: "19.08.2026", meta: "LinkedIn · Firmenwebsite" },
          { tags: ["linkedin.com", "northstar.de"] },
        ],
      },
      {
        key: "outreach-2",
        tone: "warning",
        cells: [
          { main: "Felix Maurer", meta: "f.maurer@example.test" },
          { main: "Morgen", meta: "05.09.2026" },
          { badge: { label: "Bald fällig", tone: "warning" }, meta: "Entwurf prüfen" },
          { main: "22.08.2026", meta: "Unternehmensseite" },
          { tags: ["evertide.energy"] },
        ],
      },
      {
        key: "outreach-3",
        tone: "muted",
        cells: [
          { main: "Carla Mertens", meta: "c.mertens@example.test" },
          { main: "Erledigt", meta: "gesendet 28.08.2026" },
          { badge: { label: "Informiert", tone: "muted" }, meta: "Nachweis vorhanden" },
          { main: "14.08.2026", meta: "Branchenverzeichnis" },
          { tags: ["industry-network.eu"] },
        ],
      },
    ],
  },
  "ai-usage": {
    eyebrow: "Admin / Betrieb",
    title: "AI-Kosten & Kontingente",
    description:
      "Externe Kundennutzung und wirksame Monats-Credits zuerst. Interne Testkosten und historische Guthaben bleiben separat nachprüfbar.",
    metrics: [
      { label: "Externe Plattformkosten", value: "$ 42,18", detail: "Text-Tokens + Websuchen", tone: "accent" },
      { label: "Davon Websuchen", value: "$ 12,40", detail: "248 Suchaufrufe" },
      { label: "Provider bestätigt", value: "92 %", detail: "der Antworten" },
      { label: "Fehlversuche", value: "2,1 %", detail: "8 von 382", tone: "warning" },
    ],
    filters: ["01.08.–04.09.", "Mit Nutzung", "1 internes Konto separat", "Sortierung: Kosten"],
    sectionTitle: "Nutzer & wirksame Kontingente",
    sectionDescription: "Gesamtnutzung und Gesamtkosten statt vier separater Token-Spalten.",
    resultLabel: "39 aktive externe Konten",
    columns: ["Nutzer", "Stufe", "Monats-Credits", "Nutzung", "Gesamtkosten", "Credits belastet", "Letzte Nutzung"],
    rows: [
      {
        key: "ai-1",
        tone: "accent",
        cells: [
          { main: "anna@northstar.de", meta: "usr_8fa…92c" },
          { badge: { label: "Scale", tone: "accent" }, meta: "2.000 Credits / Monat" },
          { main: "1.420 / 2.000", meta: "580 genutzt · 0 reserviert" },
          { main: "428.340 Tokens", meta: "92 % bestätigt · 18 Recherchen" },
          { main: "$ 8,72", meta: "Tokens + Websuchen" },
          { main: "580" },
          { main: "Heute, 09:42" },
        ],
      },
      {
        key: "ai-2",
        cells: [
          { main: "jonas@atelier.io", meta: "usr_4b1…71d" },
          { badge: { label: "Starter" }, meta: "500 Credits / Monat" },
          { main: "420 / 500", meta: "80 genutzt · 0 reserviert" },
          { main: "91.220 Tokens", meta: "100 % bestätigt · 2 Recherchen" },
          { main: "$ 1,94", meta: "Tokens + Websuchen" },
          { main: "80" },
          { main: "Gestern, 16:08" },
        ],
      },
      {
        key: "ai-3",
        tone: "warning",
        cells: [
          { main: "gast_7c2…", meta: "anonymer Gast" },
          { badge: { label: "Gast", tone: "muted" }, meta: "100 Credits / Monat" },
          { main: "8 / 100", meta: "92 genutzt" },
          { main: "38.440 Tokens", meta: "71 % bestätigt · 4 Recherchen" },
          { main: "$ 1,12", meta: "Tokens + Websuchen" },
          { main: "92" },
          { main: "Vor 4 Tagen" },
        ],
      },
    ],
  },
};

function Cell({ cell }: { cell: PreviewCell }) {
  return (
    <div className={styles.cellContent}>
      {cell.badge ? (
        <span className={styles.badge} data-tone={cell.badge.tone ?? "default"}>
          {cell.badge.label}
        </span>
      ) : null}
      {cell.main ? <strong>{cell.main}</strong> : null}
      {cell.tags ? (
        <span className={styles.tags}>
          {cell.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </span>
      ) : null}
      {cell.meta ? <small>{cell.meta}</small> : null}
      {cell.action ? <span className={styles.action}>{cell.action}</span> : null}
    </div>
  );
}

export function AdminPagesPreview({ view }: { view: AdminPreviewView }) {
  const config = CONFIGS[view];

  return (
    <main className={styles.shell}>
      <div className={styles.localBanner} role="status">
        <span>Lokale Vorschau</span>
        <strong>Testdaten · keine Supabase-Verbindung · keine Aktionen</strong>
      </div>

      <AdminPageHeader
        eyebrow={config.eyebrow}
        title={config.title}
        description={<p>{config.description}</p>}
        backHref={null}
      />

      <AdminMetricStrip label={`${config.title}: wichtigste Signale`} items={config.metrics} />

      <div className={styles.filterDeck} aria-label="Vorschau der Filter">
        <span className={styles.filterLabel}>Ansicht</span>
        <div className={styles.filterValues}>
          {config.filters.map((filter, index) => (
            <span data-active={index === 0} key={filter}>{filter}</span>
          ))}
        </div>
        <span className={styles.filterHint}>rein visuelle Testdaten</span>
      </div>

      <AdminSectionHeader
        title={config.sectionTitle}
        description={config.sectionDescription}
        aside={config.resultLabel}
      />

      <section className={styles.panel} aria-label={config.sectionTitle}>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                {config.columns.map((column) => <th key={column}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row) => (
                <tr data-tone={row.tone ?? "default"} key={row.key}>
                  {row.cells.map((cell, index) => (
                    <td data-label={config.columns[index]} key={`${row.key}-${config.columns[index]}`}>
                      <Cell cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className={styles.previewNote}>
        Diese Route zeigt ausschließlich die neue Informationshierarchie. Die
        echten Admin-Seiten behalten Authentifizierung, Audit-Logik und ihre
        serverseitigen Datenabfragen.
      </p>
    </main>
  );
}
