/**
 * Die Betriebsarten der Lead-Automatik als reine Daten und Regeln — ohne
 * Datenbank, damit Oberfläche und Tests sie teilen (lib/leadgen/automation.ts
 * liest und schreibt sie).
 *
 * Sie gelten je Vorgang getrennt. „Sofort“ ist beim Abgleich harmlos, beim
 * Versand nicht — sonst gingen Werbemails nachts um drei raus, weil das
 * Importwerkzeug dann läuft (docs/leadgen-betriebsarten.md).
 */

export const LEAD_PREPARE_MODES = ["on_arrival", "scheduled", "manual"] as const;
export type LeadPrepareMode = (typeof LEAD_PREPARE_MODES)[number];

export const LEAD_SEND_MODES = ["scheduled", "manual"] as const;
export type LeadSendMode = (typeof LEAD_SEND_MODES)[number];

export type LeadAutomation = {
  prepareMode: LeadPrepareMode;
  sendMode: LeadSendMode;
  pausedUntil: string | null;
  /** Übersteuert LEAD_BULK_SEND_LIMIT, wenn gesetzt. */
  dailyLimit: number | null;
  lastArrivalTriggerAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const LEAD_PREPARE_MODE_LABELS: Readonly<Record<LeadPrepareMode, string>> = {
  on_arrival: "Sofort bei Eingang",
  scheduled: "Nach Zeitplan",
  manual: "Nur per Knopf",
};

export const LEAD_SEND_MODE_LABELS: Readonly<Record<LeadSendMode, string>> = {
  scheduled: "Automatisch",
  manual: "Nur nach Freigabe",
};

/** Angehalten? Dann ruht jede Automatik, ohne dass die Betriebsart verloren geht. */
export function isLeadAutomationPaused(
  automation: Pick<LeadAutomation, "pausedUntil">,
  now: Date = new Date(),
): boolean {
  if (!automation.pausedUntil) return false;
  const bis = Date.parse(automation.pausedUntil);
  return Number.isFinite(bis) && bis > now.getTime();
}

/** Darf der Zeitgeber selbst verschicken? Der Betreiber darf es immer. */
export function scheduledSendAllowed(
  automation: Pick<LeadAutomation, "sendMode" | "pausedUntil">,
  now: Date = new Date(),
): boolean {
  return automation.sendMode === "scheduled" && !isLeadAutomationPaused(automation, now);
}

/** Darf der Zeitgeber selbst abgleichen? */
export function scheduledPrepareAllowed(
  automation: Pick<LeadAutomation, "prepareMode" | "pausedUntil">,
  now: Date = new Date(),
): boolean {
  return automation.prepareMode !== "manual" && !isLeadAutomationPaused(automation, now);
}

/** Ein Satz über den Zustand, für Übersicht und Leads-Seite. */
export function leadAutomationSummary(
  automation: Pick<LeadAutomation, "prepareMode" | "sendMode" | "pausedUntil" | "dailyLimit">,
  defaultDailyLimit: number,
  now: Date = new Date(),
): string {
  if (isLeadAutomationPaused(automation, now)) {
    const bis = new Date(automation.pausedUntil!);
    return `Angehalten bis ${bis.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Berlin",
    })} Uhr.`;
  }
  const abgleich =
    automation.prepareMode === "manual"
      ? "Abgleich nur per Knopf"
      : automation.prepareMode === "on_arrival"
        ? "Abgleich sofort bei Eingang"
        : "Abgleich nach Zeitplan";
  const versand =
    automation.sendMode === "scheduled"
      ? `Versand automatisch Mo–Fr 8–12 Uhr, höchstens ${automation.dailyLimit ?? defaultDailyLimit} am Tag`
      : "Versand nur nach Freigabe";
  return `${abgleich} · ${versand}.`;
}
