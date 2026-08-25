import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildVersionsDiffer,
  ChatWorkspace,
  IncompleteChatStreamError,
  parseStreamResponse,
  projectStatusLabel,
  sidebarChatGroups,
} from "@/components/ChatWorkspace";

function eventStream(...events: unknown[]): Response {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("chat stream recovery", () => {
  it("detects a real client/server build mismatch without guessing missing versions", () => {
    expect(buildVersionsDiffer("client-a", "server-b")).toBe(true);
    expect(buildVersionsDiffer("same", "same")).toBe(false);
    expect(buildVersionsDiffer(null, "server-b")).toBe(false);
  });

  it("retains the announced project id when a stream ends before its result", async () => {
    const projectId = "0f3790bb-6cf3-48bd-ad1f-7402149ce6a2";
    const response = eventStream(
      { type: "accepted", projectId, buildVersion: "build-123" },
      { type: "heartbeat", at: 1_786_574_400_000 },
      { type: "progress", label: "Anforderungen werden strukturiert …" },
    );

    const error = await parseStreamResponse(response, () => undefined, "Projekt")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(IncompleteChatStreamError);
    expect(error).toMatchObject({ projectId, buildVersion: "build-123" });
  });

  it("uses one honest retry message when no saved project was announced", async () => {
    const response = eventStream({ type: "text_delta", delta: "Teilantwort" });

    const error = await parseStreamResponse(response, () => undefined, "Projekt")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(IncompleteChatStreamError);
    expect(error).toMatchObject({ projectId: null });
    expect((error as Error).message).toBe(
      "Die Übertragung wurde unterbrochen. Bitte versuchen Sie die Anfrage erneut.",
    );
    expect((error as Error).message).not.toContain("Eingabe bleibt");
  });
});

describe("sidebar hierarchy", () => {
  it("places Neuer Chat, Merkliste and Agenten before saved chats", () => {
    const markup = renderToStaticMarkup(createElement(ChatWorkspace));
    const newChat = markup.indexOf('data-sidebar-primary="new-chat"');
    const team = markup.indexOf('data-sidebar-primary="team"');
    const agents = markup.indexOf('data-sidebar-primary="agents"');
    const savedChats = markup.indexOf('aria-label="Gespeicherte Chats"');

    expect(newChat).toBeGreaterThan(-1);
    expect(team).toBeGreaterThan(newChat);
    expect(agents).toBeGreaterThan(team);
    expect(savedChats).toBeGreaterThan(agents);
    expect(markup).toContain("Merkliste");
  });

  it("groups chat history by recency and translates workflow states", () => {
    const groups = sidebarChatGroups([
      { id: "today", title: "Heute", updatedAt: "2026-08-25T12:00:00.000Z", status: "matching" },
      { id: "yesterday", title: "Gestern", updatedAt: "2026-08-24T12:00:00.000Z", status: "shortlisted" },
      { id: "older", title: "Früher", updatedAt: "2026-08-01T12:00:00.000Z", status: "closed" },
    ], new Date("2026-08-25T15:00:00.000Z"));

    expect(groups.map((group) => group.label)).toEqual(["Heute", "Gestern", "Früher"]);
    expect(projectStatusLabel("matching")).toBe("Abgleich");
    expect(projectStatusLabel("shortlisted")).toBe("Auswahl");
    expect(projectStatusLabel("closed")).toBe("Abgeschlossen");
  });
});
