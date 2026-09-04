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
    // Die Unternehmereigenschaft wird beim Bezahlvorgang abgefragt, nicht hier.
    expect(dialogs).not.toContain(
      "Ich handle als Unternehmer im Sinne des § 14 BGB und",
    );
    expect(repositoryFile("components/chat/account.tsx")).toContain(
      "Ich bestätige, dass ich als Unternehmer",
    );
  });
});
