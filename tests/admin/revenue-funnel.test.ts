import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildRevenueFunnel,
  REVENUE_FUNNEL_ACTIONS,
  type RevenueFunnelRow,
} from "@/lib/admin/revenue-funnel-model";

let nextId = 0;
function row(
  action: string,
  actor: string | null,
  metadata: Record<string, unknown> = {},
): RevenueFunnelRow {
  nextId += 1;
  return { id: `event-${nextId}`, action, actor_user_id: actor, metadata };
}

function step(funnel: ReturnType<typeof buildRevenueFunnel>, key: string) {
  return funnel.steps.find((entry) => entry.key === key);
}

describe("revenue funnel", () => {
  it("reads every step from search to paid subscription", () => {
    expect(REVENUE_FUNNEL_ACTIONS).toEqual([
      "signup_funnel_search_started",
      "signup_funnel_result_seen",
      "signup_funnel_registration_started",
      "signup_funnel_signup_confirmed",
      "signup_funnel_pricing_viewed",
      "billing_checkout_started",
      "billing_subscription_paid",
      "placement_terms_accepted",
      "placement_introduced",
      "placement_engaged",
      "placement_fee_paid",
    ]);
  });

  // Der Gast und das spätere Konto haben verschiedene Ids, aber dieselbe
  // Trichter-Kennung im Browser. Gezählt wird die Person, nicht die Sitzung.
  it("counts a guest who becomes an account once per step", () => {
    const funnel = buildRevenueFunnel(
      [
        row("signup_funnel_search_started", "guest-1", { funnelId: "f1" }),
        row("signup_funnel_search_started", "guest-1", { funnelId: "f1" }),
        row("signup_funnel_registration_started", "guest-1", { funnelId: "f1" }),
        row("signup_funnel_signup_confirmed", "account-1", { funnelId: "f1" }),
        row("signup_funnel_search_started", "guest-2", { funnelId: "f2" }),
      ],
      new Set(),
    );

    expect(step(funnel, "search_started")?.people).toBe(2);
    expect(step(funnel, "registration_started")?.people).toBe(1);
    expect(step(funnel, "signup_confirmed")?.people).toBe(1);
  });

  it("splits pricing visits by the reason that led there", () => {
    const funnel = buildRevenueFunnel(
      [
        row("signup_funnel_pricing_viewed", "guest-1", { funnelId: "f1", result: "recherche" }),
        row("signup_funnel_pricing_viewed", null, { funnelId: "f2", result: "direkt" }),
        row("signup_funnel_pricing_viewed", null, { funnelId: "f3", result: "direkt" }),
      ],
      new Set(),
    );

    expect(step(funnel, "pricing_viewed")).toEqual({
      key: "pricing_viewed",
      label: "Preisseite geöffnet",
      people: 3,
      detail: "2 direkt aufgerufen · 1 Credits für Recherche fehlten",
    });
  });

  it("counts only checkouts that reached Stripe and names the detour through sign-in", () => {
    const funnel = buildRevenueFunnel(
      [
        row("billing_checkout_started", null, { plan: "pro", result: "login_required" }),
        row("billing_checkout_started", "account-1", { plan: "pro", result: "stripe" }),
        row("billing_checkout_started", "account-1", { plan: "pro", result: "stripe" }),
        row("billing_checkout_started", "account-2", { plan: "basic", result: "unavailable" }),
      ],
      new Set(),
    );

    expect(step(funnel, "checkout_started")?.people).toBe(1);
    expect(step(funnel, "checkout_started")?.detail).toBe("1 mussten sich dafür erst anmelden");
  });

  it("sums new monthly revenue from first payments and keeps renewals apart", () => {
    const funnel = buildRevenueFunnel(
      [
        row("billing_subscription_paid", "account-1", { plan: "pro", monthlyNetCents: 1_900, first: true }),
        row("billing_subscription_paid", "account-1", { plan: "pro", monthlyNetCents: 1_900, first: true }),
        row("billing_subscription_paid", "account-2", { plan: "basic", monthlyNetCents: 900, first: true }),
        row("billing_subscription_paid", "account-3", { plan: "basic", monthlyNetCents: 900, first: false }),
      ],
      new Set(),
    );

    expect(step(funnel, "subscription_paid")?.people).toBe(2);
    expect(funnel.newMonthlyNetCents).toBe(2_800);
    // Intl setzt zwischen Betrag und Währung ein geschütztes Leerzeichen.
    expect(step(funnel, "subscription_paid")?.detail?.replace(/\u00a0/gu, " ")).toBe(
      "28,00 € netto im Monat neu · 1 Verlängerung",
    );
  });

  it("leaves out internal accounts, as every other admin report does", () => {
    const funnel = buildRevenueFunnel(
      [
        row("signup_funnel_search_started", "admin-1", { funnelId: "f1" }),
        row("billing_checkout_started", "admin-1", { plan: "pro", result: "stripe" }),
        row("signup_funnel_search_started", "guest-1", { funnelId: "f2" }),
      ],
      new Set(["admin-1"]),
    );

    expect(step(funnel, "search_started")?.people).toBe(1);
    expect(step(funnel, "checkout_started")?.people).toBe(0);
  });

  it("shows empty steps as zero instead of hiding them", () => {
    const funnel = buildRevenueFunnel([], new Set());

    expect(funnel.steps.map((entry) => entry.people)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(funnel.steps.every((entry) => entry.detail === null)).toBe(true);
  });

  it("counts placement requests per request and sums agreed and paid fees", () => {
    const funnel = buildRevenueFunnel(
      [
        { ...row("placement_terms_accepted", "client-1"), target_id: "req-1" },
        { ...row("placement_terms_accepted", "client-2"), target_id: "req-2" },
        { ...row("placement_introduced", "admin-1", { clientUserId: "client-1" }), target_id: "req-1" },
        { ...row("placement_engaged", "admin-1", { clientUserId: "client-1", feeMinor: 355_200 }), target_id: "req-1" },
        { ...row("placement_fee_paid", "admin-1", { clientUserId: "client-1", feeMinor: 355_200 }), target_id: "req-1" },
      ],
      new Set(["admin-1"]),
      false,
      { placement: true },
    );

    expect(funnel.steps.map((entry) => entry.key)).toEqual([
      "search_started",
      "result_seen",
      "registration_started",
      "signup_confirmed",
      "placement_requested",
      "placement_introduced",
      "placement_engaged",
      "placement_fee_paid",
      "pricing_viewed",
      "checkout_started",
      "subscription_paid",
    ]);
    expect(step(funnel, "placement_requested")?.people).toBe(2);
    // Vorstellen und Beauftragen trägt der Betreiber ein; sie zählen trotzdem.
    expect(step(funnel, "placement_introduced")?.people).toBe(1);
    expect(step(funnel, "placement_engaged")?.detail?.replace(/\u00a0/gu, " ")).toBe("3.552,00 € Honorar vereinbart");
    expect(step(funnel, "placement_fee_paid")?.detail?.replace(/\u00a0/gu, " ")).toBe("3.552,00 € eingegangen");
  });

  it("leaves out placements of internal test clients", () => {
    const funnel = buildRevenueFunnel(
      [
        { ...row("placement_terms_accepted", "admin-1"), target_id: "req-1" },
        { ...row("placement_introduced", "admin-1", { clientUserId: "admin-1" }), target_id: "req-1" },
      ],
      new Set(["admin-1"]),
      false,
      { placement: true },
    );

    expect(step(funnel, "placement_requested")?.people).toBe(0);
    expect(step(funnel, "placement_introduced")?.people).toBe(0);
  });

  it("shows no placement stages while the switch is off", () => {
    const funnel = buildRevenueFunnel([], new Set());

    expect(funnel.steps.some((entry) => entry.key.startsWith("placement_"))).toBe(false);
  });
});
