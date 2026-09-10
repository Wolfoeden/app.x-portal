import { z } from "zod";

export const DiscoveryCardTypeSchema = z.enum([
  "process_step",
  "system",
  "data_source",
  "decision",
  "pain_point",
  "exception",
  "human_approval",
  "cost_volume",
  "note",
]);

export type DiscoveryCardType = z.infer<typeof DiscoveryCardTypeSchema>;

export const DiscoveryCardSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    type: DiscoveryCardTypeSchema,
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().max(1_000).optional(),
  })
  .strict();

export type DiscoveryCard = z.infer<typeof DiscoveryCardSchema>;

export const ProcessNodeTypeSchema = z.enum([
  "start",
  "human_task",
  "ai_task",
  "service_task",
  "business_rule",
  "gateway",
  "approval",
  "data_source",
  "end",
]);

export type ProcessNodeType = z.infer<typeof ProcessNodeTypeSchema>;

export const ProcessConfidenceSchema = z.enum([
  "confirmed",
  "assumed",
  "unclear",
]);

export type ProcessConfidence = z.infer<typeof ProcessConfidenceSchema>;

const ProcessNodeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/u);

export const ProcessNodeSchema = z
  .object({
    id: ProcessNodeIdSchema,
    type: ProcessNodeTypeSchema,
    label: z.string().trim().min(1).max(180),
    description: z.string().trim().max(1_000).optional(),
    system: z.string().trim().max(120).optional(),
    confidence: ProcessConfidenceSchema,
    sourceNotes: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
  })
  .strict();

export type ProcessNode = z.infer<typeof ProcessNodeSchema>;

export const ProcessEdgeSchema = z
  .object({
    from: ProcessNodeIdSchema,
    to: ProcessNodeIdSchema,
    label: z.string().trim().max(100).optional(),
  })
  .strict();

export type ProcessEdge = z.infer<typeof ProcessEdgeSchema>;

export const AutomationOpportunitySchema = z
  .object({
    step: z.string().trim().min(1).max(180),
    recommendation: z.enum([
      "remove",
      "rule",
      "api",
      "automation",
      "ai",
      "human",
      "human_approval",
    ]),
    explanation: z.string().trim().min(1).max(800),
  })
  .strict();

export const ProcessBlueprintSchema = z
  .object({
    processName: z.string().trim().min(1).max(180),
    mission: z.string().trim().min(1).max(1_000),
    nodes: z.array(ProcessNodeSchema).min(2).max(80),
    edges: z.array(ProcessEdgeSchema).max(140),
    systems: z.array(z.string().trim().min(1).max(120)).max(30),
    dataSources: z.array(z.string().trim().min(1).max(180)).max(30),
    painPoints: z.array(z.string().trim().min(1).max(500)).max(40),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(40),
    missingInformation: z.array(z.string().trim().min(1).max(500)).max(40),
    automationOpportunities: z.array(AutomationOpportunitySchema).max(50),
  })
  .strict()
  .superRefine((blueprint, context) => {
    const nodeIds = new Set<string>();
    const nodeTypes = new Map<string, ProcessNodeType>();
    for (const [index, node] of blueprint.nodes.entries()) {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: "Node IDs must be unique.",
          path: ["nodes", index, "id"],
        });
      }
      nodeIds.add(node.id);
      nodeTypes.set(node.id, node.type);
    }

    const edgeKeys = new Set<string>();
    const incomingSequence = new Map<string, number>();
    const outgoingSequence = new Map<string, number>();
    for (const [index, edge] of blueprint.edges.entries()) {
      if (!nodeIds.has(edge.from)) {
        context.addIssue({
          code: "custom",
          message: "Edge source does not exist.",
          path: ["edges", index, "from"],
        });
      }
      if (!nodeIds.has(edge.to)) {
        context.addIssue({
          code: "custom",
          message: "Edge target does not exist.",
          path: ["edges", index, "to"],
        });
      }
      if (edge.from === edge.to) {
        context.addIssue({
          code: "custom",
          message: "Self-referencing edges are not supported in V1.",
          path: ["edges", index],
        });
      }
      const edgeKey = `${edge.from}\u0000${edge.to}`;
      if (edgeKeys.has(edgeKey)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate edges are not supported in V1.",
          path: ["edges", index],
        });
      }
      edgeKeys.add(edgeKey);

      const fromType = nodeTypes.get(edge.from);
      const toType = nodeTypes.get(edge.to);
      const isSequence = fromType !== "data_source" && toType !== "data_source";
      if (isSequence) {
        incomingSequence.set(edge.to, (incomingSequence.get(edge.to) ?? 0) + 1);
        outgoingSequence.set(edge.from, (outgoingSequence.get(edge.from) ?? 0) + 1);
        if (toType === "start") {
          context.addIssue({
            code: "custom",
            message: "A start node cannot have an incoming sequence flow.",
            path: ["edges", index, "to"],
          });
        }
        if (fromType === "end") {
          context.addIssue({
            code: "custom",
            message: "An end node cannot have an outgoing sequence flow.",
            path: ["edges", index, "from"],
          });
        }
      }
    }

    if (!blueprint.nodes.some((node) => node.type === "start")) {
      context.addIssue({
        code: "custom",
        message: "A process needs at least one start node.",
        path: ["nodes"],
      });
    }
    if (!blueprint.nodes.some((node) => node.type === "end")) {
      context.addIssue({
        code: "custom",
        message: "A process needs at least one end node.",
        path: ["nodes"],
      });
    }

    for (const [index, node] of blueprint.nodes.entries()) {
      if (node.type === "data_source") continue;
      if (node.type !== "start" && !incomingSequence.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: "Every non-start process node needs an incoming sequence flow.",
          path: ["nodes", index, "id"],
        });
      }
      if (node.type !== "end" && !outgoingSequence.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: "Every non-end process node needs an outgoing sequence flow.",
          path: ["nodes", index, "id"],
        });
      }
    }
  });

