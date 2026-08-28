import { afterEach, describe, expect, it, vi } from "vitest";

import {
  allowedBookingHosts,
  bookingDestinationLabel,
  isAllowedBookingHost,
} from "@/lib/freelancer/booking-hosts";

describe("booking host allow list", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the configured services and their subdomains", () => {
    expect(isAllowedBookingHost("https://calendly.com/roman/30min")).toBe(true);
    expect(isAllowedBookingHost("https://cal.com/roman")).toBe(true);
    expect(isAllowedBookingHost("https://team.calendly.com/intro")).toBe(true);
  });

  it("does not fall for a host that merely ends in the allowed name", () => {
    // Der Grund für den Punkt in `.${allowed}`: ohne ihn wäre das hier erlaubt.
    expect(isAllowedBookingHost("https://evilcalendly.com/roman")).toBe(false);
    expect(isAllowedBookingHost("https://notcal.com/roman")).toBe(false);
  });

  it("does not fall for the allowed name in a path or subdomain suffix", () => {
    expect(isAllowedBookingHost("https://attacker.example/calendly.com")).toBe(
      false,
    );
    expect(isAllowedBookingHost("https://calendly.com.attacker.example/x")).toBe(
      false,
    );
  });

  it("refuses anything that is not HTTPS", () => {
    expect(isAllowedBookingHost("http://calendly.com/roman")).toBe(false);
    expect(isAllowedBookingHost("javascript:alert(1)")).toBe(false);
    expect(isAllowedBookingHost("not a url")).toBe(false);
  });

  it("is case-insensitive about the host", () => {
    expect(isAllowedBookingHost("https://Calendly.COM/roman")).toBe(true);
  });

  it("can be reconfigured without a deploy", () => {
    vi.stubEnv("BOOKING_ALLOWED_HOSTS", "termin.example, book.example");

    expect(allowedBookingHosts()).toEqual(["termin.example", "book.example"]);
    expect(isAllowedBookingHost("https://book.example/roman")).toBe(true);
    expect(isAllowedBookingHost("https://calendly.com/roman")).toBe(false);
  });

  it("falls back to the defaults when the variable is empty", () => {
    vi.stubEnv("BOOKING_ALLOWED_HOSTS", "  ,  ");

    expect(allowedBookingHosts()).toContain("calendly.com");
  });

  it("splits a destination into what a reader needs to judge it", () => {
    expect(
      bookingDestinationLabel("https://termine.example/roman?ref=x"),
    ).toEqual({
      host: "termine.example",
      full: "https://termine.example/roman?ref=x",
    });
    expect(bookingDestinationLabel("kaputt")).toBeNull();
  });
});
