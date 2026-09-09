import { describe, expect, it } from "vitest";

import { domainClarificationCopy } from "@/lib/domain/clarification-copy";

describe("domain clarification copy", () => {
  it("asks a generic SAP consultant request for the module, not the role", () => {
    const copy = domainClarificationCopy("Wir suchen einen SAP-Berater ab Oktober.");
    expect(copy).toContain("Welche SAP-Spezialisierung");
    expect(copy).toContain("Rolle als SAP-Berater ist bereits verstanden");
  });

  it("does not repeat the question when the specialization is present", () => {
    expect(domainClarificationCopy("SAP MM Berater für S/4HANA gesucht")).toBeNull();
  });
});
