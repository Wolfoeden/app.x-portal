import { describe, expect, it } from "vitest";

import {
  DEMO_CURRENT_BLUEPRINT,
  ProcessBlueprintSchema,
} from "@/lib/agent-grid/blueprint";

describe("ProcessBlueprintSchema", () => {
  it("accepts the complete local discovery demo", () => {
    expect(ProcessBlueprintSchema.parse(DEMO_CURRENT_BLUEPRINT)).toEqual(
      DEMO_CURRENT_BLUEPRINT,
    );
  });

  it("rejects duplicate node IDs and dangling edges", () => {
    const invalid = {
      ...DEMO_CURRENT_BLUEPRINT,
      nodes: [
        ...DEMO_CURRENT_BLUEPRINT.nodes,
        { ...DEMO_CURRENT_BLUEPRINT.nodes[0] },
      ],
      edges: [
        ...DEMO_CURRENT_BLUEPRINT.edges,
        { from: "missing", to: "case_documented" },
      ],
    };

    const result = ProcessBlueprintSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Node IDs must be unique.",
        "Edge source does not exist.",
      ]),
    );
  });

  it("rejects disconnected process steps before they can reach the canvas", () => {
    const invalid = {
      ...DEMO_CURRENT_BLUEPRINT,
      nodes: [
        ...DEMO_CURRENT_BLUEPRINT.nodes,
        {
          id: "orphan_step",
          type: "human_task",
          label: "Nicht verbundener Schritt",
          confidence: "unclear",
        },
      ],
    };

    const result = ProcessBlueprintSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Every non-start process node needs an incoming sequence flow.",
        "Every non-end process node needs an outgoing sequence flow.",
      ]),
    );
  });
});
