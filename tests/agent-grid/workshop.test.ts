import { describe, expect, it } from "vitest";
import { ProcessBlueprintSchema } from "@/lib/agent-grid/blueprint";
import { bpmnId, processBlueprintToBpmnXml } from "@/lib/agent-grid/bpmn";
import { SCENARIOS, scenarioWorkshop } from "@/lib/agent-grid/scenarios";
import { insertStep, nextSteps, readWorkshop, removeStep, updateStep, workshopBrief, WorkshopSchema } from "@/lib/agent-grid/workshop";
import { calculateProcessEconomics, parseNonNegativeDecimal } from "@/lib/agent-grid/economics";

describe("Agent Grid workshop", () => {
  it.each(SCENARIOS)("round-trips the complete $label session with valid IST and SOLL graphs", ({ id }) => {
    const workshop = scenarioWorkshop(id);
    expect(WorkshopSchema.safeParse(workshop).success).toBe(true);
    expect(readWorkshop(JSON.stringify(workshop))).toEqual(workshop);
    expect(ProcessBlueprintSchema.safeParse(workshop.current).success).toBe(true);
    expect(ProcessBlueprintSchema.safeParse(workshop.target).success).toBe(true);
  });

  it("preserves branches and data associations when inserting and removing a step", () => {
    const base = scenarioWorkshop("property").target!;
    const node = { id: "review-approval", label: "Antwort freigeben", type: "approval" as const, confidence: "assumed" as const };
    const inserted = insertStep(base, "prepare_action", node);
    expect(nextSteps(inserted, "prepare_action")).toEqual([{ from: "prepare_action", to: "review-approval" }]);
    expect(nextSteps(inserted, node.id)).toEqual([{ from: "review-approval", to: "update_system" }]);
    expect(nextSteps(inserted, "standard_case")).toEqual(nextSteps(base, "standard_case"));
    const removed = removeStep(inserted, node.id);
    expect(removed.nodes).toEqual(base.nodes);
    expect(removed.edges).toEqual(expect.arrayContaining(base.edges));
    expect(removed.edges).toHaveLength(base.edges.length);
  });

  it("keeps approval and branch selection explicit and never walks into data stores", () => {
    const target = scenarioWorkshop("property").target!;
    expect(nextSteps(target, "standard_case").map(e => e.label)).toEqual(["Ja", "Nein"]);
    expect(nextSteps(target, "contract_data")).toEqual([]);
    expect(nextSteps(target, "exception_review")[0].to).toBe("case_resolved");
    expect(() => insertStep(target, "standard_case", { id: "bad", type: "ai_task", label: "Bad", confidence: "assumed" })).toThrow();
    expect(() => removeStep(target, "standard_case")).toThrow();
    expect(() => removeStep(target, "request_received")).toThrow();
  });

  it("updates a task and retains systems documented elsewhere in the blueprint", () => {
    const blueprint = scenarioWorkshop("service").target!;
    const node = blueprint.nodes.find(n => n.id === "understand")!;
    const next = updateStep({ ...blueprint, systems: [...blueprint.systems, "Wissensbasis"] }, { ...node, system: "Microsoft 365", label: "Anfrage klassifizieren" });
    expect(next.systems).toEqual(["CRM", "Wissensbasis", "Microsoft 365"]);
    expect(next.nodes.find(n => n.id === node.id)?.label).toBe("Anfrage klassifizieren");
  });

  it("rejects corrupt, oversized, future-version and dangling-reference files", () => {
    const workshop = scenarioWorkshop("service");
    expect(() => readWorkshop("not json")).toThrow();
    expect(() => readWorkshop("x".repeat(1_000_001))).toThrow();
    expect(() => readWorkshop(JSON.stringify({ ...workshop, version: 2 }))).toThrow();
    expect(() => readWorkshop(JSON.stringify({ ...workshop, target: { ...workshop.target, edges: [{ from: "missing", to: "result" }] } }))).toThrow();
  });

  it("does not collide hyphens with underscores in exported XML and viewer IDs", () => {
    expect(bpmnId("Node", "step-a")).not.toBe(bpmnId("Node", "step_a"));
    const target = scenarioWorkshop("service").target!;
    const withStep = insertStep(target, "understand", { id: "step-a", label: "Prüfen & zuordnen", type: "ai_task", confidence: "assumed" });
    const xml = processBlueprintToBpmnXml(withStep);
    expect(xml).toContain('id="Node_step-a"');
    expect(xml).toContain('targetRef="Node_step-a"');
    expect(xml).toContain("Prüfen &amp; zuordnen");
    expect(xml).toContain('isExecutable="false"');
  });

  it("exports the discussed scope, inputs, assumptions and human responsibilities", () => {
    const workshop = { ...scenarioWorkshop("invoice"), scope: "Nur Postfach Rechnungen", acceptance: "20 vereinbarte Testfälle", volume: "500", minutes: "12", hourlyCost: "45", automation: "40" };
    const brief = workshopBrief(workshop);
    for (const text of ["Nur Postfach Rechnungen", "20 vereinbarte Testfälle", "Abweichung prüfen", "500", "Annahme", "Beispielszenario", "keine zugesagte Einsparung"]) expect(brief).toContain(text);
    expect(calculateProcessEconomics({ volumePerMonth: "500", minutesPerCase: "12", hourlyCost: "45" })).toEqual({ hoursPerMonth: 100, currentProcessCost: 4500 });
  });

  it("rejects hexadecimal/scientific inputs and does not return infinite costs", () => {
    expect(parseNonNegativeDecimal("0x10")).toBeNull();
    expect(parseNonNegativeDecimal("1e9")).toBeNull();
    expect(parseNonNegativeDecimal("12,5")).toBe(12.5);
    const economics = calculateProcessEconomics({ volumePerMonth: "9".repeat(250), minutesPerCase: "9".repeat(250), hourlyCost: "10" });
    expect(economics).toEqual({ hoursPerMonth: null, currentProcessCost: null });
  });
});
