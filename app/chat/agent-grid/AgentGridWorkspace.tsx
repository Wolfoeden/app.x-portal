"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BrandMark } from "@/components/BrandMark";
import { IconCheck, IconClose, IconPen, IconPlus, IconSpark } from "@/components/icons";
import { AgentGridAnalysisResponseSchema, DISCOVERY_CARD_LABELS, PROCESS_NODE_LABELS, ProcessBlueprintSchema,
  type DiscoveryCard, type DiscoveryCardType, type ProcessBlueprint, type ProcessNode } from "@/lib/agent-grid/blueprint";
import { processBlueprintToBpmnXml } from "@/lib/agent-grid/bpmn";
import { calculateProcessEconomics, parseNonNegativeDecimal } from "@/lib/agent-grid/economics";
import { SCENARIOS, scenarioWorkshop } from "@/lib/agent-grid/scenarios";
import { emptyWorkshop, insertStep, newProcess, nextSteps, readWorkshop, removeStep, updateStep,
  WORKSHOP_STORAGE_KEY, workshopBrief, type Workshop } from "@/lib/agent-grid/workshop";
import { appPath } from "@/lib/app-path";
import { AgentGridCanvas } from "./AgentGridCanvas";
import styles from "./agent-grid.module.css";

type Stage = "discovery" | "design" | "delivery";
type View = "current" | "target";
const STAGES = [{ id: "discovery", label: "Prozess verstehen", short: "Verstehen" }, { id: "design", label: "AI Agent entwerfen", short: "Entwerfen" }, { id: "delivery", label: "Umsetzung festlegen", short: "Umsetzen" }] as const;
const TASK_TYPES = ["ai_task", "service_task", "business_rule", "human_task", "approval"] as const;
const TYPE_COPY: Record<ProcessNode["type"], string> = {
  start: "Hier beginnt der Prozess.", end: "Dieses Ergebnis soll der Prozess liefern.",
  ai_task: "Der Agent interpretiert Inhalte und bereitet ein strukturiertes Ergebnis vor.",
  service_task: "Eine definierte Schnittstelle liest oder aktualisiert Daten im angebundenen System.",
  business_rule: "Eine feste, nachvollziehbare Regel bestimmt das Ergebnis.",
  human_task: "Die fachliche Bearbeitung bleibt bei Ihrem Team.",
  approval: "Der Ablauf wartet auf die Entscheidung eines verantwortlichen Menschen.",
  gateway: "Eine Bedingung entscheidet, welchen Weg der Vorgang nimmt.",
  data_source: "Diese Daten liefern den Kontext für die Bearbeitung.",
};
const TYPE_NAMES: Record<ProcessNode["type"], string> = { ...PROCESS_NODE_LABELS, start: "Start", end: "Ergebnis", human_task: "Mensch", ai_task: "AI Agent", business_rule: "Feste Regel" };
const CONFIDENCE = { confirmed: "Bestätigt", assumed: "Annahme", unclear: "Noch offen" };
const euro = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const number = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 1 });

