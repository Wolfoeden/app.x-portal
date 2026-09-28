import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccountSummary } from "@/components/chat/account";
import { AgentLaunchPanel } from "@/components/chat/agent-launch";
import {
  entryMonthlyEuro,
  exhaustedNotice,
  hasManagedBilling,
  isPricingReason,
  pricingPath,
} from "@/components/chat/upgrade";
import type { AiUsageSnapshot } from "@/components/chat-contract";
import { CREDIT_PLANS, START_CREDITS } from "@/lib/billing/plans";

function usage(planId: string, extra: Partial<AiUsageSnapshot["credits"]> = {}): AiUsageSnapshot {
  return {
    credits: {
      total: 90,
      used: 90,
      reserved: 0,
      remaining: 0,
      periodEnd: "2026-10-01T00:00:00.000Z",
      exhausted: true,
      creditsPerRequest: 3,
      planId,
      lastRequestCost: null,
      ...extra,
    },
  };
}

describe("exhausted credits", () => {
  it("promises a guest the one-time start credits, never a monthly refill", () => {
    const notice = exhaustedNotice(usage("guest"), false);

    expect(notice.text).toContain(`einmalig ${START_CREDITS} Start-Credits`);
    expect(notice.text).not.toMatch(/im Monat|monatlich/u);
    expect(notice.action).toEqual({ kind: "signup", label: "Kostenloses Konto erstellen" });
  });

  it("tells a trial account that nothing refills and shows the way to a plan", () => {
    const notice = exhaustedNotice(usage("trial"), true);

    expect(notice.text).toContain("füllen sich nicht wieder auf");
    expect(notice.text).not.toContain("Neues Guthaben gibt es");
    expect(notice.text).toContain(`ab ${CREDIT_PLANS.basic.euro} € netto`);
    expect(notice.action?.kind).toBe("pricing");
  });

  it("names the refill date for a subscription and offers a larger plan", () => {
    const notice = exhaustedNotice(usage("pro", { subscriptionStatus: "active" }), true);

    expect(notice.text).toContain("Neues Guthaben gibt es ab 01.10.2026");
    expect(notice.action).toEqual({ kind: "pricing", label: "Größeren Tarif ansehen" });
  });
});

describe("the way to the single price list", () => {
  it("carries the reason to /preise and accepts only known reasons", () => {
    expect(pricingPath("recherche")).toBe("/preise?grund=recherche");
    expect(isPricingReason("guthaben")).toBe(true);
    expect(isPricingReason("<script>")).toBe(false);
  });

  it("names the cheapest monthly plan from the catalogue", () => {
    expect(entryMonthlyEuro()).toBe(CREDIT_PLANS.basic.euro);
  });

  it("opens billing management only for accounts that have something to manage", () => {
    expect(hasManagedBilling(null)).toBe(false);
    expect(hasManagedBilling(usage("trial"))).toBe(false);
    expect(hasManagedBilling(usage("basic", { subscriptionStatus: "active" }))).toBe(true);
    expect(hasManagedBilling(usage("enterprise_flex"))).toBe(true);
  });

  it("labels the account button by what it opens", () => {
    const render = (managesBilling: boolean) =>
      renderToStaticMarkup(
        createElement(AccountSummary, {
          usage: usage("trial"),
          displayName: "Erika Muster",
          email: "erika@example.invalid",
          isAccountUser: true,
          managesBilling,
          onMoreCredits: () => {},
        }),
      );

    expect(render(false)).toContain("Tarif wählen");
    expect(render(true)).toContain("Abrechnung und Team");
  });
});

describe("research launch notes", () => {
  const render = (state: Parameters<typeof AgentLaunchPanel>[0]["state"]) =>
    renderToStaticMarkup(
      createElement(AgentLaunchPanel, {
        state,
        searching: false,
        failed: false,
        onStart: () => {},
        onRequireLogin: () => {},
        onNeedCredits: () => {},
      }),
    );

  it("gives a guest the reason to sign up next to the button", () => {
    expect(render({ kind: "login" })).toContain(`${START_CREDITS} Start-Credits reichen für 3 AI-Agent-Recherchen`);
  });

  it("shows the entry price when the balance is too small", () => {
    expect(render({ kind: "insufficient", remaining: 12 })).toContain(`Monatstarife ab ${CREDIT_PLANS.basic.euro} € netto`);
  });
});

describe("example volumes", () => {
  it("rounds down to steps of five so no page promises more than a plan carries", async () => {
    const { roundedExampleCount } = await import("@/lib/ai/credit-policy");

    expect(roundedExampleCount(START_CREDITS, "research")).toBe(3);
    expect(roundedExampleCount(CREDIT_PLANS.basic.monthlyCredits, "research")).toBe(15);
    expect(roundedExampleCount(CREDIT_PLANS.pro.monthlyCredits, "research")).toBe(40);
    expect(roundedExampleCount(90, "research")).toBe(3);
  });
});
