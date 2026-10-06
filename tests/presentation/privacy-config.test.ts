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

  // Oktober 2026: LinkedIn und GitHub wie Google nur in der Produktion, wo die
  // Callback-Adresse in Supabase freigegeben ist; Deploy-Vorschauen nicht.
  it("sets the LinkedIn and GitHub switches only in the Netlify production context", () => {
    const netlify = repositoryFile("netlify.toml");
    const production = netlify.split("[context.production.environment]")[1]?.split("[[plugins]]")[0];
    for (const flag of ["NEXT_PUBLIC_AUTH_LINKEDIN_ENABLED", "NEXT_PUBLIC_AUTH_GITHUB_ENABLED"]) {
      expect(production).toContain(`${flag} = "true"`);
      expect(netlify.split("[context.production.environment]")[0]).not.toContain(flag);
    }
  });

  // Oktober 2026: das Google-Ads-Tag. Die ID steht nur in der Produktion,
  // Deploy-Vorschauen messen nicht und behalten die Kenntnisnahme.
  it("sets the Google Ads ID only in the Netlify production context", () => {
    const netlify = repositoryFile("netlify.toml");
    const production = netlify.split("[context.production.environment]")[1]?.split("[[plugins]]")[0];

    expect(production).toContain('NEXT_PUBLIC_GOOGLE_ADS_ID = "AW-10826269095"');
    expect(netlify.split("[context.production.environment]")[0]).not.toContain("NEXT_PUBLIC_GOOGLE_ADS_ID");
  });

  /**
   * Die Einwilligung muss informiert und frei sein: Das Banner nennt den
   * Dienst und die USA-Übermittlung, und Ablehnen ist so leicht und so
   * sichtbar wie Zustimmen (gleiche Klasse, gleiche Gestaltung).
   */
  it("asks for ad measurement with equal-weight accept and reject", () => {
    const banner = repositoryFile("components/CookieConsent.tsx");
    const css = repositoryFile("app/styles/workspace.css");

    expect(banner).toContain("Google Ads");
    expect(banner).toContain("in die USA");
    expect(banner).toContain("widerrufen");
    expect(banner.match(/className="is-choice"/gu)).toHaveLength(2);
    expect(banner).toContain("Optionale ablehnen");
    expect(banner).toContain("Alle akzeptieren");
    expect(css).toMatch(/\.cookie-actions button\.is-choice\s*\{[^}]*flex: 1 1 0/u);
  });

  it("describes ad measurement in the privacy notice without naming the company", () => {
    const privacyPage = repositoryFile("app/privacy/page.tsx");

    for (const requiredText of ["Werbemessung", "Anbieter von Online-Werbung", "§ 25 Abs. 1 TDDDG", "Art. 6 Abs. 1 lit. a DSGVO", "_gcl_au", "widerrufen"]) {
      expect(privacyPage).toContain(requiredText);
    }
    expect(privacyPage).not.toContain("keine Analyse- oder Marketingcookies");
  });

  it("keeps the primary cookie action readable outside the landing-page scope", () => {
    const css = repositoryFile("app/styles/workspace.css");
    const rule = css.match(/\.cookie-actions button\.is-primary\s*\{([^}]*)\}/u)?.[1];

    expect(rule).toContain("background: white");
    expect(rule).toContain("color: #090909");
    expect(rule).not.toContain("var(--home-ink)");
  });

  it("describes the implemented processors, storage and user rights", () => {
    const privacyPage = repositoryFile("app/privacy/page.tsx");

    for (const requiredText of [
      // Der Verantwortliche selbst muss mit Namen dastehen — § 5 DDG und
      // Art. 13 Abs. 1 lit. a DSGVO lassen dafür keine Kategorie zu.
      "Roman Dering",
      // Auftragsverarbeiter dagegen nach Aufgabe und Ort.
      "Hosting und Auslieferungsnetz",
      "KI-Dienstleister",
      "Zahlungsdienstleister",
      "Anmeldeanbieter",
      "privaten, nicht öffentlich",
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

  /**
   * Die Entscheidung vom 04.09.2026: Auftragsverarbeiter werden nach Aufgabe
   * und Verarbeitungsort beschrieben, nicht mit Firmennamen. Art. 13 Abs. 1
   * lit. e DSGVO lässt „Empfänger *oder Kategorien* von Empfängern" zu, also
   * trägt das — aber nur, solange niemand beim nächsten Absatz aus Versehen
   * wieder einen Namen einsetzt. Deshalb steht die Regel hier als Test und
   * nicht als Vorsatz.
   */
  it("names processors by role, never by company", () => {
    const privacyPage = repositoryFile("app/privacy/page.tsx");
    const termsPage = repositoryFile("app/terms/page.tsx");

    for (const company of [
      "Netlify",
      "Supabase",
      "OpenAI",
      "Google",
      "Stripe",
      "IONOS",
      "hCaptcha",
      "Intuition Machines",
      "Calendly",
      "Montabaur",
      "GitHub",
      "LinkedIn",
    ]) {
      expect(privacyPage).not.toContain(company);
      expect(termsPage).not.toContain(company);
    }
  });

  /**
   * Ohne Namen bleibt die Drittlandübermittlung angabepflichtig: Art. 13
   * Abs. 1 lit. f verlangt die Tatsache der Übermittlung und die Grundlage,
   * und daran ändert die Kategorienschreibweise nichts.
   */
  it("still discloses the third-country transfers it makes", () => {
    const privacyPage = repositoryFile("app/privacy/page.tsx");

    expect(privacyPage).toContain("Übermittlung in ein Drittland");
    expect(privacyPage).toContain("in den USA");
    expect(privacyPage).toMatch(
      /Standardvertragsklauseln|Angemessenheitsbeschluss/u,
    );
  });

  /**
   * Und der Wortlaut der Zustimmung: ein Pflichthäkchen für die AGB, ein
   * getrenntes freiwilliges für den Newsletter. Gebündelt wäre die
   * Einwilligung nach Art. 7 Abs. 2 DSGVO angreifbar.
   */
  it("keeps the terms checkbox free of bundled declarations", () => {
    const dialogs = repositoryFile("components/chat/dialogs.tsx");

    expect(dialogs).toContain("Ich stimme den");
    expect(dialogs).toContain("Newsletter:");
    // Die Unternehmereigenschaft steht im zentralen Kaufweg, nicht im Login.
    expect(dialogs).not.toContain(
      "Ich handle als Unternehmer im Sinne des § 14 BGB und",
    );
    expect(repositoryFile("app/(marketing)/preise/page.tsx")).toContain(
      "BUSINESS_ONLY_NOTICE",
    );
    expect(repositoryFile("components/chat/account.tsx")).not.toContain(
      "Ich bestätige, dass ich als Unternehmer",
    );
  });
});