function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AgentGridWorkspace({ initialDemo = false }: { initialDemo?: boolean }) {
  const [workshop, setWorkshop] = useState<Workshop>(() => initialDemo ? scenarioWorkshop("service") : emptyWorkshop());
  const [stage, setStage] = useState<Stage>(initialDemo ? "design" : "discovery");
  const [view, setView] = useState<View>(initialDemo ? "target" : "current");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [run, setRun] = useState<string[]>([]);
  const [busy, setBusy] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [storageStatus, setStorageStatus] = useState("Sitzung wird vorbereitet …");
  const [hydrated, setHydrated] = useState(false);
  const [suggestions, setSuggestions] = useState<DiscoveryCard[]>([]);
  const [history, setHistory] = useState<Workshop[]>([]);
  const [cardType, setCardType] = useState<DiscoveryCardType>("note");
  const [cardTitle, setCardTitle] = useState("");
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const storageKey = WORKSHOP_STORAGE_KEY + (initialDemo ? ".preview" : "");
  const blueprint = view === "target" ? workshop.target : workshop.current;
  const xml = useMemo(() => blueprint ? processBlueprintToBpmnXml(blueprint) : null, [blueprint]);
  const selected = blueprint?.nodes.find(n => n.id === selectedId) ?? null;
  const runningNode = blueprint?.nodes.find(n => n.id === run.at(-1));
  const transitions = runningNode && blueprint ? nextSteps(blueprint, runningNode.id) : [];
  const agentTasks = workshop.target?.nodes.filter(n => n.type === "ai_task") ?? [];
  const approvalTasks = workshop.target?.nodes.filter(n => n.type === "approval" || n.type === "human_task") ?? [];

  useEffect(() => {
    let cancelled = false;
    // Defer the browser-only restore so SSR and the first client render agree.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const restored = readWorkshop(stored);
          setWorkshop(restored);
          setView(restored.target ? "target" : "current");
          setStage(restored.target ? "design" : "discovery");
          setNotice("Letzte lokale Sitzung wiederhergestellt.");
        }
      } catch { setNotice("Die vorige Sitzung konnte nicht geladen werden. Eine gespeicherte Sitzungsdatei können Sie weiterhin öffnen."); }
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify(workshop)); setStorageStatus("Auf diesem Gerät gespeichert"); }
      catch { setStorageStatus("Nicht lokal gespeichert · bitte Sitzung herunterladen"); }
    }, 350);
    return () => clearTimeout(timer);
  }, [workshop, hydrated, storageKey]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setPresenting(false); setShowFiles(false); setEditing(false); } };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); requestRef.current?.abort(); };
  }, []);

  function change(patch: Partial<Workshop>) { setWorkshop(w => ({ ...w, ...patch })); setStorageStatus("Wird lokal gespeichert …"); }
  function remember() { setHistory(h => [...h.slice(-19), workshop]); }
  function resetInteraction() { setRun([]); setSelectedId(null); setEditing(false); setError(null); setSuggestions([]); }
  function chooseStage(next: Stage) { setStage(next); setRun([]); setEditing(false); if (next === "discovery") setView("current"); if (next === "design") setView(workshop.target ? "target" : "current"); }
  function loadScenario(id: string) {
    remember(); setWorkshop(scenarioWorkshop(id)); setStage("design"); setView("target"); resetInteraction();
    setNotice("Beispielszenario geladen. Ihre vorige Sitzung erreichen Sie über Rückgängig.");
  }
  function newSession() { remember(); setWorkshop(emptyWorkshop()); setStage("discovery"); setView("current"); resetInteraction(); setNotice("Neue Sitzung. Die vorige Sitzung kann rückgängig gemacht werden."); }
  function undo() {
    const previous = history.at(-1); if (!previous) return;
    setWorkshop(previous); setHistory(h => h.slice(0, -1)); setView(previous.target ? "target" : "current"); resetInteraction();
    setNotice("Letzte Aktion rückgängig gemacht.");
  }
  function saveBlueprint(next: ProcessBlueprint) {
    remember();
    change(view === "target" ? { target: next } : { current: next, target: null });
    setEditing(false); setRun([]); setNotice("Prozess aktualisiert.");
  }
  function saveNode(node: ProcessNode) {
    if (!blueprint) return;
    try { saveBlueprint(updateStep(blueprint, node)); } catch { setError("Der Schritt ist ungültig. Bitte die Eingaben prüfen."); }
  }
  function insertAfter() {
    if (!blueprint || !selected) return;
    const node: ProcessNode = { id: `step-${crypto.randomUUID()}`, label: "Neuer Prozessschritt", type: view === "target" ? "ai_task" : "human_task", confidence: "assumed" };
    try { saveBlueprint(insertStep(blueprint, selected.id, node)); setSelectedId(node.id); setEditing(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Einfügen nicht möglich."); }
  }
  function deleteNode() {
    if (!blueprint || !selected) return;
    try { saveBlueprint(removeStep(blueprint, selected.id)); setSelectedId(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Entfernen nicht möglich."); }
  }
  function addCard(event: FormEvent) {
    event.preventDefault(); if (!cardTitle.trim() || workshop.cards.length >= 80) return;
    remember();
    change({ cards: editingCard ? workshop.cards.map(c => c.id === editingCard ? { ...c, type: cardType, title: cardTitle.trim() } : c) : [...workshop.cards, { id: crypto.randomUUID(), type: cardType, title: cardTitle.trim() }] });
    setCardTitle(""); setEditingCard(null); setNotice("Anforderung erfasst. Mit KI analysieren oder direkt in den Prozess einarbeiten.");
  }
  async function analyze(mode: View) {
    if (initialDemo) { setError("Die lokale Vorschau verwendet keine kostenpflichtige KI. Bearbeiten Sie die Prozessschritte direkt oder starten Sie mit einer Vorlage. Die KI-Analyse ist im angemeldeten Admin-Bereich verfügbar."); return; }
    if (busy) return;
    if (mode === "target" && !workshop.current) return;
    const snapshot = workshop;
    const controller = new AbortController(); requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 65_000);
    setBusy(mode); setError(null); setRun([]);
    try {
      const response = await fetch(appPath("/api/agent-grid/analyze"), { method: "POST", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), mode, company: snapshot.company,
          useCase: snapshot.useCase, cards: snapshot.cards, newNote: mode === "current" ? snapshot.note : "", currentBlueprint: snapshot.current }) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Analyse fehlgeschlagen. Ihre Eingaben bleiben erhalten.");
      const result = AgentGridAnalysisResponseSchema.parse(body);
      remember();
      if (mode === "current") { change({ current: result.blueprint, target: null, note: "" }); setSuggestions(result.suggestedCards); }
      else change({ target: result.blueprint });
      setView(mode); setSelectedId(null); setNotice("Prozessentwurf aktualisiert. Annahmen bitte gemeinsam prüfen.");
    } catch (e) { setError(controller.signal.aborted ? "Analyse beendet oder Zeitlimit erreicht. Ihre Eingaben bleiben erhalten; Sie können direkt im Prozess weiterarbeiten." : e instanceof Error ? e.message : "Analyse fehlgeschlagen."); }
    finally { clearTimeout(timeout); requestRef.current = null; setBusy(null); }
  }
  function exportFile(kind: "session" | "bpmn" | "brief") {
    const name = (workshop.useCase || "agent-grid").toLowerCase().replace(/[^a-z0-9äöüß-]+/gu, "-").slice(0, 70);
    if (kind === "session") download(JSON.stringify(workshop, null, 2), `${name}.xportal.json`, "application/json");
    if (kind === "bpmn" && xml) download(xml, `${name}-${view === "target" ? "soll" : "ist"}.bpmn`, "application/xml");
    if (kind === "brief") download(workshopBrief(workshop), `${name}-umsetzungskonzept.md`, "text/markdown;charset=utf-8");
    setShowFiles(false);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Die Sitzungsdatei darf maximal 1 MB groß sein.");
      const imported = readWorkshop(await file.text()); remember(); setWorkshop(imported); resetInteraction();
      setView(imported.target ? "target" : "current"); setStage(imported.target ? "design" : "discovery"); setNotice("Sitzung vollständig aus Datei geladen.");
    } catch { setError("Die Datei ist keine gültige Agent-Grid-Sitzung (Version 1, max. 1 MB). Ihre aktuelle Sitzung bleibt erhalten."); }
    if (fileRef.current) fileRef.current.value = "";
  }
  function startRun(id?: string) {
    const start = id ?? blueprint?.nodes.find(n => n.type === "start")?.id; if (!start) return;
    setRun([start]); setSelectedId(start); setEditing(false);
  }
  function advance(id: string) {
    if (run.length >= 160) { setError("Der Probelauf hat 160 Schritte erreicht. Bitte starten Sie für einen weiteren Fall neu."); return; }
    setRun(r => [...r, id]); setSelectedId(id);
  }

  return <main className={styles.shell} data-presenting={presenting} data-running={run.length > 0} id="main-content">
    <header className={styles.header}>
      <div className={styles.brandBlock}><BrandMark height={30} /><div><p className={styles.eyebrow}>Vom Prozess zum Produkt</p><h1>Agent Grid<span> / Studio</span></h1></div></div>
      <div className={styles.sessionIdentity}>
        <input aria-label="Unternehmen" placeholder="Ihr Kunde / Unternehmen" maxLength={300} value={workshop.company} disabled={Boolean(busy)} onChange={e => change({ company: e.target.value })} />
        <span>/</span><input aria-label="Prozessname" placeholder="Welcher Prozess?" maxLength={180} value={workshop.useCase} disabled={Boolean(busy)} onChange={e => change({ useCase: e.target.value, ...(e.target.value.trim() ? { current: workshop.current ? { ...workshop.current, processName: e.target.value.trim() } : null, target: workshop.target ? { ...workshop.target, processName: e.target.value.trim() } : null } : {}) })} />
      </div>
      <div className={styles.headerActions}>
        <div className={styles.fileMenu}>
          <button type="button" aria-expanded={showFiles} onClick={() => setShowFiles(!showFiles)}>Sitzung <span>⌄</span></button>
          {showFiles && <div className={styles.menu}>
            <button type="button" onClick={() => exportFile("session")}>Sitzung herunterladen</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => { fileRef.current?.click(); setShowFiles(false); }}>Sitzungsdatei öffnen</button>
            <button type="button" disabled={!xml} onClick={() => exportFile("bpmn")}>BPMN 2.0 herunterladen</button>
            <button type="button" onClick={() => exportFile("brief")}>Umsetzungskonzept herunterladen</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => { newSession(); setShowFiles(false); }}>Neue Sitzung</button>
          </div>}
        </div>
        <button type="button" className={styles.presentButton} aria-pressed={presenting} onClick={() => setPresenting(!presenting)}><span aria-hidden>⛶</span>{presenting ? "Präsentation beenden" : "Präsentieren"}</button>
      </div>
      <input hidden type="file" accept=".json" ref={fileRef} aria-label="Sitzungsdatei" onChange={e => void importFile(e.target.files?.[0])} />
    </header>

    <nav className={styles.journey} aria-label="Gesprächsphasen">
      <div className={styles.journeySteps}>{STAGES.map((s, i) => <button key={s.id} type="button" data-active={stage === s.id} aria-current={stage === s.id ? "step" : undefined} disabled={Boolean(busy)} onClick={() => chooseStage(s.id)}><span>{String(i + 1).padStart(2, "0")}</span><b>{s.label}</b></button>)}</div>
      <div className={styles.sessionStatus}><i /><span>{workshop.example ? "Beispielszenario" : "Gesprächsentwurf"}</span><span className={styles.bpmnBadge}>BPMN 2.0</span></div>
    </nav>

    {(error || busy) && <div className={styles.banner} role={error ? "alert" : "status"} data-error={Boolean(error)}><span>{error || "Die KI strukturiert den Prozess. Ihre bisherigen Eingaben bleiben erhalten …"}</span><button type="button" onClick={() => busy ? requestRef.current?.abort() : setError(null)}>{busy ? "Abbrechen" : "Schließen"}</button></div>}

    <fieldset className={styles.workBody} disabled={Boolean(busy) || !hydrated}>
      <div className={styles.intro}>
        <div><p className={styles.eyebrow}>{stage === "discovery" ? "Gemeinsam den Ausgangspunkt klären" : stage === "design" ? "So arbeitet Ihr zukünftiger Agent" : "Aus dem Gespräch wird ein klarer Auftrag"}</p>
          <h2>{stage === "discovery" ? "Ihr Prozess. Schritt für Schritt." : stage === "design" ? "Die Arbeit verändert sich. Sie behalten die Kontrolle." : "Das implementieren wir für Sie."}</h2>
          <p>{stage === "discovery" ? "Anforderungen festhalten, den Ablauf skizzieren und gemeinsam bestätigen." : stage === "design" ? "Machen Sie Aufgaben, Systemzugriffe und menschliche Entscheidungen sichtbar." : "Pilotumfang, Anbindungen und Abnahme gemeinsam konkretisieren."}</p>
        </div>
        <div className={styles.templatePicker}><label htmlFor="scenario">Mit einem Beispiel starten</label><select id="scenario" value="" onChange={e => loadScenario(e.target.value)}><option value="" disabled>Vorlage auswählen</option>{SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      </div>

      {stage !== "delivery" ? <div className={styles.workArea} data-discovery={stage === "discovery"}>
        {stage === "discovery" && <aside className={styles.discoveryPanel}>
          <div className={styles.panelTitle}><div><p className={styles.eyebrow}>Gemeinsames Briefing</p><h3>Was soll einfacher werden?</h3></div><span className={styles.count}>{workshop.cards.length}</span></div>
          {workshop.current && <label className={styles.field}>Prozessziel<textarea rows={2} maxLength={1000} value={workshop.current.mission} onChange={e => { if (e.target.value.trim()) change({ current: { ...workshop.current!, mission: e.target.value }, target: workshop.target ? { ...workshop.target, mission: e.target.value } : null }); }} /></label>}
          <label className={styles.field}>Gesprächsnotizen<textarea rows={5} maxLength={8000} value={workshop.note} onChange={e => change({ note: e.target.value })} placeholder="Was löst den Prozess aus? Was passiert heute? Wo geht Zeit verloren?" /></label>
          <button type="button" className={styles.primaryButton} onClick={() => void analyze("current")} disabled={!workshop.note.trim() && !workshop.cards.length && !workshop.current}><IconSpark size={16} />{busy === "current" ? "Prozess entsteht …" : "Notizen mit KI strukturieren"}</button>
          <p className={styles.hint}>{initialDemo ? "Lokale Vorschau: Vorlagen und manuelle Bearbeitung funktionieren ohne KI-Aufruf." : "KI-Entwürfe gemeinsam prüfen. Neue Notizen werden erst bei der Analyse ins Modell übernommen."}</p>
          <form onSubmit={addCard} className={styles.noteForm}>
            <h4>{editingCard ? "Anforderung bearbeiten" : "Anforderung festhalten"}</h4>
            <select aria-label="Art der Anforderung" value={cardType} onChange={e => setCardType(e.target.value as DiscoveryCardType)}>{Object.entries(DISCOVERY_CARD_LABELS).map(([type, label]) => <option key={type} value={type}>{label === "Human Approval" ? "Menschliche Freigabe" : label}</option>)}</select>
            <input aria-label="Anforderung" maxLength={180} placeholder="z. B. Freigabe vor jedem Versand" value={cardTitle} onChange={e => setCardTitle(e.target.value)} />
            <button type="submit" disabled={!cardTitle.trim() || workshop.cards.length >= 80}><IconPlus size={14} />{editingCard ? "Änderung speichern" : "Hinzufügen"}</button>
            {editingCard && <button type="button" onClick={() => { setEditingCard(null); setCardTitle(""); }}>Abbrechen</button>}
          </form>
          <div className={styles.discoveryCards}>{workshop.cards.map(card => <article key={card.id}><div><span>{DISCOVERY_CARD_LABELS[card.type]}</span><button type="button" aria-label={`${card.title} bearbeiten`} onClick={() => { setEditingCard(card.id); setCardType(card.type); setCardTitle(card.title); }}><IconPen size={13} /></button><button type="button" aria-label={`${card.title} entfernen`} onClick={() => { remember(); change({ cards: workshop.cards.filter(c => c.id !== card.id) }); }}><IconClose size={13} /></button></div><p>{card.title}</p>{card.description && <small>{card.description}</small>}</article>)}</div>
          {suggestions.length > 0 && <section className={styles.suggestions}><h4>Von der KI erkannt</h4>{suggestions.map((card, index) => <div key={`${card.id}-${index}`}><p>{card.title}</p><button type="button" disabled={workshop.cards.length >= 80} onClick={() => { remember(); change({ cards: [...workshop.cards, { ...card, id: crypto.randomUUID() }] }); setSuggestions(s => s.filter((_, i) => i !== index)); }}>Übernehmen</button><button type="button" onClick={() => setSuggestions(s => s.filter((_, i) => i !== index))}>Verwerfen</button></div>)}</section>}
        </aside>}

        <section className={styles.board} aria-label="Prozessmodell">
          <div className={styles.boardToolbar}>
            <div className={styles.viewSwitch} aria-label="Prozessansicht"><button type="button" data-active={view === "current"} aria-pressed={view === "current"} onClick={() => { setView("current"); setRun([]); setSelectedId(null); setEditing(false); }}>Heute <span>IST</span></button><button type="button" data-active={view === "target"} aria-pressed={view === "target"} disabled={!workshop.target} onClick={() => { setView("target"); setRun([]); setSelectedId(null); setEditing(false); }}>Mit AI Agent <span>SOLL</span></button></div>
            <div className={styles.boardActions}>{workshop.current && !workshop.target && <button type="button" onClick={() => { remember(); change({ target: ProcessBlueprintSchema.parse({ ...workshop.current, assumptions: [...workshop.current!.assumptions, "SOLL-Entwurf aus dem IST-Prozess kopiert; Aufgaben gemeinsam anpassen."] }) }); setView("target"); setStage("design"); setNotice("SOLL-Entwurf angelegt. Wählen Sie Schritte aus und ändern Sie die Zuständigkeit."); }}>SOLL manuell entwerfen</button>}
              {stage === "design" && <button type="button" className={styles.softButton} disabled={!workshop.current} onClick={() => void analyze("target")}><IconSpark size={14} />KI-Entwurf</button>}
              <button type="button" className={styles.runButton} disabled={!blueprint} onClick={() => run.length ? setRun([]) : startRun()}><span aria-hidden>{run.length ? "■" : "▶"}</span>{run.length ? "Probelauf beenden" : "Probelauf"}</button>
            </div>
          </div>
          <div className={styles.boardCaption}><div><i data-view={view} /><strong>{blueprint?.processName || workshop.useCase || "Ihr Prozessmodell"}</strong></div><span>{view === "target" ? "Gemeinsam zu prüfender Lösungsentwurf" : "Heutiger Ablauf"}</span></div>
          {xml && blueprint ? <AgentGridCanvas xml={xml} nodes={blueprint.nodes} selectedId={selectedId} activeId={run.at(-1)} completedIds={run.slice(0, -1)} onSelect={setSelectedId} /> : <div className={styles.emptyCanvas}>
            <div className={styles.processGlyph} aria-hidden><i /><span /><b>Ihr Prozess</b><span /><i /></div>
            <h3>Ein gemeinsames Bild. Von Anfang an.</h3><p>Starten Sie mit einem Beispiel oder skizzieren Sie den Prozess direkt im Gespräch.</p>
            <div>{SCENARIOS.map(s => <button type="button" key={s.id} onClick={() => loadScenario(s.id)}><strong>{s.label} ↗</strong><small>{s.description}</small></button>)}</div>
            <button type="button" className={styles.textButton} onClick={() => { remember(); change({ current: newProcess(workshop.useCase) }); setView("current"); setSelectedId("task"); setEditing(true); }}>+ Eigenen Prozess skizzieren</button>
          </div>}

          {runningNode && <section className={styles.runPanel} aria-label="Probelauf" aria-live="polite">
            <div className={styles.runLabel}><span className={styles.liveDot} />Simulation<span>Keine Systeme verbunden</span><button type="button" onClick={() => { setRun(r => r.slice(0, -1)); setSelectedId(run.at(-2) ?? null); }} disabled={run.length < 2}>← Zurück</button></div>
            <div className={styles.runContent}><div><span className={styles.nodeBadge} data-kind={runningNode.type}>{TYPE_NAMES[runningNode.type]}</span><h3>{runningNode.label}</h3><p>{runningNode.description || TYPE_COPY[runningNode.type]}</p></div>
              <div className={styles.runChoices}>{runningNode.type === "end" ? <><strong>Beispiel abgeschlossen <IconCheck size={17} /></strong><button type="button" onClick={() => startRun()}>Neuen Fall zeigen</button></> : transitions.length > 1 ? <><small>{runningNode.type === "gateway" ? "Welcher Fall liegt vor?" : "Pfad für die Demonstration wählen"}</small>{transitions.map(e => <button type="button" key={e.to} onClick={() => advance(e.to)}>{e.label || blueprint?.nodes.find(n => n.id === e.to)?.label} →</button>)}</> : <button type="button" className={styles.primaryButton} disabled={!transitions.length} onClick={() => transitions[0] && advance(transitions[0].to)}>{runningNode.type === "approval" ? "Freigabe simulieren" : "Nächster Schritt"} →</button>}</div>
            </div>
          </section>}
          <div className={styles.boardFooter}><span>Schritt anklicken, um Aufgabe und Verantwortung zu besprechen.</span><span>{blueprint ? `${blueprint.nodes.filter(n => n.type !== "data_source").length} Schritte` : "BPMN 2.0"}</span></div>
        </section>

        {stage === "design" && <aside className={styles.inspector}>
          {selected ? <><div className={styles.panelTitle}><p className={styles.eyebrow}>Im Detail</p><button type="button" aria-label="Schrittdetails schließen" onClick={() => { setSelectedId(null); setEditing(false); }}><IconClose size={16} /></button></div>
            {editing ? <NodeEditor key={selected.id} node={selected} onSave={saveNode} onCancel={() => setEditing(false)} /> : <NodeInfo node={selected} />}
            {!editing && <div className={styles.nodeActions}><button type="button" disabled={run.length > 0} onClick={() => setEditing(true)}><IconPen size={14} />Schritt bearbeiten</button><button type="button" disabled={run.length > 0 || !blueprint || nextSteps(blueprint, selected.id).length !== 1 || selected.type === "gateway"} onClick={insertAfter}><IconPlus size={14} />Schritt danach einfügen</button>{TASK_TYPES.some(t => t === selected.type) && <button type="button" disabled={run.length > 0} onClick={deleteNode}>Schritt entfernen</button>}</div>}
          </> : <><p className={styles.eyebrow}>Ihr Agent auf einen Blick</p><h3 className={styles.inspectorHeadline}>{workshop.useCase || "Ihr AI Agent"}</h3><p className={styles.mission}>{blueprint?.mission || "Legen Sie gemeinsam fest, welches Ergebnis Ihr Agent liefern soll."}</p>
            <div className={styles.agentMetrics}><div><strong>{agentTasks.length}</strong><span>AI-Aufgaben</span></div><div><strong>{workshop.target?.systems.length ?? 0}</strong><span>Systeme</span></div><div><strong>{approvalTasks.length}</strong><span>beim Team</span></div></div>
            <div className={styles.controlNote}><IconCheck size={17} /><div><strong>Verantwortung bleibt sichtbar.</strong><p>Regeln und Freigaben legen fest, was der Agent selbst erledigen darf.</p></div></div>
          </>}
          <StepList blueprint={blueprint} selectedId={selectedId} onSelect={id => { setSelectedId(id); setEditing(false); }} />
          {blueprint && <details className={styles.questions}><summary>Offene Fragen <span>{blueprint.missingInformation.length}</span></summary><ul>{blueprint.missingInformation.map(q => <li key={q}>{q}</li>)}</ul></details>}
          {blueprint && <details className={styles.questions}><summary>Annahmen <span>{blueprint.assumptions.length}</span></summary><ul>{blueprint.assumptions.map(q => <li key={q}>{q}</li>)}</ul></details>}
        </aside>}

        {stage === "discovery" && blueprint && <div className={styles.discoveryDetails}>
          <StepList blueprint={blueprint} selectedId={selectedId} onSelect={id => { setSelectedId(id); setEditing(false); }} />
          {selected && <div className={styles.inlineDetail}>{editing ? <NodeEditor key={selected.id} node={selected} onSave={saveNode} onCancel={() => setEditing(false)} /> : <><NodeInfo node={selected} /><div className={styles.nodeActions}><button type="button" onClick={() => setEditing(true)}>Schritt bearbeiten</button><button type="button" disabled={nextSteps(blueprint, selected.id).length !== 1 || selected.type === "gateway"} onClick={insertAfter}>Schritt danach einfügen</button>{TASK_TYPES.some(t => t === selected.type) && <button type="button" onClick={deleteNode}>Schritt entfernen</button>}</div></>}</div>}
        </div>}
      </div> : <Delivery workshop={workshop} onChange={change} onExport={() => exportFile("brief")} onBack={() => chooseStage("design")} />}

      {stage === "design" && <section className={styles.valueStrip}><div><span className={styles.valueIcon}>↗</span><div><strong>Von einzelnen Aufgaben zu einem verlässlichen Ablauf.</strong><p>{view === "target" ? "AI verarbeitet Inhalte. Systeme führen definierte Aktionen aus. Ihr Team entscheidet bei Ausnahmen." : "Das heutige Vorgehen ist die Grundlage. Im SOLL legen Sie fest, was der Agent übernimmt."}</p></div></div><button type="button" onClick={() => chooseStage("delivery")}>Umsetzung konkretisieren <span>→</span></button></section>}
    </fieldset>

    <footer className={styles.footer}><div><span className={styles.saveStatus}>{storageStatus}</span><span className={styles.notice} role="status">{notice}</span></div><button type="button" disabled={!history.length || Boolean(busy)} onClick={undo}>↶ Rückgängig</button></footer>
  </main>;
}

