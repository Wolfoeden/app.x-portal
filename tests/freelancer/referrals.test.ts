import { describe, expect, it } from "vitest";

import { isKnownReferral, referralLabel, referralWelcome } from "@/lib/freelancer/referrals";

describe("where an application comes from", () => {
  it("welcomes people from the employment agency and the Jobcenter without excluding anyone", () => {
    expect(referralWelcome("arbeitsagentur")).toContain("über die Agentur für Arbeit");
    expect(referralWelcome("jobcenter")).toContain("über Ihr Jobcenter");
    for (const referral of ["arbeitsagentur", "jobcenter"]) {
      const text = referralWelcome(referral)!;
      expect(text).toContain("kostenlos");
      expect(text).toContain("noch nicht selbstständig");
      expect(text).not.toMatch(/Arbeitnehmerüberlassung|ANÜ/u);
    }
  });

  it("says nothing special for other sources", () => {
    expect(referralWelcome("newsletter")).toBeNull();
    expect(referralWelcome(null)).toBeNull();
    expect(isKnownReferral("JOBCENTER")).toBe(false);
  });

  it("names known sources in the admin area and shows others as they are", () => {
    expect(referralLabel("jobcenter")).toBe("Jobcenter");
    expect(referralLabel("arbeitsagentur")).toBe("Agentur für Arbeit");
    expect(referralLabel("messe-2026")).toBe("messe-2026");
  });
});
