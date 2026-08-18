import {
  IconArrowRight,
  IconCheck,
  IconInfo,
  IconSpark,
} from "@/components/icons";

export type AgentTask = {
  id: string;
  title: string;
  summary: string;
  outcome: string;
};

export type AgentDefinition = {
  id: string;
  glyph: string;
  category: string;
  title: string;
  summary: string;
  description: string;
  capabilities: readonly string[];
  tasks: readonly AgentTask[];
  featured?: boolean;
};

export const agentCatalog: readonly AgentDefinition[] = [
  {
    id: "account-project-management",
    glyph: "PM",
    category: "Steuerung",
    title: "Account & Projektmanagement",
    summary:
      "Klärt Ziele, Verantwortlichkeiten und nächste Schritte, wenn Anspruch, Zeit und Ressourcen miteinander konkurrieren.",
    description:
      "Dieser Agent strukturiert komplexe Vorhaben in pragmatische Entscheidungen. Er verbindet Kundenanforderungen, Research, Datenarbeit und kreative Umsetzung zu einem belastbaren Arbeitsplan und macht Abhängigkeiten sowie offene Freigaben sichtbar.",
    capabilities: [
      "Projektziele und Entscheidungsbedarf strukturieren",
      "Verantwortlichkeiten und Abhängigkeiten klären",
      "Research-, Daten- und Kreativarbeit koordinieren",
    ],
    tasks: [
      {
        id: "project-kickoff",
        title: "Projekt-Kick-off vorbereiten",
        summary: "Ziel, Scope, Rollen, Risiken und nächste Entscheidungen aus einem Briefing ableiten.",
        outcome: "Ein priorisierter Kick-off-Plan mit Verantwortlichkeiten und offenen Punkten.",
      },
      {
        id: "resource-reality-check",
        title: "Ambition gegen Ressourcen prüfen",
        summary: "Vorhaben auf Aufwand, Abhängigkeiten und realistische Lieferstufen prüfen.",
        outcome: "Ein pragmatischer Vorschlag für Umfang, Reihenfolge und Entscheidungszeitpunkte.",
      },
    ],
  },
  {
    id: "marketing-research",
    glyph: "RI",
    category: "Research",
    title: "Marketing Research & Insights",
    summary:
      "Verdichtet Markt-, Wettbewerbs-, Zielgruppen- und Markeninformationen zu klaren, entscheidbaren Erkenntnissen.",
    description:
      "Dieser Agent kombiniert methodische Recherche mit einer direkten, story-orientierten Darstellung. Er trennt belegte Erkenntnisse von Annahmen und bereitet Markt- und Zielgruppensignale so auf, dass Teams schneller entscheiden können.",
    capabilities: [
      "Wettbewerbslandschaften und Marktpositionen analysieren",
      "Zielgruppen, Bedürfnisse und Nutzungskontexte strukturieren",
      "Erkenntnisse als belastbare Entscheidungsstory aufbereiten",
    ],
    tasks: [
      {
        id: "competitive-landscape",
        title: "Wettbewerbslandschaft erstellen",
        summary: "Anbieter, Positionierungen, Versprechen und erkennbare Marktlücken vergleichen.",
        outcome: "Eine nachvollziehbare Wettbewerbsübersicht mit Chancen und offenen Recherchefragen.",
      },
      {
        id: "audience-profile",
        title: "Zielgruppenprofil schärfen",
        summary: "Vorhandene Daten und Hypothesen in Bedürfnisse, Barrieren und Entscheidungsmuster übersetzen.",
        outcome: "Ein priorisiertes Zielgruppenbild mit klar gekennzeichnetem Evidenzstatus.",
      },
    ],
  },
  {
    id: "data-visualization-coding",
    glyph: "DV",
    category: "Data & Code",
    title: "Datenvisualisierung & Coding",
    summary:
      "Verwandelt Rohdaten und Rechercheergebnisse in verständliche Dashboards, Visualisierungen und interaktive Datenstories.",
    description:
      "Dieser Agent verbindet sauberen Frontend-Code mit Informationsdesign. Er wählt Visualisierungen nach Aussage und Zielgruppe aus, statt Daten lediglich dekorativ darzustellen, und dokumentiert Datenquellen sowie Berechnungslogik.",
    capabilities: [
      "Interaktive HTML-Dashboards konzipieren",
      "Diagramme und Datenstories passend zur Aussage auswählen",
      "Datenlogik, Quellen und Grenzen transparent dokumentieren",
    ],
    tasks: [
      {
        id: "dashboard-blueprint",
        title: "Dashboard-Blueprint entwickeln",
        summary: "Zielgruppen, Kennzahlen, Interaktionen und benötigte Datenquellen definieren.",
        outcome: "Eine umsetzbare Dashboard-Struktur mit Komponenten und Datenanforderungen.",
      },
      {
        id: "data-story",
        title: "Datenstory strukturieren",
        summary: "Ergebnisse in eine klare Abfolge aus Kontext, Signal, Erklärung und Handlung übersetzen.",
        outcome: "Ein Storyboard für Charts, Text und interaktive Vertiefungen.",
      },
    ],
  },
  {
    id: "customer-experience-growth",
    glyph: "CX",
    category: "Experience",
    title: "Customer Experience & Growth",
    summary:
      "Verbindet Customer Journeys, Media, Lead Nurturing und Search zu einem konsistenten Erlebnis über alle Kanäle.",
    description:
      "Dieser Agent betrachtet Kontakte nicht als isolierte Kampagnenpunkte. Er ordnet Botschaften, Medien, Übergaben und Suchintentionen entlang der Customer Journey und identifiziert Brüche, Prioritäten und messbare nächste Schritte.",
    capabilities: [
      "Customer Journeys und kritische Übergänge modellieren",
      "Media- und Search-Strategien auf Nutzerintentionen ausrichten",
      "Lead-Nurturing-Strecken und Messpunkte strukturieren",
    ],
    tasks: [
      {
        id: "journey-audit",
        title: "Customer Journey prüfen",
        summary: "Touchpoints, Fragen, Barrieren und Übergaben über den Funnel hinweg analysieren.",
        outcome: "Eine priorisierte Journey mit Reibungspunkten und konkreten Verbesserungsfeldern.",
      },
      {
        id: "search-growth-plan",
        title: "Search-&-Growth-Plan skizzieren",
        summary: "Suchintentionen, Content-Bedarf, Kanäle und Conversion-Schritte zusammenführen.",
        outcome: "Ein abgestimmter Plan für Sichtbarkeit, Aktivierung und Weiterentwicklung.",
      },
    ],
  },
  {
    id: "creative-brand-direction",
    glyph: "CD",
    category: "Creative",
    title: "Creative Direction & Brand",
    summary:
      "Entwickelt kreative Leitideen, Markenidentitäten und präsentationsreife Inhalte vom Kampagnenkonzept bis zum Brand Book.",
    description:
      "Dieser Agent übersetzt Strategie in eine erkennbare kreative Richtung. Er verbindet Markenlogik, Tonalität, visuelle Prinzipien und konkrete Anwendungen, damit Ideen nicht nur inspirieren, sondern konsistent präsentiert und umgesetzt werden können.",
    capabilities: [
      "Kreative Leitideen und Kampagnenrouten entwickeln",
      "Markenidentität, Tonalität und Gestaltungsprinzipien schärfen",
      "Pitch Decks, Brand Books und Kundeninhalte strukturieren",
    ],
    tasks: [
      {
        id: "campaign-routes",
        title: "Kampagnenrouten entwickeln",
        summary: "Mehrere strategisch unterscheidbare kreative Richtungen aus einem Briefing ableiten.",
        outcome: "Vergleichbare Kampagnenrouten mit Idee, Begründung und möglichen Anwendungen.",
      },
      {
        id: "brand-deck-outline",
        title: "Brand- oder Pitch-Deck aufbauen",
        summary: "Argumentation, Kapitelstruktur und benötigte Belege für eine Präsentation definieren.",
        outcome: "Eine präsentationsreife Gliederung mit Kernaussagen und Content-Bedarf.",
      },
    ],
  },
  {
    id: "eu-packaging-traceability",
    glyph: "EU",
    category: "Commerce Compliance",
    title: "EU-Verpackungsverfolgung für Händler",
    summary:
      "Strukturiert Verpackungsdaten, Nachweise und länderspezifische Prüfpunkte für Händler und Marktplatzprozesse in der EU.",
    description:
      "Dieser Agent hilft Händlern, Produkt- und Verpackungsinformationen nachvollziehbar zu erfassen, Nachweise zuzuordnen und offene Anforderungen nach Zielmarkt sichtbar zu machen. Er ersetzt keine Rechtsberatung: Rechtslage, Plattformregeln und Fristen müssen vor einer Entscheidung anhand aktueller Primärquellen bestätigt werden.",
    capabilities: [
      "Verpackungsarten, Materialien und Nachweise je Produkt strukturieren",
      "Offene Prüfpunkte nach Zielmarkt und Vertriebskanal sichtbar machen",
      "Datenanforderungen für Marktplatz-, Lieferanten- und Auditprozesse vorbereiten",
    ],
    tasks: [
      {
        id: "packaging-data-check",
        title: "Verpackungsdaten-Check vorbereiten",
        summary: "Vorhandene Produkt-, Material- und Lieferantendaten auf Vollständigkeit und Zuordnung prüfen.",
        outcome: "Eine strukturierte Lückenliste für Verpackungsdaten und erforderliche Nachweise.",
      },
      {
        id: "market-requirement-map",
        title: "Zielmarkt-Prüfmatrix erstellen",
        summary: "Produkte, Märkte, Verkaufskanäle und noch zu bestätigende Anforderungen zusammenführen.",
        outcome: "Eine nachvollziehbare Prüfmatrix ohne ungeprüfte rechtliche Zusagen.",
      },
      {
        id: "marketplace-evidence-pack",
        title: "Marktplatz-Nachweispaket strukturieren",
        summary: "Dokumente, Verantwortlichkeiten und Aktualisierungsstatus für Listings und Prüfungen ordnen.",
        outcome: "Ein auditierbarer Nachweisplan mit Quellen-, Status- und Verantwortlichkeitsfeldern.",
      },
    ],
    featured: true,
  },
] as const;

