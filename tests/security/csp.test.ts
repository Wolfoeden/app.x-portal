import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
} from "@/lib/security/csp";

function directive(policy: string, name: string): string | undefined {
  return policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

describe("content security policy", () => {
  it("keeps the enforced policy on 'unsafe-inline' until the nonce rollout flips", () => {
    const policy = buildContentSecurityPolicy({ isProduction: true });

    expect(directive(policy, "script-src")).toBe(
      "script-src 'self' 'unsafe-inline'",
    );
  });

  it("replaces 'unsafe-inline' with the nonce instead of adding to it", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "abc123",
      isProduction: true,
    });
    const scriptSrc = directive(policy, "script-src");

    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    // Eine Nonce neben 'unsafe-inline' wäre wirkungslos: Browser ignorieren
    // 'unsafe-inline', sobald eine Nonce dasteht — aber nur dann.
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("allows eval only outside production", () => {
    expect(
      directive(buildContentSecurityPolicy({ isProduction: false }), "script-src"),
    ).toContain("'unsafe-eval'");
    expect(
      directive(buildContentSecurityPolicy({ isProduction: true }), "script-src"),
    ).not.toContain("'unsafe-eval'");
  });

  it("embeds nothing, matching section 7 of the privacy notice", () => {
    const policy = buildContentSecurityPolicy({ isProduction: true });

    expect(directive(policy, "frame-src")).toBe("frame-src 'none'");
    expect(policy).not.toContain("calendly");
  });

  it("keeps the hard boundaries in every variant", () => {
    for (const policy of [
      buildContentSecurityPolicy({ isProduction: true }),
      buildContentSecurityPolicy({ isProduction: false }),
      buildContentSecurityPolicy({ nonce: "n", isProduction: true }),
    ]) {
      expect(directive(policy, "default-src")).toBe("default-src 'self'");
      expect(directive(policy, "object-src")).toBe("object-src 'none'");
      expect(directive(policy, "frame-ancestors")).toBe(
        "frame-ancestors 'none'",
      );
      expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
      expect(directive(policy, "form-action")).toBe("form-action 'self'");
    }
  });

  it("upgrades insecure requests only in production", () => {
    expect(
      buildContentSecurityPolicy({ isProduction: true }),
    ).toContain("upgrade-insecure-requests");
    expect(
      buildContentSecurityPolicy({ isProduction: false }),
    ).not.toContain("upgrade-insecure-requests");
  });

  it("reports through both the deprecated and the current channel", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "n",
      isProduction: true,
      reportPath: CSP_REPORT_PATH,
    });

    expect(directive(policy, "report-uri")).toBe(`report-uri ${CSP_REPORT_PATH}`);
    expect(directive(policy, "report-to")).toBe(`report-to ${CSP_REPORT_GROUP}`);
  });

  it("stays silent when no report path is configured", () => {
    const policy = buildContentSecurityPolicy({ isProduction: true });

    expect(policy).not.toContain("report-uri");
    expect(policy).not.toContain("report-to");
  });
});
