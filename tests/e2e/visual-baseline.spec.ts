import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const baseline = "e36d9e24e8beb41ccc8887dc3b78a529252f7c74";
const widths = [390, 768, 1280] as const;
const pages = [
  { id: "guest", path: "/chat/preview?auth=guest&state=empty" },
  { id: "account", path: "/chat/preview?state=ranked" },
  { id: "marketing", path: "/freelancer-finden" },
  { id: "freelancer", path: "/freelancer/apply?preview=1" },
  { id: "admin", path: "/chat/preview/admin-pages?view=users" },
  { id: "terms", path: "/terms" },
] as const;

test("sichert die visuelle main-Basis für Kernoberflächen", async ({ page }) => {
  const output = path.resolve("docs", "baseline", baseline, "screenshots");
  await mkdir(output, { recursive: true });

  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const target of pages) {
      await page.goto(target.path);
      await expect(page.locator("body")).toBeVisible();
      await page.screenshot({
        path: path.join(output, `${target.id}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  }
});
