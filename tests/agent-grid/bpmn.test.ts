import { describe, expect, it } from "vitest";

import {
  DEMO_TARGET_BLUEPRINT,
  ProcessBlueprintSchema,
} from "@/lib/agent-grid/blueprint";
import { processBlueprintToBpmnXml } from "@/lib/agent-grid/bpmn";

describe("processBlueprintToBpmnXml", () => {
  it("generates deterministic BPMN 2.0 XML without an AI XML step", () => {
    const first = processBlueprintToBpmnXml(DEMO_TARGET_BLUEPRINT);
    const second = processBlueprintToBpmnXml(DEMO_TARGET_BLUEPRINT);

    expect(second).toBe(first);
    expect(first).toContain("<bpmn:definitions");
    expect(first).toContain('isExecutable="false"');
    expect(first).toContain('<bpmn:startEvent id="Node_request_received"');
    expect(first).toContain('<bpmn:serviceTask id="Node_understand_request"');
    expect(first).toContain('<bpmn:exclusiveGateway id="Node_standard_case"');
    expect(first).toContain('<bpmn:userTask id="Node_exception_review"');
    expect(first).toContain('name="Freigabe: Sachbearbeiter prüft Ausnahmefall"');
    expect(first).toContain('<bpmn:endEvent id="Node_case_documented"');
  });

  it("renders data links as associations rather than sequence flows", () => {
    const xml = processBlueprintToBpmnXml(DEMO_TARGET_BLUEPRINT);

    expect(xml).toContain(
      'sourceRef="Node_contract_data" targetRef="Node_fetch_contract" associationDirection="One"',
    );
    expect(xml).not.toContain(
      '<bpmn:sequenceFlow id="Flow_4" sourceRef="Node_contract_data"',
    );
    expect(xml).toContain('<bpmn:dataStoreReference id="Node_contract_data"');
  });

  it("escapes labels before embedding them into XML", () => {
    const blueprint = ProcessBlueprintSchema.parse({
      processName: 'Prüfung & Freigabe "A"',
      mission: "Test",
      nodes: [
        {
          id: "start",
          type: "start",
          label: "Eingang <neu>",
          confidence: "confirmed",
        },
        {
          id: "end",
          type: "end",
          label: "Fertig & dokumentiert",
          confidence: "confirmed",
        },
      ],
      edges: [{ from: "start", to: "end", label: 'Ja & "sicher"' }],
      systems: [],
      dataSources: [],
      painPoints: [],
      assumptions: [],
      missingInformation: [],
      automationOpportunities: [],
    });

    const xml = processBlueprintToBpmnXml(blueprint);
    expect(xml).toContain('name="Prüfung &amp; Freigabe &quot;A&quot;"');
    expect(xml).toContain('name="Eingang &lt;neu&gt;"');
    expect(xml).toContain('name="Ja &amp; &quot;sicher&quot;"');
  });
});
