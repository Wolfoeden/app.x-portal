import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

// 18.10.2026: Jede öffentliche Seite lud rund 150 KB Chat-CSS, bevor sie
// etwas zeigte. Es lädt jetzt nur, wo der Talent Index oder seine Bausteine
// (Anmelde- und Kontaktdialoge, Profil- und Bewerberseiten) stehen.
describe("stylesheets per page", () => {
  it("keeps the chat styles out of the global stylesheet", () => {
    const globals = read("app/globals.css");
    expect(globals).not.toMatch(/workspace\.css|profile-results\.css|composer\.css/u);
    expect(globals).toContain("shared.css");
    expect(read("app/styles/shared.css")).toMatch(/\.cookie-layer \{/u);
    expect(read("app/styles/shared.css")).toMatch(/\.legal-footer \{/u);
  });

  it("loads them where the Talent Index and its dialogs are used", () => {
    for (const file of [
      "app/chat/layout.tsx",
      "app/gespraeche/page.tsx",
      "app/mein-team/page.tsx",
      "app/anmelden/page.tsx",
      "app/bewerber-portal/apply/page.tsx",
      "app/profil/[id]/page.tsx",
      "app/kontaktfreigabe/page.tsx",
    ]) {
      expect(read(file), file).toContain('import "@/app/styles/app-surface";');
    }
    expect(read("components/marketing/LandingIntake.tsx")).toContain('import "@/app/styles/composer.css";');
    expect(read("components/CaptchaField.tsx")).toContain('import "@/app/styles/captcha.css";');
  });
});
