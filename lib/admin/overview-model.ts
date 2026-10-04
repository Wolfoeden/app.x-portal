/**
 * Rechenregeln der Admin-Übersicht, ohne Datenbank: Zeiträume, Vergleich
 * mit dem Vorzeitraum, Tagesreihen in Berliner Zeit, Bewertung der
 * Zeitgeber und die Wörter für das Aktivitätsprotokoll.
 *
 * Reine Funktionen, damit Seite und Tests dieselben Regeln sehen.
 */

export const OVERVIEW_RANGES = [1, 7, 30] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

export const OVERVIEW_RANGE_LABELS: Readonly<Record<OverviewRange, string>> = {
  1: "Heute",
  7: "7 Tage",
  30: "30 Tage",
};

export function parseOverviewRange(value: unknown): OverviewRange {
  const number = Number(value);
  return (OVERVIEW_RANGES as readonly number[]).includes(number) ? (number as OverviewRange) : 7;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const berlinDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" });
const berlinClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** JJJJ-MM-TT in Berliner Zeit. */
export function berlinDayKey(value: Date | string): string {
  return berlinDay.format(typeof value === "string" ? new Date(value) : value);
}

/**
 * Beginn des Zeitraums: „Heute“ ab Mitternacht Berliner Zeit, sonst die
 * letzten N mal 24 Stunden. Der Vorzeitraum ist gleich lang und schließt an.
 */
export function rangeWindow(range: OverviewRange, now: Date): { start: Date; previousStart: Date } {
  if (range === 1) {
    // Mitternacht in Berlin: die Uhrzeit dort vom jetzigen Zeitpunkt abziehen.
    const parts = Object.fromEntries(
      berlinClock.formatToParts(now).map((part) => [part.type, part.value]),
    );
    const elapsed =
      ((Number(parts.hour) % 24) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000 +
      now.getMilliseconds();
    const start = new Date(now.getTime() - elapsed);
    return { start, previousStart: new Date(start.getTime() - DAY_MS) };
  }
  const start = new Date(now.getTime() - range * DAY_MS);
  return { start, previousStart: new Date(start.getTime() - range * DAY_MS) };
}

/** Wie viele Zeitstempel in [from, to) liegen. */
export function countBetween(timestamps: readonly string[], from: Date, to: Date): number {
  const a = from.getTime();
  const b = to.getTime();
  return timestamps.reduce((sum, value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) && time >= a && time < b ? sum + 1 : sum;
  }, 0);
}

/**
 * Veränderung gegenüber dem Vorzeitraum. Ohne Vorwert gibt es keinen
 * Prozentsatz, nur die Richtung — „+∞ %“ hilft niemandem.
 */
export function deltaLabel(
  current: number,
  previous: number,
  upIsGood = true,
): { text: string; tone: "good" | "bad" | "neutral" } {
  if (current === previous) return { text: "±0 zum Vorzeitraum", tone: "neutral" };
  const up = current > previous;
  const tone = up === upIsGood ? "good" : "bad";
  if (previous === 0) return { text: `+${current} zum Vorzeitraum`, tone };
  const percent = Math.round(((current - previous) / previous) * 100);
  return { text: `${percent > 0 ? "+" : ""}${percent} % zum Vorzeitraum`, tone };
}

/** Eine Zählung je Tag, die letzten `days` Tage bis heute (Berliner Zeit). */
export function dailySeries(
  timestamps: readonly string[],
  days: number,
  now: Date,
): Array<{ day: string; count: number }> {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(berlinDayKey(new Date(now.getTime() - offset * DAY_MS)));
  }
  const unique = [...new Set(keys)];
  const counts = new Map(unique.map((key) => [key, 0]));
  for (const value of timestamps) {
    const key = berlinDayKey(value);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return unique.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

/** „02.10.“ aus „2026-10-02“. */
export function shortDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}.${month}.`;
}

// Zeitgeber ---------------------------------------------------------------------------

export type CronJobHealth = {
  name: string;
  schedule: string;
  active: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
  runs24h: number;
  failures24h: number;
};

export type HttpHealth = {
  status: number;
  count: number;
  lastAt: string | null;
  lastBody: string | null;
  lastError: string | null;
};

export type SystemHealth = { generatedAt: string; jobs: CronJobHealth[]; http: HttpHealth[] };

export type Tone = "good" | "warning" | "critical" | "neutral";

export function jobTone(job: CronJobHealth): Tone {
  if (!job.active) return "neutral";
  if (job.failures24h > 0 && job.lastStatus !== "succeeded") return "critical";
  if (job.failures24h > 0) return "warning";
  return "good";
}

/**
 * Was eine HTTP-Antwort ohne Erfolg bedeutet. Die Antworttexte stammen von
 * den eigenen Routen; bekannte Fälle bekommen einen Namen und einen Hinweis,
 * was zu tun ist.
 */
export function explainHttpFailure(entry: Pick<HttpHealth, "status" | "lastBody" | "lastError">): {
  title: string;
  hint: string;
} {
  const body = entry.lastBody ?? "";
  if (body.includes("cron_secret_unconfigured")) {
    return {
      title: "Edge Function outreach-agent",
      hint: "Der alte Outreach-Agent (Cron outreach-agent-tick, alle 5 Min.) hat kein Geheimnis und tut nichts. Den Job abschalten oder das Geheimnis setzen.",
    };
  }
  if (body.includes("Ungültiges Token")) {
    return {
      title: "Token passt nicht",
      hint: "Das Geheimnis im Supabase-Vault stimmt nicht mit der Umgebungsvariable bei Netlify überein (z. B. PLACEMENT_RUN_SECRET für das Nachfassen der Vermittlungen).",
    };
  }
  if (body.includes("Mailversand ist nicht eingerichtet")) {
    return { title: "Mailversand fehlt", hint: "SMTP-Zugang oder EMAIL_UNSUBSCRIBE_SECRET fehlen bei Netlify." };
  }
  if (entry.status === 0) {
    return { title: "Keine Antwort", hint: entry.lastError ?? "Zeitüberschreitung oder Verbindung abgebrochen." };
  }
  return { title: `HTTP ${entry.status}`, hint: body || entry.lastError || "Ohne Antworttext." };
}

// Aktivität ------------------------------------------------------------------------------

/** Ereignisse, die jemand tun will; Seitenaufrufe des Betreibers und leere Läufe gehören nicht dazu. */
const ACTIVITY_LABELS: Readonly<Record<string, string>> = {
  signup_funnel_search_started: "Suche gestartet",
  signup_funnel_result_seen: "Ergebnis angesehen",
  signup_funnel_registration_started: "Registrierung begonnen",
  signup_funnel_signup_confirmed: "Konto bestätigt",
  signup_funnel_continuation_completed: "Nach Anmeldung weitergemacht",
  signup_funnel_pricing_viewed: "Preise angesehen",
  guest_workspace_claimed: "Gastsuche ins Konto übernommen",
  intro_requested: "Freelancer angefragt",
  billing_checkout_started: "Bezahlung begonnen",
  freelancer_application_submitted: "Freelancer-Bewerbung eingegangen",
  freelancer_application_published: "Freelancer-Profil freigegeben",
  freelancer_profile_created: "Freelancer-Profil angelegt",
  profile_page_viewed: "Profilseite aufgerufen",
  profile_panel_opened: "Profil im Chat geöffnet",
  profile_feedback_unsuitable: "Profil als unpassend markiert",
  email_unsubscribed: "Abmeldung von E-Mails",
  leadgen_outreach_sent_manually: "Lead-Mail verschickt",
  leadgen_automation_updated: "Lead-Automatik geändert",
  crm_contacts_imported: "Kontakte importiert",
  crm_contact_updated: "Kontakt bearbeitet",
  search_mandate_created: "Suchauftrag eingegangen",
  search_mandate_assigned: "Suchauftrag: Freelancer zugeordnet",
  contact_request_created: "Kontaktformular",
  lead_email_booking_click: "Termin-Link aus Lead-Mail geklickt",
};

export function activityLabel(action: string, metadata: Record<string, unknown> | null): string | null {
  if (action === "leadgen_match_run") {
    const examined = Number(metadata?.examined ?? 0);
    const prepared = Number(metadata?.prepared ?? 0);
    const sent = Number(metadata?.sent ?? 0);
    if (!examined && !prepared && !sent) return null;
    return metadata?.mode === "send"
      ? `Lead-Versand: ${sent} verschickt`
      : `Lead-Abgleich: ${examined} geprüft, ${prepared} Entwürfe`;
  }
  return ACTIVITY_LABELS[action] ?? null;
}

export const ACTIVITY_ACTIONS = [...Object.keys(ACTIVITY_LABELS), "leadgen_match_run"];

/** „vor 3 Min.“, „vor 2 Std.“, sonst Datum und Uhrzeit. */
export function relativeTime(value: string, now: Date): string {
  const diff = Math.max(now.getTime() - Date.parse(value), 0);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

/**
 * Ist die Lead-Suche (Claude-Routine, Mo–Fr 06:20 und 14:20 Uhr) noch am
 * Leben? Sie schreibt jedes gefundene Posting in die Merkliste. Montags
 * früh liegt der letzte Lauf über ein Wochenende zurück.
 */
export function leadSearchTone(lastSeenAt: string | null, now: Date): Tone {
  if (!lastSeenAt) return "critical";
  const hours = (now.getTime() - Date.parse(lastSeenAt)) / (60 * 60 * 1000);
  if (hours <= 30) return "good";
  if (hours <= 80) return "warning";
  return "critical";
}

/** Was ein Zeitgeber tut, in Worten. Unbekannte behalten ihren Namen. */
export const CRON_JOB_LABELS: Readonly<Record<string, string>> = {
  "outreach-agent-tick": "Alter Outreach-Agent (Edge Function)",
  "xportal-ai-usage-reconcile": "KI-Nutzung abgleichen",
  "xportal-credit-retention-daily": "Credits: Löschfristen",
  "xportal-leadgen-prepare": "Lead-Abgleich",
  "xportal-leadgen-retention-daily": "Leads: Löschfristen",
  "xportal-leadgen-window": "Lead-Versand",
  "xportal-placement-follow-ups": "Vermittlungen nachfassen",
  "xportal-rate-limit-cleanup-daily": "Rate-Limits aufräumen",
  "xportal-retention-daily": "Löschfristen",
  "xportal-sourced-candidate-retention-daily": "Recherchierte Kandidaten: Löschfristen",
};
