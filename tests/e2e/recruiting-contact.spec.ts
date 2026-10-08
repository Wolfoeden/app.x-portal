import { test, expect } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`private contact and explicit retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let sent = false;
    const mutations: unknown[] = [];
    await page.route("**/api/introductions**", async route => {
      if (route.request().method() === "POST") {
        mutations.push(route.request().postDataJSON()); sent = true;
        await route.fulfill({ json: { introduction: { status: "ready_to_book" } } });
      } else await route.fulfill({ json: { introduction: {
        commercialModel: "no_fee", status: "ready_to_book", emailDelivery: sent ? "sent" : "failed",
        deliveryNeedsRetry: !sent,
        contact: { name: "Test Freelancer", email: "consented@example.invalid", bookingUrl: null },
      } } });
    });
    await page.goto("/chat/preview/contact");
    await expect(page.getByRole("link", { name: "consented@example.invalid" })).toBeVisible();
    const retry = page.getByRole("button", { name: "Benachrichtigung erneut zustellen" });
    await expect(retry).toBeVisible();
    expect(mutations).toHaveLength(0);
    await retry.focus(); await page.keyboard.press("Enter");
    await expect(retry).toHaveCount(0);
    expect(mutations).toEqual([expect.objectContaining({ retryDelivery: true, contactConsent: true, idempotencyKey: "contact:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333" })]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("pending consent exposes no address; failed refresh remains recoverable", async ({ page }) => {
  let unavailable = true;
  await page.route("**/api/introductions**", async route => {
    if (unavailable) await route.fulfill({ status: 503, json: { error: "unavailable" } });
    else await route.fulfill({ json: { introduction: { commercialModel: "no_fee", status: "requested", emailDelivery: "sent", contact: null } } });
  });
  await page.goto("/chat/preview/contact");
  await expect(page.locator(".form-error[role=alert]")).toContainText("nicht geladen");
  unavailable = false;
  await page.getByRole("button", { name: "Kontaktstatus aktualisieren" }).click();
  await expect(page.getByText("Eine private Kontaktadresse ist noch nicht freigegeben.")).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(page.locator(".form-error[role=alert]")).toHaveCount(0);
});
