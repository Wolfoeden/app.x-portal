import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CONSENT_PAINT_SCRIPT } from "@/lib/consent/consent";
import {
  buildContentSecurityPolicy,
  CONSENT_PAINT_SCRIPT_HASH,
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
  NONCE_ROUTES,
  rendersWithNonce,
} from "@/lib/security/csp";
import { config } from "@/proxy";

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
  // 18.10.2026: Für die vorgerenderten Seiten ist das kein Zwischenstand
  // mehr, sondern die Fassung auf Dauer. Dort steht keine Nonce im HTML, und
  // Hashes passen nicht zu den RSC-Inline-Skripten (lib/security/csp.ts).
  it("keeps 'unsafe-inline' in the enforced policy, which prerendered pages rely on", () => {
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

  // 18.10.2026: das Skript, das den Cookie-Hinweis vor dem ersten Zeichnen
  // ausblendet, wenn schon gewählt wurde. Nur die Nonce-Fassung kennt seinen
  // Hash; in der durchgesetzten würde er 'unsafe-inline' abschalten.
  it("allows the consent paint script by its hash, only in the nonce variant", () => {
    const hash = `'sha256-${createHash("sha256").update(CONSENT_PAINT_SCRIPT).digest("base64")}'`;
    expect(CONSENT_PAINT_SCRIPT_HASH).toBe(hash);
    expect(directive(buildContentSecurityPolicy({ nonce: "abc123", isProduction: true }), "script-src")).toContain(hash);
    expect(directive(buildContentSecurityPolicy({ isProduction: true }), "script-src")).not.toContain("sha256-");
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

const REPO = path.resolve(import.meta.dirname, "../..");

function filesBelow(directory: string, name: RegExp): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(target, name);
    return name.test(entry.name) ? [target] : [];
  });
}

/** `connection()` oder `force-dynamic`: Die Seite entsteht je Anfrage. */
function rendersPerRequest(file: string): boolean {
  const source = readFileSync(file, "utf8");
  return /await connection\(\)/u.test(source) || /export const dynamic = "force-dynamic"/u.test(source);
}

/**
 * 18.10.2026: Die Nonce-Fassung gilt nur auf Seiten, die je Anfrage entstehen.
 * Auf einer vorgerenderten Seite steht keine Nonce im HTML; die Fassung
 * blockiert dort jeden Chunk. So war es auf /chat, bis dieser Test kam.
 */
describe("content security policy: where the nonce applies", () => {
  it("runs the proxy exactly on the nonce routes", () => {
    expect(config.matcher.map((entry) => entry.source)).toEqual(
      NONCE_ROUTES.map((route) => `${route}/:path*`),
    );
  });

  it("renders every page below a nonce route per request", () => {
    for (const route of NONCE_ROUTES) {
      const directory = path.join(REPO, "app", route);
      const pages = filesBelow(directory, /^page\.tsx$/u);
      expect(pages.length, route).toBeGreaterThan(0);

      for (const page of pages) {
        // Die Seite selbst oder ein Layout zwischen ihr und der Route.
        const layouts: string[] = [];
        for (let dir = path.dirname(page); dir.startsWith(directory); dir = path.dirname(dir)) {
          const layout = path.join(dir, "layout.tsx");
          if (existsSync(layout)) layouts.push(layout);
        }
        expect(
          [page, ...layouts].some(rendersPerRequest),
          `${path.relative(REPO, page)} wird vorgerendert und bekäme keine Nonce`,
        ).toBe(true);
      }
    }
  });

  // Eine Richtlinie gilt für das Dokument. Ein `<Link>` von einer statischen
  // Seite in den Talent Index ließe ihn unter `'unsafe-inline'` laufen.
  it("enters the nonce routes from elsewhere with a full page load", () => {
    const inside = NONCE_ROUTES.map((route) => path.join(REPO, "app", route) + path.sep);
    const sources = [
      ...filesBelow(path.join(REPO, "app"), /\.tsx$/u),
      ...filesBelow(path.join(REPO, "components"), /\.tsx$/u),
    ].filter((file) => !inside.some((directory) => file.startsWith(directory)));

    const offenders = sources.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/<Link\b[^<]*?\bhref=\{?\s*["'`]([^"'`]*)/gu)]
        .filter((match) => rendersWithNonce(match[1]))
        .map((match) => `${path.relative(REPO, file)}: ${match[1]}`),
    );
    expect(offenders).toEqual([]);
  });

  it("recognises links into the nonce routes and nothing else", () => {
    expect(rendersWithNonce("/chat")).toBe(true);
    expect(rendersWithNonce("/chat?anmelden=1")).toBe(true);
    expect(rendersWithNonce("/chat/admin/leads")).toBe(true);
    expect(rendersWithNonce("/profil/c314d7c4-4428-45ac-ba54-1a657b9f6b62")).toBe(true);
    expect(rendersWithNonce("/gespraeche#offen")).toBe(true);
    expect(rendersWithNonce("/mein-team")).toBe(true);

    expect(rendersWithNonce("/")).toBe(false);
    expect(rendersWithNonce("/chatbot")).toBe(false);
    expect(rendersWithNonce("/anmelden?checkout=basic")).toBe(false);
    expect(rendersWithNonce("/fuer-unternehmen")).toBe(false);
  });
});