function StepList({ blueprint, selectedId, onSelect }: { blueprint: ProcessBlueprint | null; selectedId: string | null; onSelect: (id: string) => void }) {
  return <section className={styles.stepList}><h4>Prozessschritte <span>auswählen & bearbeiten</span></h4>{blueprint?.nodes.filter(n => n.type !== "data_source").map((node, index) => <button type="button" key={node.id} data-active={selectedId === node.id} onClick={() => onSelect(node.id)}><span data-kind={node.type}>{String(index + 1).padStart(2, "0")}</span><b>{node.label}</b><i>↗</i></button>)}</section>;
}

function NodeInfo({ node }: { node: ProcessNode }) {
  return <div className={styles.nodeInfo}><span className={styles.nodeBadge} data-kind={node.type}>{TYPE_NAMES[node.type]}</span><h3>{node.label}</h3><p>{node.description || TYPE_COPY[node.type]}</p><dl><div><dt>System</dt><dd>{node.system || "Noch festzulegen"}</dd></div><div><dt>Stand im Modell</dt><dd>{CONFIDENCE[node.confidence]}</dd></div></dl></div>;
}

function NodeEditor({ node, onSave, onCancel }: { node: ProcessNode; onSave: (node: ProcessNode) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(node);
  return <form className={styles.nodeEditor} onSubmit={event => { event.preventDefault(); if (draft.label.trim()) onSave({ ...draft, label: draft.label.trim() }); }}>
    <label className={styles.field}>Aufgabe<input autoFocus maxLength={180} value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></label>
    {TASK_TYPES.some(t => t === node.type) && <label className={styles.field}>Wer übernimmt?<select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as ProcessNode["type"] })}>{TASK_TYPES.map(t => <option value={t} key={t}>{TYPE_NAMES[t]}</option>)}</select></label>}
    <label className={styles.field}>System / Werkzeug<input maxLength={120} value={draft.system ?? ""} onChange={e => setDraft({ ...draft, system: e.target.value })} placeholder="z. B. Outlook, SAP, CRM" /></label>
    <label className={styles.field}>Was passiert hier?<textarea rows={4} maxLength={1000} value={draft.description ?? ""} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
    <label className={styles.field}>Stand im Modell<select value={draft.confidence} onChange={e => setDraft({ ...draft, confidence: e.target.value as ProcessNode["confidence"] })}>{Object.entries(CONFIDENCE).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <div><button type="submit" className={styles.primaryButton} disabled={!draft.label.trim()}>Übernehmen</button><button type="button" onClick={onCancel}>Abbrechen</button></div>
  </form>;
}

