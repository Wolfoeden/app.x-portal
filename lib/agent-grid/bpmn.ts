import type {
  ProcessBlueprint,
  ProcessEdge,
  ProcessNode,
} from "@/lib/agent-grid/blueprint";

type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };

const SHAPE_SIZE: Record<ProcessNode["type"], { width: number; height: number }> = {
  start: { width: 40, height: 40 },
  human_task: { width: 142, height: 82 },
  ai_task: { width: 142, height: 82 },
  service_task: { width: 142, height: 82 },
  business_rule: { width: 142, height: 82 },
  gateway: { width: 56, height: 56 },
  approval: { width: 142, height: 82 },
  data_source: { width: 64, height: 64 },
  end: { width: 40, height: 40 },
};

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function bpmnId(prefix: string, id: string): string {
  // Hyphens are valid XML NCName characters. Preserving them prevents collisions
  // between e.g. step-a and step_a, and keeps viewer selections reversible.
  return `${prefix}_${id}`;
}

function bpmnElement(node: ProcessNode): string {
  const id = bpmnId("Node", node.id);
  const name = xml(
    node.type === "approval" ? `Freigabe: ${node.label}` : node.label,
  );
  switch (node.type) {
    case "start":
      return `<bpmn:startEvent id="${id}" name="${name}" />`;
    case "end":
      return `<bpmn:endEvent id="${id}" name="${name}" />`;
    case "human_task":
    case "approval":
      return `<bpmn:userTask id="${id}" name="${name}" />`;
    case "ai_task":
    case "service_task":
      return `<bpmn:serviceTask id="${id}" name="${name}" />`;
    case "business_rule":
      return `<bpmn:businessRuleTask id="${id}" name="${name}" />`;
    case "gateway":
      return `<bpmn:exclusiveGateway id="${id}" name="${name}" />`;
    case "data_source":
      return `<bpmn:dataStoreReference id="${id}" name="${name}" dataStoreRef="${bpmnId("DataStore", node.id)}" />`;
  }
}

function processEdges(
  blueprint: ProcessBlueprint,
): { sequence: ProcessEdge[]; associations: ProcessEdge[] } {
  const nodeMap = new Map(blueprint.nodes.map((node) => [node.id, node]));
  const sequence: ProcessEdge[] = [];
  const associations: ProcessEdge[] = [];
  for (const edge of blueprint.edges) {
    if (
      nodeMap.get(edge.from)?.type === "data_source" ||
      nodeMap.get(edge.to)?.type === "data_source"
    ) {
      associations.push(edge);
    } else {
      sequence.push(edge);
    }
  }
  return { sequence, associations };
}

function levelByNode(
  nodes: readonly ProcessNode[],
  edges: readonly ProcessEdge[],
): Map<string, number> {
  const flowNodes = nodes.filter((node) => node.type !== "data_source");
  const ids = new Set(flowNodes.map((node) => node.id));
  const incoming = new Map(flowNodes.map((node) => [node.id, 0]));
  const outgoing = new Map(flowNodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = flowNodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const levels = new Map<string, number>(queue.map((id) => [id, 0]));
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const nextLevel = (levels.get(current) ?? 0) + 1;
    for (const target of outgoing.get(current) ?? []) {
      levels.set(target, Math.max(levels.get(target) ?? 0, nextLevel));
      incoming.set(target, (incoming.get(target) ?? 1) - 1);
      if ((incoming.get(target) ?? 0) === 0) queue.push(target);
    }
  }

  let fallbackLevel = Math.max(0, ...levels.values()) + 1;
  for (const node of flowNodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, fallbackLevel);
      fallbackLevel += 1;
    }
  }
  return levels;
}

