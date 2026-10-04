/**
 * Suchaufträge („XPORTAL sucht für Sie“) als reine Daten und Regeln, ohne
 * Datenbank: Stände, Wörter, der Mail-Entwurf an den Kunden. Seite, Routen
 * und Tests teilen sie (lib/placement/mandates.ts liest und schreibt).
 *
 * Ein Suchauftrag ist noch keine Anfrage an einen bestimmten Freelancer. Er
 * hält fest, wer sucht, wie er erreichbar ist und dass er den
 * Vermittlungsbedingungen zugestimmt hat. Erst die Zuordnung durch den
 * Betreiber macht daraus Anfragen mit Honoraranspruch.
 */

import { PLACEMENT_TERMS } from "./config";

export const MANDATE_STATUSES = ["open", "in_progress", "introduced", "closed", "declined"] as const;
export type MandateStatus = (typeof MANDATE_STATUSES)[number];

export const MANDATE_STATUS_LABELS: Readonly<Record<MandateStatus, string>> = {
  open: "Neu",
  in_progress: "In Bearbeitung",
  introduced: "Vorgestellt",
  closed: "Abgeschlossen",
  declined: "Abgelehnt",
};

/** Noch Arbeit für den Betreiber. */
export const OPEN_MANDATE_STATUSES: readonly MandateStatus[] = ["open", "in_progress"];

export function isMandateStatus(value: unknown): value is MandateStatus {
  return typeof value === "string" && (MANDATE_STATUSES as readonly string[]).includes(value);
}

export type Mandate = {
  id: string;
  projectId: string;
  projectTitle: string | null;
  /** Die verstandenen Anforderungen in einer Zeile, sofern ein Brief vorliegt. */
  briefSummary: string | null;
  contactEmail: string;
  contactCompany: string | null;
  contactName: string | null;
  contactPhone: string | null;
  note: string | null;
  /** Ohne Konto aufgegeben: Die Adresse ist nicht bestätigt. */
  guest: boolean;
  status: MandateStatus;
  termsVersion: string;
  createdAt: string;
  handledAt: string | null;
};

/** Was der Kunde nach dem Absenden liest. */
export const MANDATE_CONFIRMATION =
  "Ihr Suchauftrag ist eingegangen. XPORTAL prüft passende Freelancer und meldet sich innerhalb eines Werktags per E-Mail.";

/** Wenn zu diesem Projekt schon ein offener Auftrag liegt. */
export const MANDATE_EXISTS =
  "Zu diesem Projekt liegt Ihr Suchauftrag bereits vor. XPORTAL meldet sich per E-Mail.";

const WORK_MODE_LABELS: Readonly<Record<string, string>> = {
  remote: "remote",
  hybrid: "hybrid",
  on_site: "vor Ort",
};

/**
 * Die Anforderungen in einer Zeile: Titel, Muss- und Kern-Kompetenzen, Start
 * und Arbeitsmodus, soweit der Brief sie kennt.
 */
export function briefLine(brief: {
  projectTitle?: string | null;
  requiredSkills?: readonly string[] | null;
  startWindow?: { raw?: string | null } | null;
  workMode?: string | null;
} | null): string | null {
  if (!brief) return null;
  const parts = [
    brief.requiredSkills?.length ? brief.requiredSkills.slice(0, 6).join(", ") : null,
    brief.startWindow?.raw?.trim() || null,
    brief.workMode ? WORK_MODE_LABELS[brief.workMode] ?? null : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Die erste Antwort an den Kunden, aus dem Postfach des Betreibers. Sie nennt
 * den Auftrag, fragt nach dem, was für die Auswahl fehlt, und wiederholt das
 * Honorar — wer eine Vorstellung bekommt, soll nicht erst bei der Rechnung
 * davon erfahren.
 */
export function mandateMailDraft(mandate: Pick<Mandate, "contactName" | "projectTitle" | "briefSummary">): {
  subject: string;
  body: string;
} {
  const project = mandate.projectTitle?.trim() || "Ihr Projekt";
  const t = PLACEMENT_TERMS;
  return {
    subject: `Ihr Suchauftrag bei XPORTAL: ${project}`,
    body: [
      mandate.contactName ? `Guten Tag ${mandate.contactName},` : "Guten Tag,",
      "",
      `vielen Dank für Ihren Suchauftrag zu „${project}“.`,
      ...(mandate.briefSummary ? ["", `Verstanden haben wir: ${mandate.briefSummary}`] : []),
      "",
      "Damit ich Ihnen die passenden Freelancer vorstellen kann, helfen mir kurz: die wichtigste Aufgabe, gewünschter Start und Ihr Budget bzw. Tagessatzrahmen.",
      "",
      `Suche und Vorstellung sind kostenlos. Kommt es zur Beauftragung, berechnet XPORTAL einmalig ${t.feePercent} % des vereinbarten Honorars der ersten ${t.feeMonths} Monate (höchstens ${t.maxFeeDays} Projekttage), zuzüglich Umsatzsteuer.`,
      "",
      "Viele Grüße",
      "Roman Dering",
      "XPORTAL",
    ].join("\n"),
  };
}

/** Alter in Werktagstunden ist zu genau; Stunden und Tage reichen. */
export function mandateAge(createdAt: string, now: Date): string {
  const hours = Math.max(Math.floor((now.getTime() - Date.parse(createdAt)) / 3_600_000), 0);
  if (hours < 1) return "gerade eben";
  if (hours < 24) return `seit ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "seit 1 Tag" : `seit ${days} Tagen`;
}
