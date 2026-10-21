import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GuestRequestDialog, guestRequestNote } from "@/components/chat/guest-request-dialog";
import { bookingActionState } from "@/components/chat/results";
import { CREDIT_RULES } from "@/lib/billing/credit-rules";

const noop = () => undefined;

// 21.10.2026: Die erste Suche und die Anfrage gehen ohne Konto. Die Anfrage
// wird ein Suchauftrag mit dem Profil als Notiz.
describe("asking for a freelancer without an account", () => {
  const markup = renderToStaticMarkup(
    createElement(GuestRequestDialog, {
      projectId: "11111111-2222-4333-8444-555555555555",
      profile: { id: "p-1", name: "Lena B." },
      onClose: noop,
      onPreferAccount: noop,
    }),
  );

  it("asks only for a business email, the rest is optional", () => {
    expect(markup).toContain("Ohne Konto, ohne Karte");
    expect(markup).toContain("Lena B. anfragen");
    expect(markup.match(/required=""/gu)).toHaveLength(1);
    expect(markup).toContain('type="email"');
    expect(markup.match(/\(optional\)/gu)).toHaveLength(3);
  });

  it("keeps the way through an account and states the consent", () => {
    expect(markup).toContain("Lieber mit Konto");
    expect(markup).toContain("darf XPORTAL Sie zu dieser Anfrage");
    expect(markup).toContain('href="/privacy#suchauftrag"');
    expect(markup).toContain('class="placement-trap"');
  });

  it("names the profile in the mandate so the operator knows whom to introduce", () => {
    expect(guestRequestNote({ id: "p-1", name: "Lena B." })).toBe("Anfrage zu Profil Lena B. (p-1).");
    expect(guestRequestNote({ id: "p-1", name: "x".repeat(2_000) }).length).toBeLessThanOrEqual(1_000);
  });

  it("tells guests on the card that no account is needed", () => {
    expect(bookingActionState({ bookingUrl: null }, false).hint).toContain("Ohne Konto");
    expect(CREDIT_RULES.guest).toContain("eine Projektanalyse kostenlos");
  });
});
