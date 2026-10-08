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

// Audit F03: Wer als Gast „Basic testen“ klickt, sieht Tarif, Preis,
// Laufzeit und den nächsten Schritt, in beiden Anmeldewegen.
describe("booking a plan without an account", () => {
  it("shows plan, net price, credits, renewal and the next step when creating an account", () => {
    const markup = dialog("register");
    expect(markup).toContain("Konto anlegen und Basic testen");
    expect(markup).toMatch(/Basic · 9\s€ netto pro Monat/u);
    expect(markup).toContain(`${CREDIT_PLANS.basic.monthlyCredits} Credits je bestätigter bezahlter Periode`);
    expect(markup).toContain("Danach automatisch 9 € netto im Monat");
    expect(markup).toContain("monatlich zum Periodenende kündbar");
    expect(markup).toContain("zzgl. USt.");
    expect(markup).toContain("Karte bei Stripe");
    expect(markup).toContain('id="register-name"');
  });

  it("shows the same plan when signing in to an existing account", () => {
    const markup = dialog("login");
    expect(markup).toContain("Anmelden und Basic testen");
    expect(markup).toMatch(/Basic · 9\s€ netto pro Monat/u);
    expect(markup).not.toContain('id="register-name"');
  });

  it("keeps the ordinary dialog without a plan", () => {
    const markup = dialog("login", null);
    expect(markup).toContain("Anmelden und direkt fortfahren");
    expect(markup).not.toContain("netto pro Monat");
  });

  it("separates a placement fee from the plan once placement is on", () => {
    const previous = process.env.NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED;
    try {
      process.env.NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED = "true";
      expect(checkoutSummary("basic").points.at(-1)).toBe(
        "Neue Kontaktanfragen und Beauftragungen sind provisionsfrei. Sie bezahlen die Software-Nutzung.",
      );
      process.env.NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED = "false";
      expect(checkoutSummary("basic").points.join(" ")).not.toContain("Vermittlungshonorar");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED;
      else process.env.NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED = previous;
    }
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