export type ProcessBlueprint = z.infer<typeof ProcessBlueprintSchema>;

export const AgentGridAnalysisInputSchema = z
  .object({
    requestId: z.string().trim().min(8).max(160),
    mode: z.enum(["current", "target"]),
    useCase: z.string().trim().max(300),
    company: z.string().trim().max(300),
    cards: z.array(DiscoveryCardSchema).max(80),
    newNote: z.string().trim().max(8_000),
    currentBlueprint: ProcessBlueprintSchema.nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.mode === "current" &&
      !input.newNote &&
      input.cards.length === 0 &&
      !input.currentBlueprint
    ) {
      context.addIssue({
        code: "custom",
        message: "At least one discovery input is required.",
        path: ["newNote"],
      });
    }
    if (input.mode === "target" && !input.currentBlueprint) {
      context.addIssue({
        code: "custom",
        message: "A current-state blueprint is required.",
        path: ["currentBlueprint"],
      });
    }
  });

export type AgentGridAnalysisInput = z.infer<
  typeof AgentGridAnalysisInputSchema
>;

export const AgentGridAnalysisResponseSchema = z
  .object({
    blueprint: ProcessBlueprintSchema,
    suggestedCards: z.array(DiscoveryCardSchema).max(20),
  })
  .strict();

export type AgentGridAnalysisResponse = z.infer<
  typeof AgentGridAnalysisResponseSchema
>;

export const DISCOVERY_CARD_LABELS: Record<DiscoveryCardType, string> = {
  process_step: "Prozessschritt",
  system: "System",
  data_source: "Datenquelle",
  decision: "Entscheidung",
  pain_point: "Pain Point",
  exception: "Ausnahme",
  human_approval: "Human Approval",
  cost_volume: "Kosten / Volumen",
  note: "Notiz",
};

export const PROCESS_NODE_LABELS: Record<ProcessNodeType, string> = {
  start: "Start Event",
  human_task: "Human Task",
  ai_task: "AI Task",
  service_task: "Software / API",
  business_rule: "Business Rule",
  gateway: "Entscheidung",
  approval: "Freigabe",
  data_source: "Datenquelle",
  end: "End Event",
};

export const DEMO_DISCOVERY_CARDS: DiscoveryCard[] = [
  {
    id: "demo-outlook",
    type: "system",
    title: "Outlook",
    description: "Mieteranfragen kommen per E-Mail an.",
  },
  {
    id: "demo-identify",
    type: "process_step",
    title: "Mieter und Objekt identifizieren",
  },
  {
    id: "demo-property-software",
    type: "system",
    title: "Hausverwaltungssoftware",
  },
  {
    id: "demo-contract",
    type: "data_source",
    title: "Vertrags- und Objektdaten",
  },
  {
    id: "demo-categorize",
    type: "decision",
    title: "Welches Anliegen liegt vor?",
  },
  {
    id: "demo-repair",
    type: "process_step",
    title: "Bei Reparaturen Ticket erstellen",
  },
  {
    id: "demo-legal",
    type: "exception",
    title: "Rechtlicher Sonderfall",
    description: "Geht zur manuellen Prüfung an einen Mitarbeiter.",
  },
  {
    id: "demo-duplicate",
    type: "pain_point",
    title: "Daten werden teilweise zwischen Systemen übertragen",
  },
];