function layout(
  blueprint: ProcessBlueprint,
  sequenceEdges: readonly ProcessEdge[],
): Map<string, Box> {
  const levels = levelByNode(blueprint.nodes, sequenceEdges);
  const grouped = new Map<number, ProcessNode[]>();
  for (const node of blueprint.nodes.filter(
    (candidate) => candidate.type !== "data_source",
  )) {
    const level = levels.get(node.id) ?? 0;
    grouped.set(level, [...(grouped.get(level) ?? []), node]);
  }

  const boxes = new Map<string, Box>();
  const xStart = 100;
  const xGap = 184;
  const largestGroup = Math.max(1, ...[...grouped.values()].map(group => group.length));
  const yGap = 146;
  const yCenter = 160 + ((largestGroup - 1) * yGap) / 2;
  for (const [level, nodes] of [...grouped.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    const totalHeight = (nodes.length - 1) * yGap;
    nodes.forEach((node, index) => {
      const size = SHAPE_SIZE[node.type];
      boxes.set(node.id, {
        x: xStart + level * xGap,
        y: yCenter - totalHeight / 2 + index * yGap - size.height / 2,
        ...size,
      });
    });
  }

  const dataNodes = blueprint.nodes.filter((node) => node.type === "data_source");
  const flowMaxX = Math.max(
    xStart,
    ...[...boxes.values()].map((box) => box.x + box.width),
  );
  dataNodes.forEach((node, index) => {
    const related = blueprint.edges.find(
      (edge) => edge.from === node.id || edge.to === node.id,
    );
    const peerId =
      related && related.from === node.id ? related.to : related?.from;
    const peer = peerId ? boxes.get(peerId) : undefined;
    const size = SHAPE_SIZE.data_source;
    boxes.set(node.id, {
      x: peer ? peer.x + (peer.width - size.width) / 2 : flowMaxX - 100 * index,
      y: peer ? peer.y + peer.height + 94 : 440,
      ...size,
    });
  });
  return boxes;
}

function center(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function connectionWaypoints(from: Box, to: Box): Point[] {
  const fromCenter = center(from);
  const toCenter = center(to);
  if (Math.abs(fromCenter.x - toCenter.x) < 20) {
    return [
      { x: fromCenter.x, y: from.y + from.height },
      { x: toCenter.x, y: to.y },
    ];
  }
  const direction = toCenter.x >= fromCenter.x ? 1 : -1;
  const start = {
    x: direction > 0 ? from.x + from.width : from.x,
    y: fromCenter.y,
  };
  const end = {
    x: direction > 0 ? to.x : to.x + to.width,
    y: toCenter.y,
  };
  if (Math.abs(start.y - end.y) < 10) return [start, end];
  const middleX = start.x + (end.x - start.x) / 2;
  return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
}

function waypointsXml(points: readonly Point[]): string {
  return points
    .map(
      (point) =>
        `<di:waypoint x="${Math.round(point.x)}" y="${Math.round(point.y)}" />`,
    )
    .join("");
}

export function processBlueprintToBpmnXml(blueprint: ProcessBlueprint): string {
  const { sequence, associations } = processEdges(blueprint);
  const boxes = layout(blueprint, sequence);
  const width = Math.max(
    900,
    ...[...boxes.values()].map((box) => box.x + box.width + 100),
  );
  const height = Math.max(
    360,
    ...[...boxes.values()].map((box) => box.y + box.height + 90),
  );

  const dataStores = blueprint.nodes
    .filter((node) => node.type === "data_source")
    .map(
      (node) =>
        `<bpmn:dataStore id="${bpmnId("DataStore", node.id)}" name="${xml(node.label)}" />`,
    )
    .join("");
  const nodeElements = blueprint.nodes.map(bpmnElement).join("");
  const sequenceElements = sequence
    .map(
      (edge, index) =>
        `<bpmn:sequenceFlow id="Flow_${index + 1}" sourceRef="${bpmnId("Node", edge.from)}" targetRef="${bpmnId("Node", edge.to)}"${edge.label ? ` name="${xml(edge.label)}"` : ""} />`,
    )
    .join("");
  const associationElements = associations
    .map(
      (edge, index) =>
        `<bpmn:association id="Association_${index + 1}" sourceRef="${bpmnId("Node", edge.from)}" targetRef="${bpmnId("Node", edge.to)}" associationDirection="One" />`,
    )
    .join("");
  const shapeElements = blueprint.nodes
    .map((node) => {
      const box = boxes.get(node.id);
      if (!box) return "";
      return `<bpmndi:BPMNShape id="Shape_${node.id}" bpmnElement="${bpmnId("Node", node.id)}"><dc:Bounds x="${Math.round(box.x)}" y="${Math.round(box.y)}" width="${box.width}" height="${box.height}" /></bpmndi:BPMNShape>`;
    })
    .join("");
  const sequenceDi = sequence
    .map((edge, index) => {
      const from = boxes.get(edge.from);
      const to = boxes.get(edge.to);
      if (!from || !to) return "";
      return `<bpmndi:BPMNEdge id="Edge_Flow_${index + 1}" bpmnElement="Flow_${index + 1}">${waypointsXml(connectionWaypoints(from, to))}</bpmndi:BPMNEdge>`;
    })
    .join("");
  const associationDi = associations
    .map((edge, index) => {
      const from = boxes.get(edge.from);
      const to = boxes.get(edge.to);
      if (!from || !to) return "";
      return `<bpmndi:BPMNEdge id="Edge_Association_${index + 1}" bpmnElement="Association_${index + 1}">${waypointsXml(connectionWaypoints(from, to))}</bpmndi:BPMNEdge>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_AgentGrid" targetNamespace="https://x-portal.eu/agent-grid">
  ${dataStores}
  <bpmn:collaboration id="Collaboration_AgentGrid">
    <bpmn:participant id="Participant_AgentGrid" name="${xml(blueprint.processName)}" processRef="Process_AgentGrid" />
  </bpmn:collaboration>
  <bpmn:process id="Process_AgentGrid" name="${xml(blueprint.processName)}" isExecutable="false">
    ${nodeElements}
    ${sequenceElements}
    ${associationElements}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_AgentGrid">
    <bpmndi:BPMNPlane id="Plane_AgentGrid" bpmnElement="Collaboration_AgentGrid">
      <bpmndi:BPMNShape id="Shape_Participant_AgentGrid" bpmnElement="Participant_AgentGrid" isHorizontal="true">
        <dc:Bounds x="35" y="45" width="${Math.round(width)}" height="${Math.round(height)}" />
      </bpmndi:BPMNShape>
      ${shapeElements}
      ${sequenceDi}
      ${associationDi}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
