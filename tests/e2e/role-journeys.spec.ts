import { expect, test } from "@playwright/test";

test.describe("geschützte Rollen-Journeys", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{
      name: "xportal_cookie_consent",
      value: "essential",
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax",
    }]);
  });

  test("Gast: Projekt beschreiben, ohne versteckte Kontoaktion", async ({ page }) => {
    await page.goto("/chat/preview?auth=guest&state=empty");
    await expect(page.getByRole("heading", { name: "Projekt einfügen. Profil buchen." })).toBeVisible();
    await expect(page.getByLabel("Das passiert nach dem Absenden")).toHaveCount(0);
    await expect(page.getByText("Gast-Credits", { exact: false })).toHaveCount(0);
    await expect(page.getByText("KI strukturiert den Text", { exact: false })).toHaveCount(0);
    await expect(page.getByLabel("Projekt oder Ergänzung beschreiben")).toBeVisible();
  });

  test("Konto: Ergebnis, Merkliste und Kontostand bleiben erreichbar", async ({ page }) => {
    await page.goto("/chat/preview?state=ranked");
    await expect(page.getByLabel("Vom Projekttext zur prüfbaren Auswahl")).toBeVisible();
    await expect(page.getByText("Im Profil belegt", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Vor Kontakt offen", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Anna Keller", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Konto und Einstellungen öffnen" }).click();
    await expect(page.getByText("1.182 Credits", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Merkliste" })).toBeVisible();
  });

  test("Preise: Monatspläne und Enterprise-Verbrauch stehen zusammen", async ({ page }) => {
    await page.goto("/chat/preview?state=ranked");
    await page.getByRole("button", { name: "Konto und Einstellungen öffnen" }).click();
    await page.getByRole("button", { name: "Tarife ansehen" }).click();
    const dialog = page.getByRole("dialog", { name: "Credits und Pläne" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Basic", exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Business", exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Enterprise", exact: true })).toBeVisible();
    await expect(dialog.getByText("1.250 Credits pro Monat")).toBeVisible();
    await expect(dialog).toContainText("0,02 €");
    await expect(page.getByRole("heading", { name: "Was eine bestätigte Aktion kostet" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Enterprise per E-Mail anfragen/u })).toHaveAttribute("href", "mailto:roman@dering.info?subject=XPORTAL%20Enterprise");
  });

  test("Freelancer: Profilverwaltung und Nachweise sind erreichbar", async ({ page }) => {
    await page.goto("/freelancer/apply?preview=1");
    await expect(page.getByRole("heading", { level: 1, name: "Ihr Freelancer-Profil." })).toBeVisible();
    await expect(page.getByLabel("Vom Profil zum nachvollziehbaren Match")).toBeVisible();
    await expect(page.getByText("Regeln", { exact: true })).toBeVisible();
    await expect(page.getByText("Anna Beispiel", { exact: true }).first()).toBeVisible();
  });

  test("Marketing: Produkt, Verantwortungen, Preis und nächster Schritt sind sofort sichtbar", async ({ page }) => {
    await page.goto("/freelancer-finden");
    await expect(page.getByRole("heading", { level: 1, name: "Freelancer finden. Belege prüfen. Selbst entscheiden." })).toBeVisible();
    await expect(page.getByLabel("So entsteht ein nachvollziehbarer Match")).toBeVisible();
    await expect(page.getByText("100 Credits", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("3 Credits", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Projekt beschreiben" }).first()).toBeVisible();
  });

  test("Agenten: Aufgaben, Ergebnisse und Ausführungsgrenze sind konkret", async ({ page }) => {
    await page.goto("/agent");
    await expect(page.getByRole("heading", { name: "KI-Agenten beginnen mit einer klaren Aufgabe." })).toBeVisible();
    await expect(page.getByText("Ausgangspunkt", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Ergebnis", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Keine externe Aktion ohne Freigabe", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Konkrete Aufgaben" })).toBeVisible();
  });

  test("Admin: geschützte Betriebsansicht bleibt als Fixture abnehmbar", async ({ page }) => {
    await page.goto("/chat/preview/admin-pages?view=users");
    await expect(page.getByRole("navigation", { name: "Admin-Bereich" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zur XPORTAL App" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zur App" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin-Bereich" })).not.toContainText("Agent Grid");
    await expect(page.getByText("Nutzeraktivität", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Aktive und stille Konten" })).toBeVisible();
  });

  test("Sekundärflächen bleiben im gemeinsamen XPORTAL-Rahmen", async ({ page }) => {
    for (const route of [
      "/contact",
      "/terms",
      "/booking/kein-gueltiger-link",
      "/diese-seite-gibt-es-nicht",
    ]) {
      await page.goto(route);
      const brand = page.getByRole("link", { name: "XPORTAL – Freelancer finden" });
      await expect(brand).toBeVisible();
      await expect(brand.locator("svg")).toHaveCount(0);
      await expect(page.locator("h1:visible")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toContainText("Match-Protokoll statt Black Box.");
    }
  });

  test("Mobile App-Navigation hält den Fokus im Off-Canvas und gibt ihn zurück", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat/preview?auth=guest&state=empty");

    const menu = page.getByRole("button", { name: "Projekte öffnen" });
    const sidebar = page.locator('aside[aria-label="Projekte"]');
    await expect(menu).toBeVisible();
    await expect.poll(() => sidebar.evaluate((element) => (element as HTMLElement & { inert: boolean }).inert)).toBe(true);

    await menu.click();
    await expect(page.getByRole("dialog", { name: "Projekte" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Projekte" }).getByRole("button", { name: "Projektleiste schließen" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect.poll(() => sidebar.evaluate((element) => (element as HTMLElement & { inert: boolean }).inert)).toBe(true);
    await expect(menu).toBeFocused();
  });

  for (const route of [
    "/freelancer-finden",
    "/terms",
    "/freelancer/apply?preview=1",
    "/agent",
    "/cardano",
    "/contact",
    "/privacy",
    "/booking/kein-gueltiger-link",
  ]) {
    test(`Mobile Seitenrahmen ohne horizontalen Überlauf: ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
      await expect(page.locator("h1:visible")).toHaveCount(1);
    });
  }
});
