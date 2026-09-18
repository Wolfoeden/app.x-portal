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
    await expect(page.getByRole("heading", { name: /^Schönen Guten (Morgen|Tag|Abend), Recruiter$/u })).toBeVisible();
    await expect(page.getByLabel("Das passiert nach dem Absenden")).toHaveCount(0);
    await expect(page.getByText("Gast-Credits", { exact: false })).toHaveCount(0);
    await expect(page.getByText("KI strukturiert den Text", { exact: false })).toHaveCount(0);
    await expect(page.getByLabel("Projekt oder Ergänzung beschreiben")).toBeVisible();
  });

  test("Konto: Ergebnis, Merkliste und Kontostand bleiben erreichbar", async ({ page }) => {
    await page.goto("/chat/preview?state=ranked");
    await expect(page.getByText("Das bringt das Profil für Ihr Projekt mit").first()).toBeVisible();
    await expect(page.getByText("Im Erstgespräch klären", { exact: true }).first()).toBeVisible();
    await page.getByText("Wie kommt diese Auswahl zustande?").click();
    await expect(page.getByLabel("Vom Projekttext zur prüfbaren Auswahl")).toBeVisible();
    await page.getByRole("button", { name: "Vollständiges Profil und Belege" }).first().click();
    await expect(page.getByText("Im Profil belegt", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Anna Keller", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Konto und Einstellungen öffnen" }).click();
    await expect(page.getByText("1.182 Credits", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Merkliste" })).toBeVisible();
  });

  test("Treffer: Anfragebezug, Honorar und Start stehen vor dem vollständigen Profil", async ({ page }) => {
    await page.goto("/chat/preview?scenario=automation&auth=guest");
    const alex = page.locator("article.profile-card", { hasText: "Alex Beispiel" });
    const jo = page.locator("article.profile-card", { hasText: "Jo Beispiel" });
    await expect(alex).toBeVisible();
    await expect(jo).toBeVisible();

    await expect(alex.getByText("n8n und Large Language Models im Profil genannt")).toBeVisible();
    await expect(alex.locator(".profile-evidence-row").first()).toContainText("n8n");
    await expect(jo.getByText("Als „LLM“ angegeben")).toBeVisible();
    await expect(alex.getByText("2.000 € / Tag")).toBeVisible();
    await expect(alex.getByText("Start kurzfristig: noch zu klären")).toBeVisible();
    await expect(alex.getByText(/Unterstützt Unternehmen bei KI-Roadmaps/u)).toHaveCount(0);

    await alex.getByRole("button", { name: "Vollständiges Profil und Belege" }).click();
    await expect(alex.getByText(/Unterstützt Unternehmen bei KI-Roadmaps/u)).toBeVisible();
    await expect(alex.getByRole("button", { name: "Kontaktwege anzeigen" })).toBeVisible();
  });

  test("Gast: Terminaktion nennt das gewählte Profil und bucht nichts", async ({ page }) => {
    await page.goto("/chat/preview?scenario=automation&auth=guest");
    const dialog = page.getByRole("dialog");

    await page.getByRole("button", { name: "Erstgespräch mit Alex Beispiel vereinbaren" }).click();
    await expect(dialog.locator(".auth-profile-context")).toContainText("Alex Beispiel");
    await expect(dialog.locator(".auth-profile-context")).toContainText("KI-Automatisierung mit n8n und LLM-Anbindung");
    await expect(dialog).toContainText("es wird nichts automatisch gebucht");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // Nach dem Abbruch gilt die neue Aktion — nicht das zuvor gewählte Profil.
    const jo = page.locator("article.profile-card", { hasText: "Jo Beispiel" });
    await jo.getByRole("button", { name: "Vollständiges Profil und Belege" }).click();
    await jo.getByRole("button", { name: "Kontaktwege anzeigen" }).click();
    await expect(dialog.locator(".auth-profile-context")).toContainText("Jo Beispiel");
    await expect(dialog.locator(".auth-profile-context")).not.toContainText("Alex Beispiel");
  });

  test("Teiltreffer: sichtbar, buchbar und mit offenem Muss-Kriterium", async ({ page }) => {
    await page.goto("/chat/preview?scenario=automation&auth=guest&state=partial");
    await expect(page.getByRole("heading", { name: "2 Profile mit Überschneidungen – wichtige Punkte offen" })).toBeVisible();
    const kim = page.locator("article.profile-card", { hasText: "Kim Beispiel" });
    await expect(page.locator("article.profile-card", { hasText: "Sam Beispiel" })).toBeVisible();
    await expect(kim.getByText("Teilpassung", { exact: true })).toBeVisible();
    await expect(kim.locator(".profile-evidence-row.is-missing")).toContainText("n8n");
    await expect(kim.locator(".profile-evidence-row.is-missing")).toContainText("Nicht im Profil aufgeführt");
    await expect(kim.getByText(/Kontakt auf eigene Entscheidung/u)).toBeVisible();
    await expect(kim.getByRole("button", { name: "Erstgespräch mit Kim Beispiel vereinbaren" })).toBeEnabled();
  });

  test("Kein Treffer: Kriterien prüfen, ohne Grenzen zu lockern oder zu suchen", async ({ page }) => {
    const searches: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/chat")) searches.push(request.url());
    });
    await page.goto("/chat/preview?scenario=automation&auth=guest&state=no_match");
    await expect(page.getByRole("heading", { name: "Noch kein passendes Profil für diese Kombination" })).toBeVisible();

    const toggle = page.getByRole("button", { name: "Suchkriterien prüfen" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#recovery-field-hardRequirements")).toHaveValue("n8n");
    await expect(page.locator("#recovery-field-budgetOrRate")).toHaveValue("max. 500 € / Tag");

    await page.locator("#recovery-field-budgetOrRate").fill("max. 800 € / Tag");
    await page.getByRole("button", { name: "Übernehmen und neu suchen" }).click();
    await expect(page.getByText(/Lokale Vorschau/u)).toBeVisible();
    expect(searches).toEqual([]);

    await page.getByText("Öffentlich weitersuchen · 30 Credits").click();
    await expect(page.getByRole("button", { name: "Anmelden und Recherche-Agent starten" })).toBeVisible();
  });

  for (const state of ["ranked", "partial", "no_match"]) {
    test(`Mobil: Ergebnisfall ${state} ohne horizontalen Überlauf`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/chat/preview?scenario=automation&auth=guest&state=${state}`);
      await expect(page.locator(".result-section")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
      if (state !== "no_match") {
        const action = page.locator(".profile-main-actions .primary-action").first();
        await action.scrollIntoViewIfNeeded();
        const box = await action.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        await action.click();
        await expect(page.getByRole("dialog")).toBeVisible();
      }
    });
  }

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
    await expect(page.getByRole("link", { name: /Enterprise per E-Mail anfragen/u })).toHaveAttribute("href", /^mailto:[^?]+\?subject=XPORTAL%20Enterprise$/u);
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
    await expect(page.getByRole("heading", { level: 1, name: /^Freelancer finden\.\s*Termin buchen\.$/u })).toBeVisible();
    await expect(page.getByLabel("So entsteht ein nachvollziehbarer Match")).toBeVisible();
    await expect(page.getByText("100 Credits", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("3 Credits", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "App öffnen" }).first()).toBeVisible();
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
