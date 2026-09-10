import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentGridAnalysisInput } from "@/lib/agent-grid/blueprint";
import {
  analyzeProcessWithAi,
  type AgentGridResponsesClient,
} from "@/lib/agent-grid/ai";

const INPUT: AgentGridAnalysisInput = {
  requestId: "request-12345678",
  mode: "current",
  useCase: "Mieter-Service",
  company: "Beispiel GmbH",
  cards: [],
  newNote: "Mieteranfrage kommt in Outlook an. Mitarbeiter prüft die Anfrage.",
  currentBlueprint: null,
};

function candidate() {
  return {
    blueprint: {
      processName: "Mieter-Service – IST",
      mission: "Mieteranfragen nachvollziehbar bearbeiten.",
      nodes: [
        {
          id: "request_received",
          type: "start",
          label: "Mieteranfrage",
          description: null,
          system: "Outlook",
          confidence: "confirmed",
          sourceNotes: ["Mieteranfrage kommt in Outlook an."],
        },
        {
          id: "review_request",
          type: "human_task",
          label: "Anfrage prüfen",
          description: "Ein Mitarbeiter prüft den Fall.",
          system: null,
          confidence: "confirmed",
          sourceNotes: ["Mitarbeiter prüft die Anfrage."],
        },
        {
          id: "case_done",
          type: "end",
          label: "Vorgang bearbeitet",
          description: null,
          system: null,
          confidence: "assumed",
          sourceNotes: [],
        },
      ],
      edges: [
        { from: "request_received", to: "review_request", label: null },
        { from: "review_request", to: "case_done", label: null },
      ],
      systems: ["Outlook"],
      dataSources: ["Mieteranfrage"],
      painPoints: [],
      assumptions: ["Der Vorgang endet nach der Prüfung."],
      missingInformation: ["Was ist das konkrete Endergebnis?"],
      automationOpportunities: [
        {
          step: "Anfrage prüfen",
          recommendation: "human",
          explanation: "Die vorhandenen Informationen reichen nicht für Automation.",
        },
      ],
    },
    discoveredCards: [
      {
        type: "system",
        title: "Outlook",
        description: "Eingangskanal für Mieteranfragen.",
        sourceQuote: "Mieteranfrage kommt in Outlook an.",
      },
    ],
  } as const;
}

function mockClient(output: unknown) {
  const parse = vi.fn<AgentGridResponsesClient["parse"]>().mockResolvedValue({
    id: "resp_agent_grid_123",
    model: "gpt-5.4-nano-2026-03-17",
    output_parsed: output,
    usage: {
      input_tokens: 220,
      input_tokens_details: { cached_tokens: 20, cache_write_tokens: 0 },
      output_tokens: 180,
      total_tokens: 400,
    },
  });
  return { client: { parse } satisfies AgentGridResponsesClient, parse };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analyzeProcessWithAi", () => {
  it("requests a private structured response and validates it before returning", async () => {
    const { client, parse } = mockClient(candidate());

    const result = await analyzeProcessWithAi(INPUT, "usr_safe_identifier", true, {
      responsesClient: client,
      model: "test-model",
    });

    expect(result.ok).toBe(true);
    expect(parse).toHaveBeenCalledOnce();
    const [body, options] = parse.mock.calls[0] ?? [];
    expect(body).toMatchObject({
      model: "test-model",
      store: false,
      safety_identifier: "usr_safe_identifier",
      text: { format: { type: "json_schema" } },
    });
    expect(options).toMatchObject({ maxRetries: 0 });
    if (!result.ok) return;
    expect(result.value.blueprint.edges).toEqual([
      { from: "request_received", to: "review_request" },
      { from: "review_request", to: "case_done" },
    ]);
    expect(result.value.suggestedCards).toEqual([
      expect.objectContaining({ type: "system", title: "Outlook" }),
    ]);
  });

  it("drops invented systems and downgrades unsupported confirmed steps", async () => {
    const output = candidate();
    const unsupportedNode = {
      ...output.blueprint.nodes[1],
      label: "Bonität in SAP prüfen",
      system: "SAP",
      confidence: "confirmed" as const,
      sourceNotes: [],
    };
    const { client } = mockClient({
      ...output,
      blueprint: {
        ...output.blueprint,
        systems: ["Outlook", "SAP"],
        dataSources: ["Mieteranfrage", "Kundendatenbank"],
        nodes: [output.blueprint.nodes[0], unsupportedNode, output.blueprint.nodes[2]],
      },
    });

    const result = await analyzeProcessWithAi(INPUT, "usr_safe_identifier", true, {
      responsesClient: client,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blueprint.systems).toEqual(["Outlook"]);
    expect(result.value.blueprint.dataSources).toEqual(["Mieteranfrage"]);
    expect(result.value.blueprint.nodes[1]).toMatchObject({
      label: "Bonität in SAP prüfen",
      confidence: "assumed",
    });
    expect(result.value.blueprint.nodes[1]).not.toHaveProperty("system");
  });

  it("blocks semantically invalid output from reaching the canvas", async () => {
    const output = candidate();
    const { client } = mockClient({
      ...output,
      blueprint: { ...output.blueprint, edges: [] },
    });

    const result = await analyzeProcessWithAi(INPUT, "usr_safe_identifier", true, {
      responsesClient: client,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "invalid_output",
      providerAttempted: true,
    });
  });

  it("does not call OpenAI when the existing usage gate blocks the request", async () => {
    const { client, parse } = mockClient(candidate());

    const result = await analyzeProcessWithAi(INPUT, "usr_safe_identifier", false, {
      responsesClient: client,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "budget_blocked",
      providerAttempted: false,
      providerUsageDefinitelyZero: true,
    });
    expect(parse).not.toHaveBeenCalled();
  });
});
