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

/**
 * Genau diese beiden Herkuenfte darf hCaptcha bekommen — nicht "irgendetwas,
 * das auf hcaptcha.com endet". Der Unterschied ist der zwischen einer
 * Erlaubnis und einer Einladung an jeden, der sich eine passende Domain
 * registriert.
 */
const HCAPTCHA_SOURCES = ["https://hcaptcha.com", "https://*.hcaptcha.com"];

/**
 * Oktober 2026: das Google-Ads-Tag, geladen erst nach Einwilligung
 * (components/GoogleAdsTag.tsx). Ebenfalls eine feste Liste, keine Endung.
 */
const GOOGLE_ADS_SCRIPT_SOURCES = [
  "https://www.googletagmanager.com",
  "https://www.googleadservices.com",
  "https://www.google.com",
  "https://googleads.g.doubleclick.net",
];
const GOOGLE_ADS_FRAME_SOURCES = [
  "https://td.doubleclick.net",
  "https://bid.g.doubleclick.net",
  "https://www.googletagmanager.com",
];

describe("content security policy", () => {
  it("keeps the enforced policy on 'unsafe-inline' until the nonce rollout flips", () => {
    const scriptSrc =
      directive(buildContentSecurityPolicy({ isProduction: true }), "script-src") ?? "";

    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'self'");
    // Ausser hCaptcha und dem Google-Ads-Tag kommt keine fremde Herkunft dazu.
    expect(scriptSrc).not.toContain("'strict-dynamic'");
    expect(
      scriptSrc
        .replace("script-src ", "")
        .split(" ")
        .filter((source) => source.startsWith("https://")),
    ).toEqual([...HCAPTCHA_SOURCES, ...GOOGLE_ADS_SCRIPT_SOURCES]);
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

  /**
   * Frueher stand hier `frame-src 'none'`. Eingebettet werden jetzt hCaptcha
   * und, nach Einwilligung, die Zuordnungsframes des Google-Ads-Tags — und
   * nichts sonst. Abschnitt 6 der Datenschutzhinweise sagt zu, dass
   * Buchungsseiten erst nach einem Klick und in einem eigenen Aufruf geladen
   * werden; diese Zusage haelt der Test weiter fest.
   */
  it("embeds hCaptcha and the Google Ads frames, nothing else", () => {
    const policy = buildContentSecurityPolicy({ isProduction: true });
    const frameSrc = directive(policy, "frame-src") ?? "";

    expect(frameSrc).toContain("hcaptcha.com");
    expect(frameSrc).not.toContain("calendly");
    expect(policy).not.toContain("calendly");

    // Keine stillschweigende Oeffnung fuer alles Uebrige. Verglichen wird
    // gegen eine feste Liste und nicht gegen eine Endung: "endet auf
    // hcaptcha.com" traefe auch auf "evil-hcaptcha.com" zu.
    expect(frameSrc).not.toContain("'self'");
    expect(frameSrc.replace("frame-src ", "").split(" ")).toEqual([
      ...HCAPTCHA_SOURCES,
      ...GOOGLE_ADS_FRAME_SOURCES,
    ]);
  });

  it("reaches hCaptcha for the script, the frame and the answer", () => {
    const enforced = buildContentSecurityPolicy({ isProduction: true });

    // Die durchgesetzte Fassung kennt kein `strict-dynamic` und braucht die
    // Herkunft ausgeschrieben, sonst wird das Widget-Skript blockiert.
    expect(directive(enforced, "script-src")).toContain("hcaptcha.com");
    expect(directive(enforced, "connect-src")).toContain("hcaptcha.com");
    expect(directive(enforced, "frame-src")).toContain("hcaptcha.com");
  });

  it("reaches the Google Ads tag for the script and its conversion pings", () => {
    const enforced = buildContentSecurityPolicy({ isProduction: true });

    expect(directive(enforced, "script-src")).toContain("https://www.googletagmanager.com");
    expect(directive(enforced, "connect-src")).toContain("https://www.googleadservices.com");
    expect(directive(enforced, "connect-src")).toContain("https://googleads.g.doubleclick.net");
    expect(directive(enforced, "img-src")).toContain("https:");
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