export const DEMO_CURRENT_BLUEPRINT: ProcessBlueprint =
  ProcessBlueprintSchema.parse({
    processName: "Mieter-Service – IST",
    mission:
      "Mieteranfragen aufnehmen, anhand von Mieter-, Objekt- und Vertragsdaten einordnen und nachvollziehbar bearbeiten.",
    nodes: [
      {
        id: "request_received",
        type: "start",
        label: "Mieteranfrage eingegangen",
        confidence: "confirmed",
        sourceNotes: ["Mieteranfragen kommen per E-Mail über Outlook."],
      },
      {
        id: "capture_email",
        type: "human_task",
        label: "Anfrage aus Outlook erfassen",
        system: "Outlook",
        confidence: "assumed",
        sourceNotes: ["Mieteranfragen kommen per E-Mail über Outlook."],
      },
      {
        id: "identify_tenant",
        type: "human_task",
        label: "Mieter und Objekt identifizieren",
        system: "Hausverwaltungssoftware",
        confidence: "confirmed",
        sourceNotes: ["Mitarbeiter identifiziert Mieter und Objekt."],
      },
      {
        id: "contract_data",
        type: "data_source",
        label: "Vertrags- und Objektdaten",
        system: "Hausverwaltungssoftware",
        confidence: "confirmed",
        sourceNotes: [
          "Vertragsinformationen werden aus der Hausverwaltungssoftware geprüft.",
        ],
      },
      {
        id: "check_contract",
        type: "human_task",
        label: "Vertragsinformationen prüfen",
        system: "Hausverwaltungssoftware",
        confidence: "confirmed",
        sourceNotes: [
          "Vertragsinformationen werden aus der Hausverwaltungssoftware geprüft.",
        ],
      },
      {
        id: "categorize_request",
        type: "human_task",
        label: "Anliegen kategorisieren",
        confidence: "confirmed",
        sourceNotes: ["Anliegen wird kategorisiert."],
      },
      {
        id: "repair_gateway",
        type: "gateway",
        label: "Reparatur oder Standardfall?",
        confidence: "assumed",
      },
      {
        id: "create_ticket",
        type: "human_task",
        label: "Reparaturticket erstellen",
        confidence: "confirmed",
        sourceNotes: ["Bei Reparaturen wird ein Ticket erstellt."],
      },
      {
        id: "prepare_response",
        type: "human_task",
        label: "Standardantwort erstellen",
        confidence: "confirmed",
        sourceNotes: ["Standardfälle erhalten eine Antwort."],
      },
      {
        id: "legal_review",
        type: "human_task",
        label: "Rechtlichen Sonderfall prüfen",
        description: "Manuelle Prüfung durch einen Sachbearbeiter.",
        confidence: "confirmed",
        sourceNotes: ["Rechtliche Sonderfälle gehen an einen Mitarbeiter."],
      },
      {
        id: "case_documented",
        type: "end",
        label: "Vorgang dokumentiert",
        confidence: "assumed",
      },
    ],
    edges: [
      { from: "request_received", to: "capture_email" },
      { from: "capture_email", to: "identify_tenant" },
      { from: "identify_tenant", to: "check_contract" },
      { from: "contract_data", to: "check_contract", label: "liefert Daten" },
      { from: "check_contract", to: "categorize_request" },
      { from: "categorize_request", to: "repair_gateway" },
      { from: "repair_gateway", to: "create_ticket", label: "Reparatur" },
      { from: "repair_gateway", to: "prepare_response", label: "Standard" },
      { from: "repair_gateway", to: "legal_review", label: "Sonderfall" },
      { from: "create_ticket", to: "case_documented" },
      { from: "prepare_response", to: "case_documented" },
      { from: "legal_review", to: "case_documented" },
    ],
    systems: ["Outlook", "Hausverwaltungssoftware"],
    dataSources: ["Mieteranfrage", "Vertrags- und Objektdaten"],
    painPoints: ["Daten werden teilweise zwischen Systemen übertragen."],
    assumptions: [
      "Die Outlook-Anfrage wird zunächst manuell erfasst.",
      "Jeder Vorgang endet mit einer dokumentierten Bearbeitung.",
    ],
    missingInformation: [
      "Welches Ticketsystem wird verwendet?",
      "Besitzt die Hausverwaltungssoftware eine API?",
      "Wie viele Mieteranfragen entstehen pro Monat?",
      "Welche Fälle benötigen zwingend eine menschliche Freigabe?",
    ],
    automationOpportunities: [
      {
        step: "Anfrage aus Outlook erfassen",
        recommendation: "automation",
        explanation: "E-Mails können ohne erneute manuelle Eingabe übernommen werden.",
      },
      {
        step: "Anliegen kategorisieren",
        recommendation: "ai",
        explanation: "Der freie E-Mail-Text muss inhaltlich interpretiert werden.",
      },
      {
        step: "Vertragsinformationen prüfen",
        recommendation: "api",
        explanation: "Bekannte Datensätze sollten deterministisch abgerufen werden.",
      },
    ],
  });

