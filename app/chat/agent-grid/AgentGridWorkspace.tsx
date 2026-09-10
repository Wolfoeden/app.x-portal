"use client";

import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { BrandMark } from "@/components/BrandMark";
import {
  IconAlertCircle,
  IconCheck,
  IconClose,
  IconPen,
  IconPlus,
  IconSpark,
} from "@/components/icons";
import {
  AgentGridAnalysisResponseSchema,
  DEMO_CURRENT_BLUEPRINT,
  DEMO_DISCOVERY_CARDS,
  DEMO_TARGET_BLUEPRINT,
  DISCOVERY_CARD_LABELS,
  PROCESS_NODE_LABELS,
  type DiscoveryCard,
  type DiscoveryCardType,
  type ProcessBlueprint,
  type ProcessNode,
} from "@/lib/agent-grid/blueprint";
import { processBlueprintToBpmnXml } from "@/lib/agent-grid/bpmn";
import {
  calculateProcessEconomics,
  parseNonNegativeDecimal,
} from "@/lib/agent-grid/economics";
import { appPath } from "@/lib/app-path";

import { AgentGridCanvas } from "./AgentGridCanvas";
import styles from "./agent-grid.module.css";

type ProcessView = "current" | "target";

type WorkspaceSnapshot = {
  useCase: string;
  company: string;
  note: string;
  volume: string;
  minutes: string;
  hourlyCost: string;
  automationDegree: string;
  cards: DiscoveryCard[];
  currentBlueprint: ProcessBlueprint | null;
  targetBlueprint: ProcessBlueprint | null;
  suggestions: DiscoveryCard[];
  activeView: ProcessView;
};

type ReadinessItem = {
  label: string;
  ready: boolean;
};

const CARD_TYPES = Object.keys(
  DISCOVERY_CARD_LABELS,
) as DiscoveryCardType[];

function readinessItems(
  useCase: string,
  cards: readonly DiscoveryCard[],
  blueprint: ProcessBlueprint | null,
  hasEconomics: boolean,
): ReadinessItem[] {
  const hasCard = (type: DiscoveryCardType) =>
    cards.some((card) => card.type === type);
  const nodes = blueprint?.nodes ?? [];
  const centralSteps = nodes.filter(
    (node) => !["start", "end", "data_source"].includes(node.type),
  );
  return [
    {
      label: "Klares Prozessziel",
      ready: Boolean(useCase.trim() || blueprint?.mission.trim()),
    },
    { label: "Startpunkt bekannt", ready: nodes.some((node) => node.type === "start") },
    { label: "Endergebnis bekannt", ready: nodes.some((node) => node.type === "end") },
    { label: "Zentrale Schritte bekannt", ready: centralSteps.length >= 3 },
    {
      label: "Systeme bekannt",
      ready: Boolean(blueprint?.systems.length || hasCard("system")),
    },
    {
      label: "Datenquellen bekannt",
      ready: Boolean(blueprint?.dataSources.length || hasCard("data_source")),
    },
    {
      label: "Entscheidungen bekannt",
      ready:
        hasCard("decision") ||
        nodes.some((node) => ["gateway", "business_rule"].includes(node.type)),
    },
    { label: "Ausnahmen bekannt", ready: hasCard("exception") },
    {
      label: "Human Approvals bekannt",
      ready:
        hasCard("human_approval") ||
        nodes.some((node) => node.type === "approval"),
    },
    {
      label: "Volumen / Kosten bekannt",
      ready: hasEconomics || hasCard("cost_volume"),
    },
  ];
}

function euro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function mergeSuggestions(
  current: readonly DiscoveryCard[],
  additions: readonly DiscoveryCard[],
): DiscoveryCard[] {
  const known = new Set(
    current.map(
      (card) => `${card.type}:${card.title.trim().toLocaleLowerCase("de")}`,
    ),
  );
  return additions.filter(
    (card) =>
      !known.has(`${card.type}:${card.title.trim().toLocaleLowerCase("de")}`),
  );
}

