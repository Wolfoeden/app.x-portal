import { describe, expect, it } from "vitest";
import { assertWorkflowOperationAllowed, deriveWorkflowControls } from "@/lib/domain/workflow-controls";

describe("project operational permissions", () => {
  it("retains and enforces independent research and contact bans", () => {
    const source = "React zwingend. Nur vorhandene Profile abgleichen, keine externe Recherche oder Kontaktaufnahme.";
    expect(deriveWorkflowControls(source)).toEqual({ externalResearch: "blocked", contact: "blocked" });
    expect(() => assertWorkflowOperationAllowed(source, "contact")).toThrow();
  });
  it("only lifts an operation after an explicit latest permission", () => {
    const source = "Keine externe Recherche oder Kontaktaufnahme. Externe Recherche ist jetzt ausdrücklich erlaubt.";
    expect(deriveWorkflowControls(source)).toEqual({ externalResearch: "allowed", contact: "blocked" });
    expect(deriveWorkflowControls(`${source}\nKontaktaufnahme ist jetzt erlaubt.`).contact).toBe("allowed");
    expect(deriveWorkflowControls(`${source}\nKeine externe Recherche.`).externalResearch).toBe("blocked");
  });
  it("keeps candidate obligations distinct from software commands", () => {
    expect(deriveWorkflowControls("Der Freelancer muss Recherche durchführen und darf keine Kunden anschreiben.")).toEqual({ externalResearch: "allowed", contact: "allowed" });
  });
});
