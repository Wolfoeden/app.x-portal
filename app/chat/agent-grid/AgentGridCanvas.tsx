"use client";

import { useEffect, useRef, useState } from "react";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import type { ProcessNode } from "@/lib/agent-grid/blueprint";
import { bpmnId } from "@/lib/agent-grid/bpmn";
import styles from "./agent-grid.module.css";

type CanvasService = {
  addMarker(element: string, marker: string): void;
  removeMarker(element: string, marker: string): void;
  zoom(scale?: number | "fit-viewport", center?: "auto"): number;
  resized(): void;
  viewbox(box?: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number };
};
type ViewerLike = {
  importXML(xml: string): Promise<unknown>;
  get<T>(name: string): T;
  on<T>(event: string, callback: (event: T) => void): void;
  destroy(): void;
};

export function AgentGridCanvas({ xml, nodes, selectedId, activeId, completedIds, onSelect }: {
  xml: string; nodes: ProcessNode[]; selectedId: string | null;
  activeId?: string | null; completedIds?: string[]; onSelect: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerLike | null>(null);
  const [ready, setReady] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [zoomLabel, setZoomLabel] = useState(100);

  useEffect(() => {
    let disposed = false;
    let viewer: ViewerLike | null = null;
    let observer: ResizeObserver | null = null;
    async function render() {
      try {
        const { default: Viewer } = await import("bpmn-js/lib/NavigatedViewer");
        if (disposed || !hostRef.current) return;
        await document.fonts.ready;
        if (disposed || !hostRef.current) return;
        viewer = new Viewer({ container: hostRef.current,
          textRenderer: { defaultStyle: { fontFamily: getComputedStyle(hostRef.current).fontFamily, fontSize: 13 }, externalStyle: { fontSize: 12 } },
        }) as ViewerLike;
        await viewer.importXML(xml);
        if (disposed) return;
        viewerRef.current = viewer;
        const canvas = viewer.get<CanvasService>("canvas");
        for (const node of nodes) {
          canvas.addMarker(bpmnId("Node", node.id), `agent-grid-${node.type}`);
          if (node.confidence !== "confirmed") canvas.addMarker(bpmnId("Node", node.id), "agent-grid-assumed");
        }
        canvas.zoom("fit-viewport", "auto");
        viewer.on<{ element?: { id?: string } }>("element.click", event => {
          const node = nodes.find(n => bpmnId("Node", n.id) === event.element?.id);
          if (node) onSelect(node.id);
        });
        viewer.on("canvas.viewbox.changed", () => setZoomLabel(Math.round(canvas.zoom() * 100)));
        observer = new ResizeObserver(() => { canvas.resized(); canvas.zoom("fit-viewport", "auto"); });
        observer.observe(hostRef.current);
        setError(null);
        setReady(value => value + 1);
      } catch {
        if (!disposed) setError("Das Diagramm konnte nicht geladen werden. Die Prozessschritte bleiben rechts bearbeitbar.");
      }
    }
    void render();
    return () => { disposed = true; observer?.disconnect(); viewerRef.current = null; viewer?.destroy(); };
  }, [xml, nodes, onSelect]);

  useEffect(() => {
    const canvas = viewerRef.current?.get<CanvasService>("canvas");
    if (!canvas) return;
    for (const node of nodes) {
      const id = bpmnId("Node", node.id);
      for (const [marker, enabled] of [
        ["agent-grid-selected", node.id === selectedId],
        ["agent-grid-running", node.id === activeId],
        ["agent-grid-completed", completedIds?.includes(node.id)],
      ] as const) {
        if (enabled) canvas.addMarker(id, marker); else canvas.removeMarker(id, marker);
      }
    }
  }, [nodes, selectedId, activeId, completedIds, ready]);

  function zoom(delta: number) {
    const canvas = viewerRef.current?.get<CanvasService>("canvas");
    if (canvas) canvas.zoom(Math.min(2.5, Math.max(0.2, canvas.zoom() + delta)));
  }
  function focusStep() {
    const viewer = viewerRef.current;
    const id = activeId ?? selectedId;
    if (!viewer || !id) return;
    const element = viewer.get<{ get(id: string): { x: number; y: number; width: number; height: number } }>("elementRegistry").get(bpmnId("Node", id));
    const canvas = viewer.get<CanvasService>("canvas");
    canvas.zoom(1.15);
    const box = canvas.viewbox();
    canvas.viewbox({ ...box, x: element.x + element.width / 2 - box.width / 2, y: element.y + element.height / 2 - box.height / 2 });
  }

  return <div className={styles.canvasFrame}>
    <div className={styles.canvasLegend} aria-label="Verantwortung im Prozess">
      <span data-kind="ai_task"><i />AI Agent</span><span data-kind="service_task"><i />System / API</span>
      <span data-kind="human_task"><i />Mensch</span><span data-kind="approval"><i />Freigabe</span>
      <span className={styles.assumedLegend}>Gestrichelt = Annahme</span>
    </div>
    <div ref={hostRef} className={styles.canvasHost} role="img" aria-label="BPMN-2.0-Prozessdiagramm. Alle Schritte sind über die Schrittliste auswählbar." />
    <div className={styles.canvasControls} aria-label="Diagramm-Zoom">
      <button type="button" onClick={() => zoom(-0.15)} aria-label="Verkleinern">−</button>
      <span>{zoomLabel} %</span>
      <button type="button" onClick={() => zoom(0.15)} aria-label="Vergrößern">+</button>
      <button type="button" onClick={() => viewerRef.current?.get<CanvasService>("canvas").zoom("fit-viewport", "auto")}>Einpassen</button>
      <button type="button" disabled={!selectedId && !activeId} onClick={focusStep}>Schritt fokussieren</button>
    </div>
    {error && <p className={styles.canvasError} role="alert">{error}</p>}
  </div>;
}