export const DEMO_TARGET_BLUEPRINT: ProcessBlueprint =
  ProcessBlueprintSchema.parse({
    processName: "Mieter-Service – SOLL",
    mission:
      "Mieteranfragen strukturiert aufnehmen, Standardfälle zuverlässig automatisieren und Ausnahmen kontrolliert an Menschen übergeben.",
    nodes: [
      {
        id: "request_received",
        type: "start",
        label: "Mieteranfrage eingegangen",
        confidence: "confirmed",
        sourceNotes: ["Mieteranfragen kommen per E-Mail über Outlook."],
      },
      {
        id: "understand_request",
        type: "ai_task",
        label: "Anfrage verstehen & klassifizieren",
        description: "Unstrukturierter E-Mail-Text wird extrahiert und kategorisiert.",
        system: "Outlook",
        confidence: "assumed",
      },
      {
        id: "identify_tenant",
        type: "service_task",
        label: "Mieter und Objekt identifizieren",
        system: "Hausverwaltungssoftware",
        confidence: "assumed",
      },
      {
        id: "contract_data",
        type: "data_source",
        label: "Vertrags- und Objektdaten",
        system: "Hausverwaltungssoftware",
        confidence: "confirmed",
        sourceNotes: [
          "Vertragsinformationen werden aus der Hausverwaltungssoftware geprüft.",
        ],
      },
      {
        id: "fetch_contract",
        type: "service_task",
        label: "Vertrags-/Objektdaten abrufen",
        system: "Hausverwaltungssoftware",
        confidence: "assumed",
      },
      {
        id: "standard_case",
        type: "gateway",
        label: "Standardfall?",
        confidence: "assumed",
      },
      {
        id: "prepare_action",
        type: "ai_task",
        label: "Antwort oder Aktion vorbereiten",
        description: "Die Formulierung wird vorbereitet; Regeln bestimmen die zulässige Aktion.",
        confidence: "assumed",
      },
      {
        id: "update_system",
        type: "service_task",
        label: "Ticket / System aktualisieren",
        confidence: "assumed",
      },
      {
        id: "inform_tenant",
        type: "service_task",
        label: "Mieter informieren",
        system: "Outlook",
        confidence: "assumed",
      },
      {
        id: "exception_review",
        type: "approval",
        label: "Sachbearbeiter prüft Ausnahmefall",
        description: "Freigabe bei rechtlichen oder unklaren Fällen.",
        confidence: "assumed",
      },
      {
        id: "case_documented",
        type: "end",
        label: "Vorgang dokumentiert",
        confidence: "assumed",
      },
      {
        id: "case_resolved",
        type: "end",
        label: "Vorgang bearbeitet",
        confidence: "assumed",
      },
    ],
    edges: [
      { from: "request_received", to: "understand_request" },
      { from: "understand_request", to: "identify_tenant" },
      { from: "identify_tenant", to: "fetch_contract" },
      { from: "contract_data", to: "fetch_contract", label: "liefert Daten" },
      { from: "fetch_contract", to: "standard_case" },
      { from: "standard_case", to: "prepare_action", label: "Ja" },
      { from: "prepare_action", to: "update_system" },
      { from: "update_system", to: "inform_tenant" },
      { from: "inform_tenant", to: "case_documented" },
      { from: "standard_case", to: "exception_review", label: "Nein" },
      { from: "exception_review", to: "case_resolved" },
    ],
    systems: ["Outlook", "Hausverwaltungssoftware"],
    dataSources: ["Mieteranfrage", "Vertrags- und Objektdaten"],
    painPoints: ["Doppelte Dateneingabe entfällt im Soll-Prozess."],
    assumptions: [
      "Outlook und Hausverwaltungssoftware können technisch angebunden werden.",
      "Standardfälle dürfen ohne einzelne menschliche Freigabe beantwortet werden.",
      "Rechtliche und unklare Ausnahmefälle benötigen eine menschliche Freigabe.",
    ],
    missingInformation: [
      "Welches Ticketsystem wird verwendet?",
      "Besitzt die Hausverwaltungssoftware eine API?",
      "Welche Fallklassen gelten als Standardfall?",
    ],
    automationOpportunities: [
      {
        step: "Anfrage verstehen & klassifizieren",
        recommendation: "ai",
        explanation: "Unstrukturierter Text erfordert Kontextinterpretation.",
      },
      {
        step: "Vertrags-/Objektdaten abrufen",
        recommendation: "api",
        explanation: "Bekannte Datensätze werden zuverlässiger deterministisch abgerufen.",
      },
      {
        step: "Sachbearbeiter prüft Ausnahmefall",
        recommendation: "human_approval",
        explanation: "Rechtliche und unklare Fälle bleiben bei einem Menschen.",
      },
    ],
  });
