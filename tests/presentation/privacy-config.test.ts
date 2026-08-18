import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function repositoryFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("production privacy and authentication configuration", () => {
  it("enables Google only in the Netlify production context", () => {
    const netlify = repositoryFile("netlify.toml");
    const production = netlify.split("[context.production.environment]")[1]?.split("[[plugins]]")[0];

    expect(production).toContain('NEXT_PUBLIC_SITE_URL = "https://x-portal.eu"');
    expect(production).toContain('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED = "true"');
    expect(netlify.split("[context.production.environment]")[0]).not.toContain(
      "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED",
    );
  });

  it("keeps the primary cookie action readable outside the landing-page scope", () => {
    const css = repositoryFile("app/globals.css");
    const rule = css.match(/\.cookie-actions button\.is-primary\s*\{([^}]*)\}/u)?.[1];

    expect(rule).toContain("background: white");
    expect(rule).toContain("color: #090909");
    expect(rule).not.toContain("var(--home-ink)");
  });

  it("describes the implemented processors, storage and user rights", () => {
    const privacyPage = repositoryFile("app/privacy/page.tsx");

    for (const requiredText of [
      "Roman Dering",
      "Netlify",
      "Supabase",
      "OpenAI",
      "Google",
      "privaten Dokumentenspeicher",
      "Lebenslauf",
      "kurzzeitig gültigen Download-Link",
      "xportal_guest_claim",
      "sessionStorage",
      "Speicherdauer",
      "Datenübertragbarkeit",
      "BayLDA",
      "Art. 22",
    ]) {
      expect(privacyPage).toContain(requiredText);
    }
    expect(privacyPage).not.toContain("Draft status");
    expect(privacyPage).not.toContain("must be completed");
  });
});
