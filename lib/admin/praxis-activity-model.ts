import { isPraxisInterest, praxisInterestLabel } from "@/lib/marketing/praxis-cases";

/**
 * Was auf der Praxisseite (/praxis) geschah, je CRM-Kontakt: wann die Seite
 * zuletzt geöffnet wurde, was als „Das will ich auch“ markiert ist (der
 * letzte Stand) und ob der Kalender geöffnet wurde. Aufrufe ohne Kürzel
 * zählen nur in der Summe.
 *
 * Reine Funktion über Zeilen des Protokolls (audit_events), damit Admin-Seite,
 * Kontaktseite und Tests sie teilen.
 */

export const PRAXIS_ACTIONS = ["praxis_viewed", "praxis_interest", "sales_call_calendar_opened"] as const;

export type PraxisActivityRow = {
  id: string;
  action: string;
  target_id: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};

export type PraxisContactActivity = {
  contactId: string;
  views: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  interests: string[];
  calendarOpenedAt: string | null;
};

export type PraxisActivity = {
  contacts: PraxisContactActivity[];
  anonymousViews: number;
  anonymousCalendar: number;
};

function interestsOf(metadata: Record<string, unknown> | null): string[] {
  const raw = metadata?.interests;
  if (typeof raw !== "string" || !raw) return [];
  return raw.split(",").filter(isPraxisInterest).map(praxisInterestLabel);
}

/** Nur Kalenderklicks von der Praxisseite; die übrigen zählt der Umsatzweg. */
function fromPraxis(row: PraxisActivityRow): boolean {
  return row.action !== "sales_call_calendar_opened" || row.metadata?.via === "praxis";
}

export function summarizePraxisActivity(rows: readonly PraxisActivityRow[]): PraxisActivity {
  const byContact = new Map<string, PraxisContactActivity & { interestAt: string | null }>();
  let anonymousViews = 0;
  let anonymousCalendar = 0;
  for (const row of [...rows].filter(fromPraxis).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
    if (!row.target_id) {
      if (row.action === "praxis_viewed") anonymousViews += 1;
      if (row.action === "sales_call_calendar_opened") anonymousCalendar += 1;
      continue;
    }
    const entry = byContact.get(row.target_id) ?? {
      contactId: row.target_id,
      views: 0,
      firstViewedAt: null,
      lastViewedAt: null,
      interests: [],
      interestAt: null,
      calendarOpenedAt: null,
    };
    if (row.action === "praxis_viewed") {
      entry.views += 1;
      entry.firstViewedAt ??= row.occurred_at;
      entry.lastViewedAt = row.occurred_at;
    } else if (row.action === "praxis_interest") {
      entry.interests = interestsOf(row.metadata);
      entry.interestAt = row.occurred_at;
    } else if (row.action === "sales_call_calendar_opened") {
      entry.calendarOpenedAt = row.occurred_at;
      // Was beim Öffnen des Kalenders markiert war, ist der neueste Stand.
      if (!entry.interestAt || entry.interestAt <= row.occurred_at) {
        const marked = interestsOf(row.metadata);
        if (marked.length) entry.interests = marked;
      }
    }
    byContact.set(row.target_id, entry);
  }
  const contacts = [...byContact.values()]
    .map((entry): PraxisContactActivity => ({
      contactId: entry.contactId,
      views: entry.views,
      firstViewedAt: entry.firstViewedAt,
      lastViewedAt: entry.lastViewedAt,
      interests: entry.interests,
      calendarOpenedAt: entry.calendarOpenedAt,
    }))
    .sort((a, b) => (b.lastViewedAt ?? b.calendarOpenedAt ?? "").localeCompare(a.lastViewedAt ?? a.calendarOpenedAt ?? ""));
  return { contacts, anonymousViews, anonymousCalendar };
}
