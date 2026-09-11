import { z } from "zod";
import {
  DiscoveryCardSchema, ProcessBlueprintSchema,
  type ProcessBlueprint, type ProcessNode, type ProcessEdge,
} from "./blueprint";

export const WORKSHOP_STORAGE_KEY = "xportal.agent-grid.workshop.v1";

export const WorkshopSchema = z.object({
  version: z.literal(1),
  company: z.string().max(300),
  useCase: z.string().max(300),
  note: z.string().max(8000),
  cards: z.array(DiscoveryCardSchema).max(80),
  current: ProcessBlueprintSchema.nullable(),
  target: ProcessBlueprintSchema.nullable(),
  volume: z.string().max(30),
  minutes: z.string().max(30),
  hourlyCost: z.string().max(30),
  automation: z.string().max(30),
  scope: z.string().max(4000),
  acceptance: z.string().max(4000),
  example: z.boolean(),
}).strict();

export type Workshop = z.infer<typeof WorkshopSchema>;

export function emptyWorkshop(): Workshop {
  return { version: 1, company: "", useCase: "", note: "", cards: [], current: null, target: null,
    volume: "", minutes: "", hourlyCost: "", automation: "", scope: "", acceptance: "", example: false };
}

export function readWorkshop(value: string): Workshop {
  if (value.length > 1_000_000) throw new Error("Die Sitzungsdatei ist zu groß (max. 1 MB).");
  return WorkshopSchema.parse(JSON.parse(value));
}

// Data associations are context, never executable transitions in the walkthrough.
export function nextSteps(blueprint: ProcessBlueprint, nodeId: string): ProcessEdge[] {
  const data = new Set(blueprint.nodes.filter(n => n.type === "data_source").map(n => n.id));
  return blueprint.edges.filter(e => e.from === nodeId && !data.has(e.to) && !data.has(e.from));
}

export function insertStep(blueprint: ProcessBlueprint, after: string, node: ProcessNode): ProcessBlueprint {
  const outgoing = nextSteps(blueprint, after);
  if (outgoing.length !== 1 || blueprint.nodes.find(n => n.id === after)?.type === "gateway") {
    throw new Error("Wählen Sie einen Schritt mit genau einem Folgeweg zum Einfügen.");
  }
  const edge = outgoing[0];
  return ProcessBlueprintSchema.parse({ ...blueprint,
    nodes: blueprint.nodes.flatMap(existing => existing.id === after ? [existing, node] : [existing]),
    edges: blueprint.edges.flatMap(e => e === edge ? [{ ...e, to: node.id }, { from: node.id, to: e.to }] : [e]),
  });
}

export function removeStep(blueprint: ProcessBlueprint, nodeId: string): ProcessBlueprint {
  const node = blueprint.nodes.find(n => n.id === nodeId);
  const outgoing = nextSteps(blueprint, nodeId);
  const data = new Set(blueprint.nodes.filter(n => n.type === "data_source").map(n => n.id));
  const incoming = blueprint.edges.filter(e => e.to === nodeId && !data.has(e.from));
  if (!node || ["start", "end", "gateway", "data_source"].includes(node.type) || outgoing.length !== 1 || incoming.length !== 1) {
    throw new Error("Nur einzelne Arbeitsschritte mit einem Ein- und Ausgang können entfernt werden.");
  }
  return ProcessBlueprintSchema.parse({ ...blueprint,
    nodes: blueprint.nodes.filter(n => n.id !== nodeId),
    edges: [...blueprint.edges.filter(e => e.from !== nodeId && e.to !== nodeId), { ...incoming[0], to: outgoing[0].to }],
    automationOpportunities: blueprint.automationOpportunities.filter(item => item.step !== node.label),
  });
}

export function updateStep(blueprint: ProcessBlueprint, node: ProcessNode): ProcessBlueprint {
  const old = blueprint.nodes.find(n => n.id === node.id);
  const systems = blueprint.systems.filter(system => system !== old?.system || blueprint.nodes.some(n => n.id !== node.id && n.system === system) || system === node.system);
  return ProcessBlueprintSchema.parse({ ...blueprint,
    nodes: blueprint.nodes.map(n => n.id === node.id ? node : n),
    systems: [...new Set([...systems, ...(node.system ? [node.system] : [])])],
    automationOpportunities: blueprint.automationOpportunities.filter(item => item.step !== old?.label || old.type === node.type).map(item => item.step === old?.label ? { ...item, step: node.label } : item),
  });
}