export function agentById(id: string | null): AgentDefinition {
  return agentCatalog.find((agent) => agent.id === id) ?? agentCatalog[0]!;
}

export function agentTaskById(
  agent: AgentDefinition,
  taskId: string | null,
): AgentTask {
  return agent.tasks.find((task) => task.id === taskId) ?? agent.tasks[0]!;
}

export function AgentDirectory({
  selectedAgentId,
  selectedTaskId,
  onSelectAgent,
  onSelectTask,
}: {
  selectedAgentId: string;
  selectedTaskId: string;
  onSelectAgent: (agent: AgentDefinition) => void;
  onSelectTask: (agent: AgentDefinition, task: AgentTask) => void;
}) {
  const selectedAgent = agentById(selectedAgentId);

  return (
    <section className="agent-directory" aria-labelledby="agent-directory-title">
      <div className="agent-directory-hero">
        <span className="agent-directory-mark" aria-hidden="true"><IconSpark size={22} /></span>
        <p className="eyebrow">Spezialisierte Arbeitsbereiche</p>
        <h1 id="agent-directory-title">Der passende KI-Agent für die nächste Aufgabe.</h1>
        <p>
          Wählen Sie eine funktionale Rolle. Ein Klick öffnet Aufgaben, Fähigkeiten und Grenzen –
          ohne erfundene Personenprofile und ohne eine Aktion im Hintergrund zu starten.
        </p>
      </div>

      <div className="agent-card-grid" aria-label="Verfügbare KI-Agenten">
        {agentCatalog.map((agent) => {
          const selected = agent.id === selectedAgent.id;
          return (
            <button
              key={agent.id}
              className={`agent-card${selected ? " is-selected" : ""}${agent.featured ? " is-featured" : ""}`}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectAgent(agent)}
            >
              <span className="agent-card-topline">
                <span className="agent-card-glyph" aria-hidden="true">{agent.glyph}</span>
                <span className="agent-card-category">{agent.category}</span>
                {agent.featured ? <span className="agent-card-featured">Für Händler</span> : null}
              </span>
              <strong>{agent.title}</strong>
              <span className="agent-card-summary">{agent.summary}</span>
              <span className="agent-card-action">
                Details ansehen <IconArrowRight size={14} />
              </span>
            </button>
          );
        })}
      </div>

      <section className="ready-task-section" aria-labelledby="ready-task-title">
        <div className="ready-task-heading">
          <div>
            <p className="eyebrow">{selectedAgent.category}</p>
            <h2 id="ready-task-title">Ready-To-Run Tasks</h2>
          </div>
          <span>{selectedAgent.title}</span>
        </div>
        <div className="ready-task-grid">
          {selectedAgent.tasks.map((task) => {
            const selected = task.id === selectedTaskId;
            return (
              <button
                key={task.id}
                className={`ready-task-card${selected ? " is-selected" : ""}`}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectTask(selectedAgent, task)}
              >
                <span aria-hidden="true"><IconCheck size={14} /></span>
                <strong>{task.title}</strong>
                <small>{task.summary}</small>
                <span>Task-Vorlage öffnen <IconArrowRight size={13} /></span>
              </button>
            );
          })}
        </div>
      </section>
    </section>
  );
}