function Delivery({ workshop, onChange, onExport, onBack }: { workshop: Workshop; onChange: (patch: Partial<Workshop>) => void; onExport: () => void; onBack: () => void }) {
  const target = workshop.target;
  const economics = calculateProcessEconomics({ volumePerMonth: workshop.volume, minutesPerCase: workshop.minutes, hourlyCost: workshop.hourlyCost });
  const percentage = parseNonNegativeDecimal(workshop.automation);
  const validPercent = percentage !== null && percentage <= 100;
  const potential = validPercent && economics.hoursPerMonth !== null ? economics.hoursPerMonth * percentage / 100 : null;
  const equivalent = potential !== null && parseNonNegativeDecimal(workshop.hourlyCost) !== null ? potential * parseNonNegativeDecimal(workshop.hourlyCost)! : null;
  return <div className={styles.delivery}>
    <section className={styles.offerCard}><div><p className={styles.eyebrow}>Ihr individuelles Agentensystem</p><h3>{workshop.useCase || "Ihr AI Agent"}</h3><p>{target?.mission || "Erstellen Sie zunächst einen SOLL-Prozess, um die Aufgaben Ihres Agenten festzulegen."}</p></div><span>Konzeptentwurf</span></section>
    <div className={styles.deliveryColumns}>
      <div className={styles.deliverables}>
        {[{ title: "Der Agent", sub: "Versteht und bereitet vor", types: ["ai_task"], kind: "ai_task", fallback: "AI-Aufgaben im SOLL-Prozess festlegen." }, { title: "Die Anbindungen", sub: "Arbeitet mit Ihren Systemen", types: ["service_task", "business_rule"], kind: "service_task", fallback: "Systeme, Schnittstellen und Regeln abgrenzen." }, { title: "Ihre Kontrolle", sub: "Menschen behalten Verantwortung", types: ["human_task", "approval"], kind: "approval", fallback: "Freigaben und Übergaben gemeinsam definieren." }].map(item => <section className={styles.deliverable} key={item.title} data-kind={item.kind}><span>{item.sub}</span><h4>{item.title}</h4><ul>{target?.nodes.some(n => item.types.includes(n.type)) ? target.nodes.filter(n => item.types.includes(n.type)).map(n => <li key={n.id}><IconCheck size={14} />{n.label}</li>) : <li>{item.fallback}</li>}</ul></section>)}
        <section className={styles.scopeSection}><h3>Der Pilot bekommt klare Grenzen.</h3><label className={styles.field}>Was gehört in die erste Umsetzung?<textarea rows={3} maxLength={4000} placeholder="Ein Prozess, definierte Fallarten, die benötigten Systeme …" value={workshop.scope} onChange={e => onChange({ scope: e.target.value })} /></label><label className={styles.field}>Woran nehmen wir das Ergebnis ab?<textarea rows={3} maxLength={4000} placeholder="Testfälle, gewünschte Qualität, Freigaben und Zuständigkeiten …" value={workshop.acceptance} onChange={e => onChange({ acceptance: e.target.value })} /></label></section>
        <section className={styles.implementation}><h3>Von XPORTAL implementiert. Gemeinsam abgenommen.</h3><ol>{[["Abgrenzen", "Prozess, Datenzugriffe und Erfolgskriterien bestätigen."], ["Implementieren", "Agent, Anbindungen und Freigaben umsetzen."], ["Abnehmen", "Standardfälle und Ausnahmen gemeinsam testen."], ["Begleiten", "Kontrolliert starten, überwachen und verbessern."]].map(([title, text], index) => <li key={title}><span>{index + 1}</span><strong>{title}</strong><p>{text}</p></li>)}</ol></section>
      </div>
      <aside className={styles.economics}><p className={styles.eyebrow}>Potenzial gemeinsam einordnen</p><h3>Was kostet der Prozess heute?</h3><p>Ihre Eingaben machen den heutigen Aufwand greifbar.</p>
        <div className={styles.economicInputs}>{([{ key: "volume", label: "Vorgänge pro Monat", placeholder: "z. B. 500" }, { key: "minutes", label: "Minuten pro Vorgang", placeholder: "z. B. 12" }, { key: "hourlyCost", label: "Vollkosten je Stunde (€)", placeholder: "z. B. 45" }] as const).map(f => <label className={styles.field} key={f.key}>{f.label}<input inputMode="decimal" maxLength={30} value={workshop[f.key]} placeholder={f.placeholder} onChange={e => onChange({ [f.key]: e.target.value })} /></label>)}</div>
        <div className={styles.costResults}><div><span>Aufwand / Monat</span><strong>{economics.hoursPerMonth === null ? "—" : `${number(economics.hoursPerMonth)} h`}</strong></div><div><span>Heutige Prozesskosten / Monat</span><strong>{economics.currentProcessCost === null ? "—" : euro(economics.currentProcessCost)}</strong></div></div>
        <label className={styles.field}>Angenommene Zeitentlastung (%)<input inputMode="decimal" maxLength={30} value={workshop.automation} placeholder="Gemeinsam einschätzen" onChange={e => onChange({ automation: e.target.value })} /></label>
        {workshop.automation && !validPercent && <p role="alert" className={styles.fieldError}>Bitte einen Wert zwischen 0 und 100 eingeben.</p>}
        {potential !== null && <div className={styles.potential}><span>Szenario · zu validieren</span><strong>{number(potential)} h <small>/ Monat</small></strong><p>{equivalent === null ? "Mögliche zeitliche Entlastung" : `${euro(equivalent)} rechnerischer Gegenwert / Monat`}</p></div>}
        <p className={styles.hint}>Rechnung: Vorgänge × Minuten ÷ 60 × Stundensatz. Zeitentlastung ist eine Annahme, keine zugesagte Einsparung. Implementierungs- und Betriebskosten sind noch nicht enthalten.</p>
        <section className={styles.openItems}><h4>Vor dem Angebot klären</h4><ul>{(target?.missingInformation.length ? target.missingInformation : ["Pilotumfang und technische Zugänge", "Abnahmekriterien", "Implementierungspreis und laufender Betrieb"]).map(q => <li key={q}>{q}</li>)}</ul></section>
        <button type="button" className={styles.primaryButton} onClick={onExport}>Umsetzungskonzept herunterladen ↓</button><p className={styles.hint}>Enthält Aufgaben, Pilotumfang, Annahmen und offene Fragen. Kein verbindliches Angebot.</p>
        <button type="button" className={styles.textButton} onClick={onBack}>← Zurück zum Prozess</button>
      </aside>
    </div>
  </div>;
}
