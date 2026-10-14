import { describe, expect, it } from "vitest";

import {
  SALES_CALL_KIND,
  isSalesCallEntry,
  salesCalendarUrl,
  salesCallHref,
} from "@/lib/sales/sales-call-model";

describe("salesCalendarUrl", () => {
  it("prefills name, address and role", () => {
    const url = new URL(
      salesCalendarUrl("https://calendly.com/xportal/20min", {
        fullName: "Erika Mustermann",
        email: "erika@muster.example",
        role: "SAP S/4HANA",
      })!,
    );
    expect(url.origin + url.pathname).toBe("https://calendly.com/xportal/20min");
    expect(url.searchParams.get("name")).toBe("Erika Mustermann");
    expect(url.searchParams.get("email")).toBe("erika@muster.example");
    expect(url.searchParams.get("a1")).toBe("SAP S/4HANA");
    expect(url.searchParams.get("utm_source")).toBe("x-portal");
  });

  it("accepts only https links", () => {
    expect(salesCalendarUrl("http://calendly.com/xportal")).toBeNull();
    expect(salesCalendarUrl("javascript:alert(1)")).toBeNull();
    expect(salesCalendarUrl("calendly.com/xportal")).toBeNull();
    expect(salesCalendarUrl("")).toBeNull();
    expect(salesCalendarUrl(undefined)).toBeNull();
  });
});

describe("entries", () => {
  it("builds tracked links and rejects unknown sources", () => {
    expect(salesCallHref("header")).toBe("/contact?thema=freelancer&von=header");
    expect(isSalesCallEntry("pricing")).toBe(true);
    expect(isSalesCallEntry("evil")).toBe(false);
    expect(SALES_CALL_KIND).toBe("Gesprächsanfrage (Website)");
  });
});
