import { describe, expect, it } from "vitest";
import { agentDestination } from "@/lib/recruiting/agent-redirect";
describe("legacy recruiting entry", () => {
  it("keeps campaign origin while preventing project text and redirect targets from entering the destination", () => {
    const destination = agentDestination(new URLSearchParams({ utm_source: "reddit", utm_campaign: "recruiters", q: "private project", next: "https://evil.example", text: "private CV" }));
    expect(destination).toBe("/chat?utm_source=reddit&utm_campaign=recruiters");
  });
  it("only forwards existing project identifiers when they are UUIDs", () => {
    expect(agentDestination(new URLSearchParams({ project: "11111111-1111-4111-8111-111111111111", profil: "private name" }))).toBe("/chat?project=11111111-1111-4111-8111-111111111111");
  });
});