function BlueprintList({
  title,
  values,
  empty,
  tone,
}: {
  title: string;
  values: readonly string[];
  empty: string;
  tone?: "warning";
}) {
  return (
    <section className={styles.blueprintSection} data-tone={tone}>
      <h3>{title}</h3>
      {values.length ? (
        <ul>
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyCopy}>{empty}</p>
      )}
    </section>
  );
}

function CardEditor({
  card,
  onSave,
  onCancel,
}: {
  card: DiscoveryCard;
  onSave: (title: string, description: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && title.trim()) onSave(title, description);
    if (event.key === "Escape") onCancel();
  }
  return (
    <div className={styles.cardEditor}>
      <label>
        Titel
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={keyDown}
        />
      </label>
      <label>
        Beschreibung (optional)
        <textarea
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className={styles.cardEditorActions}>
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
        <button
          type="button"
          onClick={() => onSave(title, description)}
          disabled={!title.trim()}
        >
          Speichern
        </button>
      </div>
    </div>
  );
}

export function AgentGridWorkspace({
  initialDemo = false,
}: {
  initialDemo?: boolean;
}) {
  const [useCase, setUseCase] = useState(initialDemo ? "Mieter-Service" : "");
  const [company, setCompany] = useState(
    initialDemo ? "Demo Hausverwaltung" : "",
  );
  const [note, setNote] = useState("");
  const [cards, setCards] = useState<DiscoveryCard[]>(
    initialDemo ? DEMO_DISCOVERY_CARDS : [],
  );
  const [suggestions, setSuggestions] = useState<DiscoveryCard[]>([]);
  const [currentBlueprint, setCurrentBlueprint] =
    useState<ProcessBlueprint | null>(
      initialDemo ? DEMO_CURRENT_BLUEPRINT : null,
    );
  const [targetBlueprint, setTargetBlueprint] =
    useState<ProcessBlueprint | null>(
      initialDemo ? DEMO_TARGET_BLUEPRINT : null,
    );
  const [activeView, setActiveView] = useState<ProcessView>("current");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [manualType, setManualType] = useState<DiscoveryCardType | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [loading, setLoading] = useState<ProcessView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState("");
  const [minutes, setMinutes] = useState("");
  const [hourlyCost, setHourlyCost] = useState("");
  const [automationDegree, setAutomationDegree] = useState("");
  const [historyDepth, setHistoryDepth] = useState(0);
  const historyRef = useRef<WorkspaceSnapshot[]>([]);

  const activeBlueprint =
    activeView === "target" ? targetBlueprint : currentBlueprint;
  const bpmnXml = useMemo(
    () => (activeBlueprint ? processBlueprintToBpmnXml(activeBlueprint) : null),
    [activeBlueprint],
  );
  const selectedNode =
    activeBlueprint?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const { hoursPerMonth: hours, currentProcessCost: monthlyCost } =
    calculateProcessEconomics({
      volumePerMonth: volume,
      minutesPerCase: minutes,
      hourlyCost,
    });
  const hasEconomics =
    parseNonNegativeDecimal(volume) !== null &&
    parseNonNegativeDecimal(minutes) !== null &&
    parseNonNegativeDecimal(hourlyCost) !== null;
  const readiness = readinessItems(
    useCase,
    cards,
    currentBlueprint,
    hasEconomics,
  );
  const readinessCount = readiness.filter((item) => item.ready).length;
  const readinessPercent = readinessCount * 10;
  const missingCount = readiness.length - readinessCount;

  const removedNodes =
    activeView === "target" && currentBlueprint && targetBlueprint
      ? currentBlueprint.nodes.filter(
          (node) =>
            !["start", "end", "data_source"].includes(node.type) &&
            !targetBlueprint.nodes.some((candidate) => candidate.id === node.id),
        )
      : [];

  function currentSnapshot(): WorkspaceSnapshot {
    return {
      useCase,
      company,
      note,
      volume,
      minutes,
      hourlyCost,
      automationDegree,
      cards,
      currentBlueprint,
      targetBlueprint,
      suggestions,
      activeView,
    };
  }

  function remember(snapshot: WorkspaceSnapshot = currentSnapshot()) {
    historyRef.current = [...historyRef.current.slice(-19), snapshot];
    setHistoryDepth(historyRef.current.length);
  }

  function undo() {
    const previous = historyRef.current.at(-1);
    if (!previous) return;
    historyRef.current = historyRef.current.slice(0, -1);
    setHistoryDepth(historyRef.current.length);
    setUseCase(previous.useCase);
    setCompany(previous.company);
    setNote(previous.note);
    setVolume(previous.volume);
    setMinutes(previous.minutes);
    setHourlyCost(previous.hourlyCost);
    setAutomationDegree(previous.automationDegree);
    setCards(previous.cards);
    setCurrentBlueprint(previous.currentBlueprint);
    setTargetBlueprint(previous.targetBlueprint);
    setSuggestions(previous.suggestions);
    setActiveView(previous.activeView);
    setSelectedNodeId(null);
    setError(null);
  }

  async function requestAnalysis(mode: ProcessView) {
    const snapshot = currentSnapshot();
    if (mode === "current" && !note.trim() && cards.length === 0 && !currentBlueprint) {
      setError("Erfassen Sie zuerst eine Gesprächsnotiz oder eine Discovery-Karte.");
      return;
    }
    if (mode === "target" && !currentBlueprint) {
      setError("Erzeugen Sie zuerst einen IST-Prozess.");
      return;
    }
    setLoading(mode);
    setError(null);
    try {
      const response = await fetch(appPath("/api/agent-grid/analyze"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          mode,
          useCase,
          company,
          cards,
          newNote: mode === "current" ? note : "",
          currentBlueprint,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Die Analyse konnte nicht abgeschlossen werden.";
        throw new Error(message);
      }
      const result = AgentGridAnalysisResponseSchema.parse(body);
      remember(snapshot);
      if (mode === "current") {
        setCurrentBlueprint(result.blueprint);
        setTargetBlueprint(null);
        setSuggestions(mergeSuggestions(cards, result.suggestedCards));
        setActiveView("current");
        setNote("");
      } else {
        setTargetBlueprint(result.blueprint);
        setActiveView("target");
      }
      setSelectedNodeId(null);
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "Die Analyse konnte nicht abgeschlossen werden.",
      );
    } finally {
      setLoading(null);
    }
  }

  function addManualCard() {
    if (!manualType || !manualTitle.trim()) return;
    remember();
    setCards((current) => [
      ...current,
      {
        id: `manual-${Date.now()}-${current.length + 1}`,
        type: manualType,
        title: manualTitle.trim(),
        ...(manualDescription.trim()
          ? { description: manualDescription.trim() }
          : {}),
      },
    ]);
    setManualTitle("");
    setManualDescription("");
    setManualType(null);
    setTargetBlueprint(null);
  }

  function manualKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && manualTitle.trim()) addManualCard();
    if (event.key === "Escape") setManualType(null);
  }

  function acceptSuggestion(card: DiscoveryCard) {
    remember();
    setCards((current) => [
      ...current,
      { ...card, id: `accepted-${Date.now()}-${current.length + 1}` },
    ]);
    setSuggestions((current) => current.filter((item) => item.id !== card.id));
    setTargetBlueprint(null);
  }

  function dismissSuggestion(cardId: string) {
    remember();
    setSuggestions((current) => current.filter((item) => item.id !== cardId));
  }

  function removeCard(cardId: string) {
    remember();
    setCards((current) => current.filter((card) => card.id !== cardId));
    setSuggestions((current) => current.filter((card) => card.id !== cardId));
    setTargetBlueprint(null);
  }

  function saveCard(card: DiscoveryCard, title: string, description: string) {
    if (!title.trim()) return;
    remember();
    setCards((current) =>
      current.map((candidate) =>
        candidate.id === card.id
          ? {
              ...candidate,
              title: title.trim(),
              ...(description.trim()
                ? { description: description.trim() }
                : { description: undefined }),
            }
          : candidate,
      ),
    );
    setEditingCardId(null);
    setTargetBlueprint(null);
  }

  function loadDemo() {
    remember();
    setUseCase("Mieter-Service");
    setCompany("Demo Hausverwaltung");
    setCards(DEMO_DISCOVERY_CARDS);
    setCurrentBlueprint(DEMO_CURRENT_BLUEPRINT);
    setTargetBlueprint(DEMO_TARGET_BLUEPRINT);
    setSuggestions([]);
    setNote("");
    setVolume("");
    setMinutes("");
    setHourlyCost("");
    setAutomationDegree("");
    setActiveView("current");
    setSelectedNodeId(null);
    setError(null);
  }

  const aiTasks = activeBlueprint?.nodes.filter((node) => node.type === "ai_task") ?? [];
  const softwareTasks =
    activeBlueprint?.nodes.filter((node) =>
      ["service_task", "business_rule"].includes(node.type),
    ) ?? [];
  const humanTasks =
    activeBlueprint?.nodes.filter((node) => node.type === "human_task") ?? [];
  const approvals =
    activeBlueprint?.nodes.filter((node) => node.type === "approval") ?? [];

  return (
    <main className={styles.shell} id="main-content">
      <header className={styles.header}>
        <div className={styles.brandBlock}>
          <BrandMark height={30} />
          <div>
            <p className={styles.eyebrow}>Discovery workspace</p>
            <h1>XPORTAL Agent Grid</h1>
          </div>
        </div>
        <div className={styles.headerFields}>
          <label>
            Use Case
            <input
              value={useCase}
              onChange={(event) => setUseCase(event.target.value)}
              placeholder="z. B. Mieter-Service"
            />
          </label>
          <label>
            Unternehmen
            <input
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Unternehmen"
            />
          </label>
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.statusBadge}>Discovery</span>
          <button className={styles.demoButton} type="button" onClick={loadDemo}>
            Demo Prozess laden
          </button>
        </div>
      </header>

      <section className={styles.readinessBar} aria-label="Blueprint Readiness">
        <div className={styles.readinessLabel}>
          <span>Blueprint Readiness</span>
          <strong>{readinessPercent} %</strong>
          <small>
            {missingCount === 1
              ? "1 Information fehlt"
              : `${missingCount} Informationen fehlen`}
          </small>
        </div>
        <div className={styles.readinessRail}>
          {readiness.map((item, index) => (
            <span
              key={item.label}
              data-ready={item.ready}
              title={`${index + 1}. ${item.label}: ${item.ready ? "vorhanden" : "offen"}`}
            >
              <i>{String(index + 1).padStart(2, "0")}</i>
              {item.ready ? <IconCheck size={14} /> : <b />}
            </span>
          ))}
        </div>
        <button
          className={styles.undoButton}
          type="button"
          onClick={undo}
          disabled={historyDepth === 0 || Boolean(loading)}
        >
          ↶ Letzte Änderung
        </button>
      </section>

      <div className={styles.workspace}>
        <aside className={styles.discoveryPanel}>
          <div className={styles.panelHeading}>
            <div>
              <p>01 · Gespräch</p>
              <h2>Discovery Input</h2>
            </div>
            <span>{cards.length}</span>
          </div>

          <label className={styles.noteInput}>
            Was haben Sie gerade erfahren?
            <textarea
              rows={6}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !loading
                ) {
                  event.preventDefault();
                  void requestAnalysis("current");
                }
              }}
              placeholder="Mieteranfragen kommen per Outlook rein. Mitarbeiter sucht den Mieter …"
              disabled={Boolean(loading)}
            />
          </label>
          <button
            className={styles.analyzeButton}
            type="button"
            onClick={() => void requestAnalysis("current")}
            disabled={Boolean(loading) || (!note.trim() && cards.length === 0)}
          >
            <IconSpark size={17} />
            {loading === "current"
              ? "Prozess wird strukturiert …"
              : "Analysieren & zum Canvas hinzufügen"}
          </button>
          <p className={styles.inputHint}>
            Enter analysiert · Shift + Enter erzeugt eine neue Zeile.
          </p>

          {suggestions.length ? (
            <section className={styles.suggestions}>
              <div className={styles.subheading}>
                <h3>Erkannte Informationen</h3>
                <span>einzeln übernehmen</span>
              </div>
              <ul>
                {suggestions.map((card) => (
                  <li key={card.id} data-type={card.type}>
                    <span>{DISCOVERY_CARD_LABELS[card.type]}</span>
                    <strong>{card.title}</strong>
                    {card.description ? <p>{card.description}</p> : null}
                    <div>
                      <button type="button" onClick={() => acceptSuggestion(card)}>
                        <IconCheck size={14} /> Übernehmen
                      </button>
                      <button
                        type="button"
                        aria-label={`${card.title} verwerfen`}
                        onClick={() => dismissSuggestion(card.id)}
                      >
                        <IconClose size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={styles.manualCards}>
            <div className={styles.subheading}>
              <h3>Manuell ergänzen</h3>
              <span>beliebige Reihenfolge</span>
            </div>
            <div className={styles.cardTypeButtons}>
              {CARD_TYPES.map((type) => (
                <button
                  type="button"
                  key={type}
                  data-active={manualType === type}
                  onClick={() => {
                    setManualType(type);
                    setManualTitle("");
                    setManualDescription("");
                  }}
                >
                  <IconPlus size={13} /> {DISCOVERY_CARD_LABELS[type]}
                </button>
              ))}
            </div>
            {manualType ? (
              <div className={styles.manualForm}>
                <p>{DISCOVERY_CARD_LABELS[manualType]}</p>
                <input
                  autoFocus
                  value={manualTitle}
                  onChange={(event) => setManualTitle(event.target.value)}
                  onKeyDown={manualKeyDown}
                  placeholder="Titel eingeben und Enter drücken"
                />
                <textarea
                  rows={2}
                  value={manualDescription}
                  onChange={(event) => setManualDescription(event.target.value)}
                  placeholder="Optionale Beschreibung"
                />
                <div>
                  <button type="button" onClick={() => setManualType(null)}>
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={addManualCard}
                    disabled={!manualTitle.trim()}
                  >
                    Hinzufügen
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className={styles.cardCollection}>
            <div className={styles.subheading}>
              <h3>Discovery Cards</h3>
              <span>{cards.length || "noch leer"}</span>
            </div>
            {cards.length ? (
              <ul>
                {cards.map((card) => (
                  <li key={card.id} data-type={card.type}>
                    {editingCardId === card.id ? (
                      <CardEditor
                        card={card}
                        onCancel={() => setEditingCardId(null)}
                        onSave={(title, description) =>
                          saveCard(card, title, description)
                        }
                      />
                    ) : (
                      <>
                        <span>{DISCOVERY_CARD_LABELS[card.type]}</span>
                        <strong>{card.title}</strong>
                        {card.description ? <p>{card.description}</p> : null}
                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            aria-label={`${card.title} bearbeiten`}
                            onClick={() => setEditingCardId(card.id)}
                          >
                            <IconPen size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`${card.title} löschen`}
                            onClick={() => removeCard(card.id)}
                          >
                            <IconClose size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyState}>
                Freie Notiz analysieren oder eine Information ergänzen.
              </p>
            )}
          </section>
        </aside>

        <section className={styles.canvasPanel}>
          <div className={styles.canvasTopbar}>
            <div>
              <p>02 · Prozessmodell</p>
              <h2>{activeBlueprint?.processName ?? "BPMN Canvas"}</h2>
            </div>
            <div className={styles.processActions}>
              <div className={styles.viewSwitch} aria-label="Prozessansicht">
                <button
                  type="button"
                  data-active={activeView === "current"}
                  onClick={() => setActiveView("current")}
                >
                  IST-Prozess
                </button>
                <button
                  type="button"
                  data-active={activeView === "target"}
                  onClick={() => setActiveView("target")}
                  disabled={!targetBlueprint}
                >
                  SOLL-Prozess
                </button>
              </div>
              <button
                className={styles.targetButton}
                type="button"
                onClick={() => void requestAnalysis("target")}
                disabled={Boolean(loading) || !currentBlueprint}
              >
                <IconSpark size={15} />
                {loading === "target"
                  ? "Soll-Prozess entsteht …"
                  : "Soll-Prozess generieren"}
              </button>
            </div>
          </div>

          {error ? (
            <div className={styles.errorBanner} role="alert">
              <IconAlertCircle size={18} />
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Fehler schließen">
                <IconClose size={15} />
              </button>
            </div>
          ) : null}

          {bpmnXml && activeBlueprint ? (
            <AgentGridCanvas
              xml={bpmnXml}
              nodes={activeBlueprint.nodes}
              selectedId={selectedNodeId}
              onSelect={setSelectedNodeId}
            />
          ) : (
            <div className={styles.canvasEmpty}>
              <div className={styles.emptyProcessGlyph} aria-hidden>
                <span />
                <i />
                <b />
              </div>
              <h3>Der Prozess entsteht aus dem Gespräch.</h3>
              <p>
                Erfassen Sie links freie Stichwörter. Die Reihenfolge wird aus den
                Zusammenhängen abgeleitet.
              </p>
              <button type="button" onClick={loadDemo}>
                Demo Prozess laden
              </button>
            </div>
          )}

          {selectedNode ? (
            <NodeDetails
              node={selectedNode}
              blueprint={activeBlueprint}
              onClose={() => setSelectedNodeId(null)}
            />
          ) : null}
        </section>

        <aside className={styles.blueprintPanel}>
          <div className={styles.panelHeading}>
            <div>
              <p>03 · Blueprint</p>
              <h2>Live Blueprint</h2>
            </div>
            <span data-live={Boolean(activeBlueprint)}>
              {activeBlueprint ? "live" : "leer"}
            </span>
          </div>

          <section className={styles.missionSection}>
            <h3>Agent Mission</h3>
            <p>
              {activeBlueprint?.mission ??
                "Wird aus Prozessziel, Schritten und offenen Informationen abgeleitet."}
            </p>
          </section>

          <BlueprintList
            title="Systeme"
            values={activeBlueprint?.systems ?? []}
            empty="Noch kein System bestätigt."
          />
          <BlueprintList
            title="Datenquellen"
            values={activeBlueprint?.dataSources ?? []}
            empty="Noch keine Datenquelle erfasst."
          />
          <BlueprintList
            title="AI Aufgaben"
            values={aiTasks.map((node) => node.label)}
            empty="Noch keine geeignete AI-Aufgabe."
          />
          <BlueprintList
            title="Software / API Aufgaben"
            values={softwareTasks.map((node) => node.label)}
            empty="Noch keine technische Aufgabe."
          />
          <BlueprintList
            title="Human Tasks"
            values={humanTasks.map((node) => node.label)}
            empty="Noch keine menschliche Aufgabe."
          />
          <BlueprintList
            title="Human Approvals"
            values={approvals.map((node) => node.label)}
            empty="Noch keine Freigabe definiert."
          />
          {removedNodes.length ? (
            <BlueprintList
              title="Im Soll entfallen"
              values={removedNodes.map((node) => node.label)}
              empty="Keine Schritte entfallen."
            />
          ) : null}
          <BlueprintList
            title="Pain Points"
            values={activeBlueprint?.painPoints ?? []}
            empty="Noch kein Pain Point erfasst."
          />
          <BlueprintList
            title="Annahmen"
            values={activeBlueprint?.assumptions ?? []}
            empty="Noch keine Annahme dokumentiert."
            tone="warning"
          />
          <BlueprintList
            title="Fehlende Informationen"
            values={activeBlueprint?.missingInformation ?? []}
            empty="Werden nach der ersten Analyse sichtbar."
            tone="warning"
          />

          <section className={styles.economics}>
            <div className={styles.subheading}>
              <h3>Wirtschaftlichkeit</h3>
              <span>deterministisch</span>
            </div>
            <div className={styles.economicsFields}>
              <label>
                Vorgänge / Monat
                <input
                  inputMode="decimal"
                  value={volume}
                  onChange={(event) => setVolume(event.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                Minuten / Vorgang
                <input
                  inputMode="decimal"
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                Vollkosten / Stunde
                <input
                  inputMode="decimal"
                  value={hourlyCost}
                  onChange={(event) => setHourlyCost(event.target.value)}
                  placeholder="0 €"
                />
              </label>
            </div>
            <dl className={styles.costResults}>
              <div>
                <dt>Arbeitsstunden / Monat</dt>
                <dd>{hours === null ? "—" : hours.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</dd>
              </div>
              <div>
                <dt>Aktuelle Prozesskosten</dt>
                <dd>{monthlyCost === null ? "—" : euro(monthlyCost)}</dd>
              </div>
            </dl>
            <label className={styles.assumptionField}>
              Angenommener Automatisierungsgrad
              <span>zu validierende Annahme</span>
              <div>
                <input
                  inputMode="decimal"
                  value={automationDegree}
                  onChange={(event) => setAutomationDegree(event.target.value)}
                  placeholder="z. B. 40"
                />
                <b>%</b>
              </div>
            </label>
            <p className={styles.noPromise}>
              Keine Einsparungsprognose: Automatisierungsgrad und technische
              Machbarkeit müssen validiert werden.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function NodeDetails({
  node,
  blueprint,
  onClose,
}: {
  node: ProcessNode;
  blueprint: ProcessBlueprint | null;
  onClose: () => void;
}) {
  const opportunity = blueprint?.automationOpportunities.find(
    (item) => item.step === node.label,
  );
  return (
    <aside className={styles.nodeDetails} aria-label="Details zum Prozessschritt">
      <div>
        <span>{PROCESS_NODE_LABELS[node.type]}</span>
        <button type="button" onClick={onClose} aria-label="Details schließen">
          <IconClose size={15} />
        </button>
      </div>
      <h3>{node.label}</h3>
      <dl>
        <div>
          <dt>Warum</dt>
          <dd>
           {opportunity?.explanation ??
              node.description ??
              node.sourceNotes?.[0] ??
              fallbackNodeExplanation(node)}
          </dd>
        </div>
        <div>
          <dt>System</dt>
          <dd>{node.system ?? "Nicht bekannt"}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd data-confidence={node.confidence}>
            {node.confidence === "confirmed"
              ? "Confirmed"
              : node.confidence === "assumed"
                ? "Assumed"
                : "Unclear"}
          </dd>
        </div>
      </dl>
    </aside>
  );
}

function fallbackNodeExplanation(node: ProcessNode): string {
  switch (node.type) {
    case "ai_task":
      return "Nicht vollständig deterministische Informationen müssen interpretiert werden.";
    case "service_task":
      return "Als Software-/API-Schritt modelliert; die technische Machbarkeit ist zu validieren.";
    case "business_rule":
      return "Eine nachvollziehbare deterministische Regel soll diesen Schritt ausführen.";
    case "human_task":
      return "Fachliche Bearbeitung bleibt bei einem Menschen.";
    case "approval":
      return "Unsicherheit oder Verantwortung erfordert eine kontrollierte menschliche Freigabe.";
    case "data_source":
      return "Diese Information wird dem Prozess als Datenquelle zugeordnet.";
    case "gateway":
      return "Der weitere Prozessweg hängt von dieser Entscheidung ab.";
    case "start":
      return "Dieser Punkt löst den beschriebenen Prozess aus.";
    case "end":
      return "Dieser Punkt markiert das dokumentierte Prozessergebnis.";
  }
}
