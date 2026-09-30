import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { checkoutDialogCopy, checkoutPlanFrom, checkoutSummary } from "@/components/chat/checkout-intent";
import { AuthDialog } from "@/components/chat/dialogs";
import { CREDIT_PLANS } from "@/lib/billing/plans";

const noop = () => undefined;

function dialog(initialMode: "register" | "login", checkoutPlan: "basic" | null = "basic") {
  return renderToStaticMarkup(
    createElement(AuthDialog, {
      initialMode,
      checkout: checkoutPlan ? checkoutDialogCopy(checkoutPlan) : null,
      destination: checkoutPlan ? `/chat?checkout=${checkoutPlan}` : "/chat",
      onClose: noop,
      onAuthenticated: noop,
      showToast: noop,
    }),
  );
}

// Audit F03: Wer als Gast „Basic buchen“ klickt, sieht Tarif, Preis,
// Laufzeit und den nächsten Schritt, in beiden Anmeldewegen.
describe("booking a plan without an account", () => {
  it("shows plan, net price, credits, renewal and the next step when creating an account", () => {
    const markup = dialog("register");
    expect(markup).toContain("Konto anlegen und Basic buchen");
    expect(markup).toMatch(/Basic · 9\s€ netto pro Monat/u);
    expect(markup).toContain(`${CREDIT_PLANS.basic.monthlyCredits} Credits pro Monat`);
    expect(markup).toContain("verlängert sich jeweils um einen Monat");
    expect(markup).toContain("Kündbar zum Ende des laufenden Monats");
    expect(markup).toContain("Zuzüglich Umsatzsteuer");
    expect(markup).toContain("direkt zur Zahlung bei Stripe");
    expect(markup).toContain('id="register-name"');
  });

  it("shows the same plan when signing in to an existing account", () => {
    const markup = dialog("login");
    expect(markup).toContain("Anmelden und Basic buchen");
    expect(markup).toMatch(/Basic · 9\s€ netto pro Monat/u);
    expect(markup).not.toContain('id="register-name"');
  });

  it("keeps the ordinary dialog without a plan", () => {
    const markup = dialog("login", null);
    expect(markup).toContain("Anmelden und direkt fortfahren");
    expect(markup).not.toContain("netto pro Monat");
  });

  it("reads only the bookable monthly plans from the address", () => {
    expect(checkoutPlanFrom("basic")).toBe("basic");
    expect(checkoutPlanFrom("business")).toBe("business");
    expect(checkoutPlanFrom("enterprise_flex")).toBeNull();
    expect(checkoutPlanFrom(null)).toBeNull();
    expect(checkoutSummary("pro").price).toMatch(/^19\s€ netto pro Monat$/u);
  });

  it("continues to Stripe after sign-in and forgets the plan when the dialog is closed", () => {
    const source = readFileSync("components/ChatWorkspace.tsx", "utf8");
    expect(source).toContain("setAuthCheckoutPlan(requestedCheckout);");
    expect(source).toContain('setAuthInitialMode("register");');
    expect(source).toContain("checkout={authCheckoutPlan ? checkoutDialogCopy(authCheckoutPlan) : null}");
    expect(source).toContain('params.delete("checkout");');
    expect(source).toMatch(/const requestedCheckout = checkoutPlanFrom\(searchParams\.get\("checkout"\)\);\s+if \(requestedCheckout\) \{\s+window\.location\.assign\(/u);
  });
});