export function newProcess(name: string): ProcessBlueprint {
  return ProcessBlueprintSchema.parse({
    processName: name.trim() || "Ihr Prozess", mission: "Das gewünschte Ergebnis gemeinsam konkretisieren.",
    nodes: [
      { id: "start", type: "start", label: "Anfrage geht ein", confidence: "assumed" },
      { id: "task", type: "human_task", label: "Anfrage bearbeiten", confidence: "assumed" },
      { id: "end", type: "end", label: "Ergebnis dokumentiert", confidence: "assumed" },
    ],
    edges: [{ from: "start", to: "task" }, { from: "task", to: "end" }],
    systems: [], dataSources: [], painPoints: [], assumptions: ["Start, Bearbeitung und Ergebnis sind Platzhalter für das Gespräch."],
    missingInformation: ["Welche Aufgabe soll der Agent übernehmen?", "Welche Systeme und Freigaben werden benötigt?"], automationOpportunities: [],
  });
}

export function workshopBrief(workshop: Workshop): string {
  const target = workshop.target;
  const bullets = (values: string[]) => values.length ? values.map(v => `- ${v}`).join("\n") : "- Im Gespräch noch festzulegen.";
  const nodeList = (types: string[]) => target?.nodes.filter(n => types.includes(n.type)).map(n => `${n.label}${n.system ? ` (${n.system})` : ""} — ${n.confidence === "confirmed" ? "im Modell bestätigt" : n.confidence === "assumed" ? "Annahme" : "offen"}`) ?? [];
  return [
    `# ${workshop.useCase || "AI Agent"} · Umsetzungskonzept`,
    `Unternehmen: ${workshop.company || "Noch offen"}`,
    `Status: ${workshop.example ? "Beispielszenario" : "Gesprächsentwurf"}. Kein verbindliches Angebot.`,
    "## Ziel", target?.mission ?? workshop.current?.mission ?? "Noch festzulegen.",
    "## Aufgaben des AI Agents", bullets(nodeList(["ai_task"])),
    "## Systemanbindungen und Regeln", bullets(nodeList(["service_task", "business_rule"])),
    "## Menschliche Verantwortung", bullets(nodeList(["human_task", "approval"])),
    "## Vereinbarter Pilotumfang", workshop.scope || "Noch gemeinsam abzugrenzen.",
    "## Abnahmekriterien", workshop.acceptance || "Noch mit realen Beispielfällen festzulegen.",
    "## Annahmen", bullets(target?.assumptions ?? workshop.current?.assumptions ?? []),
    "## Offene Fragen", bullets(target?.missingInformation ?? workshop.current?.missingInformation ?? []),
    "## Gesprächsnotizen", workshop.note || "Keine offenen Notizen.",
    "## Erfasste Anforderungen", bullets(workshop.cards.map(c => `${c.title}${c.description ? `: ${c.description}` : ""}`)),
    "## Wirtschaftliche Eingaben", `Vorgänge/Monat: ${workshop.volume || "offen"}; Minuten/Vorgang: ${workshop.minutes || "offen"}; Vollkosten/Stunde: ${workshop.hourlyCost || "offen"} EUR; angenommene Zeitentlastung: ${workshop.automation || "offen"} %.`,
    "Eine daraus berechnete Zeitentlastung ist eine Szenariorechnung, keine zugesagte Einsparung. Implementierung und Betrieb sind separat zu kalkulieren.",
    "## Umsetzung durch XPORTAL", "1. Prozess, Datenzugriffe und Pilotumfang bestätigen.\n2. Agent, Systemanbindungen und Freigaben implementieren.\n3. An vereinbarten Fällen testen und gemeinsam abnehmen.\n4. Kontrolliert starten, überwachen und verbessern.",
    "Die BPMN-Datei beschreibt den fachlichen Entwurf (nicht ausführbar). Der Probelauf ist eine Visualisierung und führt keine Aktionen in Kundensystemen aus.",
  ].join("\n\n");
}
