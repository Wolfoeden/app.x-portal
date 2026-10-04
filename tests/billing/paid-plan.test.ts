import { describe, expect, it } from "vitest";

import { bookingActionState } from "@/components/chat/results";
import { hasPaidAccess } from "@/lib/billing/paid-plan";

describe("hasPaidAccess", () => {
  it("counts the paid plans with a running subscription", () => {
    for (const plan of ["basic", "pro", "business", "enterprise", "enterprise_flex", "enterprise_legacy"]) {
      expect(hasPaidAccess(plan, "active"), plan).toBe(true);
    }
    expect(hasPaidAccess("pro", "trialing")).toBe(true);
    // Die Zahlung wird erneut versucht; gesperrt wird erst, wenn Stripe aufgibt.
    expect(hasPaidAccess("pro", "past_due")).toBe(true);
    // Enterprise läuft per Rechnung, ohne Stripe-Abo.
    expect(hasPaidAccess("enterprise_flex", null)).toBe(true);
  });

  it("does not count guests, trials or ended subscriptions", () => {
    expect(hasPaidAccess("guest", null)).toBe(false);
    expect(hasPaidAccess("trial", null)).toBe(false);
    expect(hasPaidAccess("free", "active")).toBe(false);
    expect(hasPaidAccess(undefined)).toBe(false);
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      expect(hasPaidAccess("business", status), status).toBe(false);
    }
  });
});

describe("bookingActionState with direct booking", () => {
  const withCalendar = { bookingUrl: "https://x-portal.eu/api/freelancers/abc/book" };

  it("lets paying customers book a calendar directly in the placement model", () => {
    expect(bookingActionState(withCalendar, true, true, true)).toMatchObject({ kind: "bookable", label: "Termin buchen" });
  });

  it("keeps the request for everyone else", () => {
    expect(bookingActionState(withCalendar, true, true, false).kind).toBe("request");
    expect(bookingActionState(withCalendar, false, true, true).kind).toBe("request");
    expect(bookingActionState({ bookingUrl: null }, true, true, true).kind).toBe("request");
  });
});
