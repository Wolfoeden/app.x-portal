import { describe, expect, it } from "vitest";
import { checkoutReturnMessage } from "@/components/chat/BillingManagement";

describe("checkout return message on the account page", () => {
  it("says nothing without a return code", () => {
    expect(checkoutReturnMessage(null)).toBeNull();
  });

  it("confirms the card and announces the trial activation", () => {
    expect(checkoutReturnMessage("success")).toEqual({ tone: "notice", text: expect.stringContaining("Testphase wird aktiviert") });
  });

  it("asks for the email confirmation before the trial", () => {
    expect(checkoutReturnMessage("email_not_verified")).toEqual({ tone: "error", text: expect.stringContaining("E-Mail-Adresse") });
  });

  it("explains a failed checkout with its code, no charge and a contact", () => {
    const message = checkoutReturnMessage("legal_review_pending");
    expect(message?.tone).toBe("error");
    expect(message?.text).toContain("Code: legal_review_pending");
    expect(message?.text).toContain("nichts abgebucht");
    expect(message?.text).toContain("info@x-portal.eu");
  });

  it("never echoes an arbitrary query value", () => {
    expect(checkoutReturnMessage("<script>")?.text).toContain("Code: unbekannt");
  });
});
