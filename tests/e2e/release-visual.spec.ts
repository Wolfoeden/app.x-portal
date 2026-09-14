import { expect, test } from "@playwright/test";

const widths = [390, 768, 1280] as const;
const targets = [
  { id: "guest", path: "/chat/preview?auth=guest&state=empty" },
  { id: "marketing", path: "/freelancer-finden" },
  { id: "terms", path: "/terms" },
  { id: "pricing", path: "/chat/preview?state=ranked", pricing: true },
  { id: "admin", path: "/chat/preview/admin-pages?view=users" },
] as const;

test.beforeEach(async ({ context }) => {
  await context.addCookies([{
    name: "xportal_cookie_consent",
    value: "essential",
    domain: "127.0.0.1",
    path: "/",
    sameSite: "Lax",
  }]);
});

for (const width of widths) {
  for (const target of targets) {
    test(`${target.id} bleibt bei ${width} px visuell stabil`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(target.path);

      if ("pricing" in target) {
        if (width <= 860) {
          await page.getByRole("button", { name: "Projekte öffnen" }).click();
        }
        await page.getByRole("button", { name: "Konto und Einstellungen öffnen" }).click();
        await page.getByRole("button", { name: "Mehr Credits erhalten" }).click();
        await expect(page.getByRole("dialog", { name: "Credits und Pläne" })).toBeVisible();
      } else {
        await expect(page.locator("h1:visible")).toHaveCount(1);
      }

      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
      await expect(page).toHaveScreenshot(`${target.id}-${width}.png`, {
        animations: "disabled",
        fullPage: true,
      });
    });
  }
}
