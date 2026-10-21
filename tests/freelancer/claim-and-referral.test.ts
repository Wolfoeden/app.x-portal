import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ClaimActions } from "@/app/profil-uebernehmen/ClaimActions";
import { claimPath, mintClaimToken, readClaimToken } from "@/lib/freelancer/claim-token";
import { REFERRAL_PATTERN } from "@/lib/freelancer/limits";
import { personalReferralCode, referralLabel } from "@/lib/freelancer/referrals";
import { mintPraxisToken } from "@/lib/sales/praxis";
import { NON_INDEXABLE_PREFIXES } from "@/lib/seo";

const PROFILE = "a10f78f8-e6ec-47d2-aee9-7fd97b86c9d4";

beforeEach(() => {
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "a".repeat(40));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// 21.10.2026: 62 von 68 Profilen gehören keinem Konto. Der Übernahme-Link
// gibt sie der Person selbst.
describe("profile takeover link", () => {
  it("round-trips the profile id and lives 90 days", () => {
    const issued = new Date("2026-10-21T10:00:00Z");
    const token = mintClaimToken(PROFILE, issued)!;
    expect(readClaimToken(token, new Date("2026-12-01T10:00:00Z"))).toBe(PROFILE);
    expect(readClaimToken(token, new Date("2027-01-20T10:00:00Z"))).toBeNull();
    expect(claimPath(token)).toBe(`/profil-uebernehmen?t=${encodeURIComponent(token)}`);
  });

  it("rejects tampered tokens, other link purposes and a missing secret", () => {
    const token = mintClaimToken(PROFILE)!;
    expect(readClaimToken(`${token}x`)).toBeNull();
    expect(readClaimToken(mintPraxisToken(PROFILE))).toBeNull();
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");
    expect(mintClaimToken(PROFILE)).toBeNull();
    expect(readClaimToken(token)).toBeNull();
  });

  it("is never indexed", () => {
    expect(NON_INDEXABLE_PREFIXES).toContain("/profil-uebernehmen");
  });

  it("asks to sign in first, then for consent, and stops at a second profile", () => {
    const signedOut = renderToStaticMarkup(createElement(ClaimActions, { token: "t", state: "signed_out", destination: "/profil-uebernehmen?t=t" }));
    expect(signedOut).toContain("Mit Konto übernehmen");
    expect(signedOut).toContain("Schon registriert? Anmelden");

    const ready = renderToStaticMarkup(createElement(ClaimActions, { token: "t", state: "ready", destination: "/x" }));
    expect(ready).toContain("Das ist mein Profil.");
    expect(ready).toContain("Profil übernehmen");
    expect(ready).toContain("disabled");
    expect(ready.match(/Freiwillig/gu)).toHaveLength(2);

    const twice = renderToStaticMarkup(createElement(ClaimActions, { token: "t", state: "has_profile", destination: "/x" }));
    expect(twice).toContain("Ihr Konto hat bereits ein Profil.");
    expect(twice).not.toContain("Profil übernehmen");
  });
});

describe("personal referral link", () => {
  it("fits the source pattern and names no one", () => {
    const code = personalReferralCode(PROFILE);
    expect(code).toBe("empf-a10f78f8e6ec");
    expect(REFERRAL_PATTERN.test(code)).toBe(true);
    expect(referralLabel(code)).toBe("Empfehlung (empf-a10f78f8e6ec)");
    expect(referralLabel("jobcenter")).toBe("Jobcenter");
  });
});
