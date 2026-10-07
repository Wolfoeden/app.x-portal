import { isWorkflowInstruction } from "./workflow-instructions";

export type WorkflowControls = { externalResearch: "allowed" | "blocked"; contact: "allowed" | "blocked" };

/**
 * Source is retained by the project. A later explicit permission changes only
 * that operation; candidate criteria and implicit hints cannot lift a ban.
 */
export function deriveWorkflowControls(source: string): WorkflowControls {
  const controls: WorkflowControls = { externalResearch: "allowed", contact: "allowed" };
  for (const clause of source.split(/\r?\n|(?<=[.!?;])\s+/u)) {
    const explicitPermission = /\b(?:erlaubt|erlaube|erlauben|gestattet|freigegeben|zulassen|ausdrücklich\s+(?:starten|erlauben)|explicitly\s+allow|allow(?:ed)?)\b/iu.test(clause)
      && !/\b(?:nicht|keine?|not|no)\b/iu.test(clause);
    const external = /\b(?:externe?\s+recherche|external\s+research|web(?:suche|recherche)|zusätzliche?\s+recherche)\b/iu.test(clause);
    const contact = /\b(?:kontaktaufnahme|kontaktanfragen|kontaktieren|anschreiben|outreach|contact)\b/iu.test(clause);
    if (explicitPermission) {
      if (external) controls.externalResearch = "allowed";
      if (contact) controls.contact = "allowed";
      continue;
    }
    if (!isWorkflowInstruction(clause)) continue;
    if (/\b(?:nur|ausschließlich|ausschliesslich|only)\s+(?:die\s+)?(?:vorhandene[nr]?|bestehende[nr]?|gespeicherte[nr]?|interne[nr]?|existing|internal)\s+(?:profile|kandidaten|profiles)\b/iu.test(clause)) controls.externalResearch = "blocked";
    if (/\b(?:keine?|ohne|nicht|no|without|do not)\b/iu.test(clause)) {
      if (external) controls.externalResearch = "blocked";
      if (contact) controls.contact = "blocked";
    }
  }
  return controls;
}

export function assertWorkflowOperationAllowed(source: string, operation: "externalResearch" | "contact"): void {
  if (deriveWorkflowControls(source)[operation] === "blocked") {
    throw new Response(operation === "externalResearch"
      ? "Sie haben externe Recherche für dieses Projekt ausgeschlossen. Ändern Sie diese Steuerungsanweisung ausdrücklich, bevor Sie eine zusätzliche Recherche starten."
      : "Sie haben Kontaktaufnahme für dieses Projekt ausgeschlossen. Ändern Sie diese Steuerungsanweisung ausdrücklich, bevor Sie eine Kontaktanfrage senden.", { status: 409 });
  }
}
