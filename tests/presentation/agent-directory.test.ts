import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  agentById,
  agentCatalog,
  agentTaskById,
} from "@/components/AgentDirectory";
import { ChatWorkspace } from "@/components/ChatWorkspace";
import {
  previewAnalysis,
  previewAuth,
  previewBrief,
  previewUsage,
} from "@/components/chat/preview-fixtures";

const forbiddenPersonNames = ["Elena", "Hannah", "Alex", "Jamal", "Maya"];

describe("agent directory", () => {
  it("uses functional roles instead of invented person identities", () => {
    const catalogText = JSON.stringify(agentCatalog);
    const ids = agentCatalog.map((agent) => agent.id);

    expect(agentCatalog).toHaveLength(6);
    expect(new Set(ids).size).toBe(ids.length);
    expect(agentCatalog.every((agent) => agent.tasks.length >= 2)).toBe(true);

    for (const name of forbiddenPersonNames) {
      expect(catalogText).not.toContain(name);
    }
  });

  it("includes a guarded EU packaging workflow for merchants", () => {
    const packagingAgent = agentById("eu-packaging-traceability");

    expect(packagingAgent.featured).toBe(true);
    expect(packagingAgent.title).toContain("EU-Verpackungsverfolgung");
    expect(packagingAgent.description).toContain("keine Rechtsberatung");
    expect(packagingAgent.description).toContain("aktueller Primärquellen");
    expect(packagingAgent.tasks).toHaveLength(3);
    expect(agentTaskById(packagingAgent, null)).toBe(packagingAgent.tasks[0]);
  });

  it("renders the agent experience inside the familiar chat shell", () => {
    const markup = renderToStaticMarkup(
      createElement(ChatWorkspace, {
        view: "agents",
        previewData: {
          auth: previewAuth,
          projects: [],
          messages: [],
          brief: previewBrief,
          profiles: [],
          analysis: previewAnalysis,
          usage: previewUsage,
        },
      }),
    );

    expect(markup).toContain('href="/agent"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("KI-Agenten beginnen mit einer klaren Aufgabe.");
    expect(markup).toContain("Konkrete Aufgaben");
    expect(markup).toContain("Ausgangspunkt");
    expect(markup).toContain("Ergebnis");
    expect(markup).toContain("Keine externe Aktion ohne Freigabe");
    expect(markup).toContain("EU-Verpackungsverfolgung für Händler");
    expect(markup).toContain("Noch keine autonome Ausführung.");
    expect(markup).not.toContain('id="chat-composer"');

    for (const name of forbiddenPersonNames) {
      expect(markup).not.toContain(name);
    }
  });

  it("shows the truthful tasks to guests while keeping usage behind an account", () => {
    // Metadaten und sichtbare Seite dürfen keine unterschiedlichen Aufgaben
    // versprechen. Ein Gast kann Aufgaben und Grenzen prüfen, aber nichts
    // ausführen und wird vor der Nutzung zum Konto geführt.
    const markup = renderToStaticMarkup(
      createElement(ChatWorkspace, { view: "agents" }),
    );

    expect(markup).toContain("Aufgaben prüfen. Für die Nutzung Konto erstellen.");
    expect(markup).toContain("Konto erstellen");
    expect(markup).toContain("KI-Agenten beginnen mit einer klaren Aufgabe.");
    expect(markup).toContain("Konkrete Aufgaben");
    expect(markup).toContain("Noch keine autonome Ausführung.");
  });
});
