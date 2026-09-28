import { BILLING_FUNNEL_ACTIONS } from "@/lib/billing/funnel";

/**
 * Der Weg vom ersten Suchen bis zum bezahlten Abo, in Personen gezählt.
 *
 * Bis zum 28.09.2026 endete die Messung bei der Registrierung. Ob jemand die
 * Preise überhaupt sah, einen Tarif anklickte oder bezahlte, stand nirgends —
 * bei null zahlenden Kunden ließ sich deshalb nicht sagen, an welcher Stufe es
 * scheitert. Jetzt stehen alle Stufen nebeneinander.
 *
 * Die Stufen sind keine strenge Abfolge: Die Preisseite erreicht man auch
 * ohne Suche, ein Checkout kann ohne vorherige Registrierung beginnen. Eine
 * Quote zwischen zwei Stufen stünde deshalb nur dort, wo die eine die andere
 * wirklich voraussetzt; hier stehen nur die Zahlen.
 */

export const REVENUE_FUNNEL_WINDOW_DAYS = 30;

const CLIENT_STEPS = [
  { key: "search_started", label: "Suche gestartet" },
  { key: "result_seen", label: "Ergebnis gesehen" },
  { key: "registration_started", label: "Registrierung begonnen" },
  { key: "signup_confirmed", label: "Konto bestätigt" },
  { key: "pricing_viewed", label: "Preisseite geöffnet" },
] as const;

export const REVENUE_FUNNEL_ACTIONS = [
  ...CLIENT_STEPS.map((step) => `signup_funnel_${step.key}`),
  BILLING_FUNNEL_ACTIONS.checkoutStarted,
  BILLING_FUNNEL_ACTIONS.subscriptionPaid,
] as const;

export type RevenueFunnelRow = {
  id: string;
  action: string;
  actor_user_id: string | null;
  metadata: Record<string, unknown> | null;
};

export type RevenueFunnelStep = {
  key: string;
  label: string;
  people: number;
  detail: string | null;
};

export type RevenueFunnel = {
  windowDays: number;
  steps: RevenueFunnelStep[];
  /** Summe der neu abgeschlossenen Abos, netto je Monat. */
  newMonthlyNetCents: number;
  truncated: boolean;
};

const PRICING_REASON_LABELS: Readonly<Record<string, string>> = {
  recherche: "Credits für Recherche fehlten",
  guthaben: "Guthaben aufgebraucht",
  direkt: "direkt aufgerufen",
};

const numberFormat = new Intl.NumberFormat("de-DE");
const euroFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/**
 * Eine Person ist im Browser die Trichter-Kennung, auf dem Server das Konto.
 * Die Kennung übersteht den Wechsel vom Gast zum Konto; die Konto-Id nicht.
 */
function personKey(row: RevenueFunnelRow): string {
  const funnelId = row.metadata?.funnelId;
  if (typeof funnelId === "string" && funnelId) return `funnel:${funnelId}`;
  return row.actor_user_id ? `user:${row.actor_user_id}` : `event:${row.id}`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function buildRevenueFunnel(
  rows: readonly RevenueFunnelRow[],
  excludedUserIds: ReadonlySet<string>,
  truncated = false,
): RevenueFunnel {
  const people = new Map<string, Set<string>>();
  const pricingReasons = new Map<string, Set<string>>();
  const checkoutLoginRequired = new Set<string>();
  const renewals = new Set<string>();
  const paidPlans = new Map<string, number>();

  const add = (key: string, person: string) => {
    const set = people.get(key) ?? new Set<string>();
    set.add(person);
    people.set(key, set);
  };

  for (const row of rows) {
    if (row.actor_user_id && excludedUserIds.has(row.actor_user_id)) continue;
    const person = personKey(row);

    if (row.action.startsWith("signup_funnel_")) {
      const step = row.action.slice("signup_funnel_".length);
      add(step, person);
      if (step === "pricing_viewed") {
        const reason = text(row.metadata?.result) ?? "direkt";
        const set = pricingReasons.get(reason) ?? new Set<string>();
        set.add(person);
        pricingReasons.set(reason, set);
      }
      continue;
    }

    if (row.action === BILLING_FUNNEL_ACTIONS.checkoutStarted) {
      const result = text(row.metadata?.result);
      if (result === "stripe") add("checkout_started", person);
      else if (result === "login_required") checkoutLoginRequired.add(person);
      continue;
    }

    if (row.action === BILLING_FUNNEL_ACTIONS.subscriptionPaid) {
      if (row.metadata?.first !== true) {
        renewals.add(person);
        continue;
      }
      // Je Konto zählt das erste Abo einmal, auch wenn das Protokoll es
      // doppelt enthielte.
      if (!people.get("subscription_paid")?.has(person)) {
        const cents = row.metadata?.monthlyNetCents;
        paidPlans.set(person, typeof cents === "number" && cents > 0 ? cents : 0);
      }
      add("subscription_paid", person);
    }
  }

  const count = (key: string) => people.get(key)?.size ?? 0;
  const newMonthlyNetCents = [...paidPlans.values()].reduce((sum, cents) => sum + cents, 0);

  const pricingDetail = [...pricingReasons.entries()]
    .sort((left, right) => right[1].size - left[1].size)
    .map(([reason, set]) => `${numberFormat.format(set.size)} ${PRICING_REASON_LABELS[reason] ?? reason}`)
    .join(" · ");

  const steps: RevenueFunnelStep[] = [
    ...CLIENT_STEPS.map((step) => ({
      key: step.key,
      label: step.label,
      people: count(step.key),
      detail: step.key === "pricing_viewed" && pricingDetail ? pricingDetail : null,
    })),
    {
      key: "checkout_started",
      label: "Stripe-Checkout geöffnet",
      people: count("checkout_started"),
      detail: checkoutLoginRequired.size
        ? `${numberFormat.format(checkoutLoginRequired.size)} mussten sich dafür erst anmelden`
        : null,
    },
    {
      key: "subscription_paid",
      label: "Abo bezahlt",
      people: count("subscription_paid"),
      detail: [
        newMonthlyNetCents
          ? `${euroFormat.format(newMonthlyNetCents / 100)} netto im Monat neu`
          : null,
        renewals.size
          ? `${numberFormat.format(renewals.size)} Verlängerung${renewals.size === 1 ? "" : "en"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    },
  ];

  return {
    windowDays: REVENUE_FUNNEL_WINDOW_DAYS,
    steps,
    newMonthlyNetCents,
    truncated,
  };
}
