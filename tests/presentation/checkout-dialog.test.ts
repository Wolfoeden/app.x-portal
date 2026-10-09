import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { checkoutDialogCopy, checkoutPlanFrom, checkoutSummary } from "@/components/chat/checkout-intent";
import { AuthDialog } from "@/components/chat/dialogs";

const noop = () => undefined;

function dialog(initialMode: "register" | "login", checkoutPlan: "basic" | null = "basic") {
  return renderToStaticMarkup(
    createElement(AuthDialog, {
      initialMode,
      checkout: checkoutPlan ? checkoutDialogCopy(checkoutPlan) : null,
      destination: checkoutPlan ? `/anmelden?checkout=${checkoutPlan}` : "/chat",
      onClose: noop,
      onAuthenticated: noop,
      showToast: noop,
    }),
  );
}

// Wer als Gast „Basic testen“ klickt, sieht den kompakten Tarif und den
// direkten nächsten Schritt, in beiden Anmeldewegen.
describe("booking a plan without an account", () => {
  it("shows the compact plan and next step when creating an account", () => {
    const markup = dialog("register");
    expect(markup).toContain("Basic kostenlos testen");
    expect(markup).toMatch(/Basic · 9\s€ netto pro Monat/u);
    expect(markup).toContain("90 Credits");
    expect(markup).toContain("Karte im nächsten Schritt bei Stripe");
    expect(markup).not.toContain("Anmelden. Danach öffnen wir");
    expect(markup).toContain('id="register-name"');
  });

  it("shows the same plan when signing in to an existing account", () => {
    const markup = dialog("login");
    expect(markup).toContain("Basic kostenlos testen");
    expect(markup).toMatch(/Basic · 9\s€ netto pro Monat/u);
    expect(markup).not.toContain('id="register-name"');
  });

  it("keeps the ordinary dialog without a plan", () => {
    const markup = dialog("login", null);
    expect(markup).toContain("Anmelden und direkt fortfahren");
    expect(markup).not.toContain("netto pro Monat");
  });

  it("keeps the checkout summary short", () => {
    expect(checkoutSummary("basic").points).toHaveLength(2);
    expect(checkoutSummary("basic").points.join(" ")).not.toContain("Vermittlungshonorar");
  });

  it("reads only the bookable monthly plans from the address", () => {
    expect(checkoutPlanFrom("basic")).toBe("basic");
    expect(checkoutPlanFrom("business")).toBe("business");
    expect(checkoutPlanFrom("enterprise_flex")).toBeNull();
    expect(checkoutPlanFrom(null)).toBeNull();
    expect(checkoutSummary("pro").price).toMatch(/^19\s€ netto pro Monat$/u);
  });

  it("uses a dedicated lightweight page before continuing to Stripe", () => {
    const source = readFileSync("app/anmelden/CheckoutAccess.tsx", "utf8");
    expect(source).toContain("checkoutDialogCopy(plan)");
    expect(source).toContain("/api/billing/checkout?plan=${plan}");
    expect(source).not.toContain("ChatWorkspace");
  });
});