export function AgentDetails({
  agent,
  task,
}: {
  agent: AgentDefinition;
  task: AgentTask;
}) {
  return (
    <div className="details-inner agent-details-inner">
      <div className="details-header">
        <div>
          <p>KI-Agent</p>
          <h2>Details</h2>
        </div>
        <span className="agent-preview-status">Vorschau</span>
      </div>

      <div className="agent-detail-identity">
        <span aria-hidden="true">{agent.glyph}</span>
        <div>
          <small>{agent.category}</small>
          <h3>{agent.title}</h3>
        </div>
      </div>

      <p className="agent-detail-description">{agent.description}</p>

      <section className="agent-capability-list" aria-labelledby="agent-capabilities-title">
        <h4 id="agent-capabilities-title">Wobei dieser Agent unterstützt</h4>
        <ul>
          {agent.capabilities.map((capability) => (
            <li key={capability}><IconCheck size={13} /> <span>{capability}</span></li>
          ))}
        </ul>
      </section>

      <section className="agent-task-preview" aria-labelledby="agent-task-preview-title">
        <p>Ausgewählte Task-Vorlage</p>
        <h4 id="agent-task-preview-title">{task.title}</h4>
        <span>{task.summary}</span>
        <strong>Ergebnis</strong>
        <span>{task.outcome}</span>
      </section>

      <div className="agent-execution-note">
        <IconInfo size={16} />
        <p>
          <strong>Noch keine autonome Ausführung.</strong>
          Das Öffnen einer Vorlage überträgt keine Daten und startet keine externe Aktion.
          Laufzeit, Datenquellen und Freigaben werden separat aktiviert.
        </p>
      </div>
    </div>
  );
}
