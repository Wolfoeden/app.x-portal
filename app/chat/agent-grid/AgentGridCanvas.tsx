"use client";

import { useEffect, useRef, useState } from "react";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

import type { ProcessNode } from "@/lib/agent-grid/blueprint";

import styles from "./agent-grid.module.css";

type CanvasService = {
  addMarker(element: string, marker: string): void;
  removeMarker(element: string, marker: string): void;
  zoom(scale?: number | "fit-viewport"): number;
};

type ViewerLike = {
  importXML(xml: string): Promise<{ warnings: string[] }>;
  get<T>(name: string): T;
  on<T>(event: string, callback: (event: T) => void): void;
  destroy(): void;
};

type ElementClickEvent = {
  element?: { id?: string };
};

type CanvasMarker =
  | "agent-grid-ai"
  | "agent-grid-software"
  | "agent-grid-human"
  | "agent-grid-approval"
  | "agent-grid-data"
  | "agent-grid-assumed"
  | "agent-grid-unclear";

function ownershipMarker(node: ProcessNode): CanvasMarker | null {
  switch (node.type) {
    case "ai_task":
      return "agent-grid-ai";
    case "service_task":
    case "business_rule":
      return "agent-grid-software";
    case "human_task":
      return "agent-grid-human";
    case "approval":
      return "agent-grid-approval";
    case "data_source":
      return "agent-grid-data";
    default:
      return null;
  }
}

function confidenceMarker(
  node: ProcessNode,
): CanvasMarker | null {
  if (node.confidence === "assumed") return "agent-grid-assumed";
  if (node.confidence === "unclear") return "agent-grid-unclear";
  return null;
}

export function AgentGridCanvas({
  xml,
  nodes,
  selectedId,
  onSelect,
}: {
  xml: string;
  nodes: ProcessNode[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerLike | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function renderDiagram() {
      const host = hostRef.current;
      if (!host) return;
      setRenderError(null);
      try {
        const { default: NavigatedViewer } = await import(
          "bpmn-js/lib/NavigatedViewer"
        );
        if (disposed) return;
        const viewer = new NavigatedViewer({ container: host }) as ViewerLike;
        viewerRef.current = viewer;
        await viewer.importXML(xml);
        if (disposed) {
          viewer.destroy();
          return;
        }
        const canvas = viewer.get<CanvasService>("canvas");
        for (const node of nodes) {
          const elementId = `Node_${node.id}`;
          const ownership = ownershipMarker(node);
          const confidence = confidenceMarker(node);
          if (ownership) canvas.addMarker(elementId, ownership);
          if (confidence) canvas.addMarker(elementId, confidence);
        }
        if (selectedRef.current) {
          canvas.addMarker(
            `Node_${selectedRef.current}`,
            "agent-grid-selected",
          );
        }
        canvas.zoom("fit-viewport");
        viewer.on<ElementClickEvent>("element.click", (event) => {
          const elementId = event.element?.id;
          if (!elementId?.startsWith("Node_")) return;
          const nodeId = elementId.slice("Node_".length);
          if (nodes.some((node) => node.id === nodeId)) onSelect(nodeId);
        });
      } catch {
        if (!disposed) {
          setRenderError(
            "Das BPMN-Diagramm konnte nicht dargestellt werden. Der Blueprint bleibt erhalten.",
          );
        }
      }
    }

    void renderDiagram();
    return () => {
      disposed = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      selectedRef.current = null;
    };
  }, [nodes, onSelect, xml]);

  useEffect(() => {
    const canvas = viewerRef.current?.get<CanvasService>("canvas");
    if (canvas && selectedRef.current) {
      canvas.removeMarker(
        `Node_${selectedRef.current}`,
        "agent-grid-selected",
      );
    }
    selectedRef.current = selectedId;
    if (canvas && selectedId) {
      canvas.addMarker(`Node_${selectedId}`, "agent-grid-selected");
    }
  }, [selectedId]);

  function zoom(delta: number) {
    const canvas = viewerRef.current?.get<CanvasService>("canvas");
    if (!canvas) return;
    canvas.zoom(Math.min(2.5, Math.max(0.25, canvas.zoom() + delta)));
  }

  function fit() {
    viewerRef.current?.get<CanvasService>("canvas").zoom("fit-viewport");
  }

  return (
    <div className={styles.canvasFrame}>
      <div className={styles.canvasLegend} aria-label="Verantwortung im Prozess">
        <span data-kind="ai"><i aria-hidden />AI</span>
        <span data-kind="software"><i aria-hidden />Software / API</span>
        <span data-kind="human"><i aria-hidden />Mensch</span>
        <span data-kind="approval"><i aria-hidden />Freigabe</span>
        <span data-kind="data"><i aria-hidden />Daten</span>
      </div>
      <div className={styles.canvasControls} aria-label="Diagramm-Zoom">
        <button type="button" onClick={() => zoom(-0.15)} aria-label="Verkleinern">
          −
        </button>
        <button type="button" onClick={fit} aria-label="Diagramm einpassen">
          Fit
        </button>
        <button type="button" onClick={() => zoom(0.15)} aria-label="Vergrößern">
          +
        </button>
      </div>
      <div ref={hostRef} className={styles.canvasHost} aria-label="BPMN-Prozessdiagramm" />
      {renderError ? (
        <p className={styles.canvasError} role="alert">
          {renderError}
        </p>
      ) : null}
    </div>
  );
}
