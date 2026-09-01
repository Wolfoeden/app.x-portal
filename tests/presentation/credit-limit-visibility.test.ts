import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CreditPlansDialog } from "@/components/chat/account";
import { CREDIT_PLANS } from "@/lib/ai/credit-policy";
import type { AiUsageSnapshot } from "@/components/chat-contract";

function usage(planId: string): AiUsageSnapshot {
  return {
    credits: {
      planId,
      total: 3_000,
      used: 0,
      reserved: 0,
      remaining: 3_000,
      periodEnd: "2026-10-01T00:00:00.000Z",
    },
    productCredits: null,
  } as unknown as AiUsageSnapshot;
}

function render(planId: string, selfLimit: number | null = null) {
  return renderToStaticMarkup(
    createElement(CreditPlansDialog, {
      usage: usage(planId),
      customerReference: "account-1",
      team: null,
      teamBusy: false,
      teamNotice: null,
      selfLimit,
      selfLimitMaxEuro: 50,
      onSelfLimitSaved: () => undefined,
      onInviteTeamMember: () => undefined,
      onRemoveTeamMember: () => undefined,
      onClose: () => undefined,
    }),
  );
}

describe("Sichtbarkeit des eigenen Limits", () => {
  // Ein Limit einzustellen ergibt nur Sinn, wo nach Verbrauch abgerechnet wird.
  it("zeigt die Einstellung auf dem abgerechneten Plan", () => {
    const markup = render(CREDIT_PLANS.enterprise.id);

    expect(markup).toContain("credit-limit");
    expect(markup).toContain("Eigenes Limit");
  });

  it("zeigt sie nicht auf der Gratisstufe", () => {
    expect(render(CREDIT_PLANS.free.id)).not.toContain("Eigenes Limit");
    expect(render(CREDIT_PLANS.guest.id)).not.toContain("Eigenes Limit");
  });

  /**
   * Die Zahl allein sagt niemandem, was sie kostet — und die Obergrenze kommt
   * aus der Stufe, nicht aus einer zweiten Zahl, die davon abweichen kann.
   */
  it("nennt Obergrenze und Höchstkosten beieinander", () => {
    const markup = render(CREDIT_PLANS.enterprise.id);

    expect(markup).toContain(String(CREDIT_PLANS.enterprise.monthlyCredits));
    expect(markup).toContain("50 €");
    expect(markup).toContain("nur, was Sie");
  });

  it("zeigt ein gespeichertes Limit statt eines leeren Feldes", () => {
    expect(render(CREDIT_PLANS.enterprise.id, 800)).toContain('value="800"');
  });
});
