import { chromium } from "@playwright/test";

/**
 * Misst, wie schnell öffentliche Seiten für Besucher sind (18.10.2026): je
 * Seite auf einem gedrosselten Handy (4× langsamere CPU, ~1,6 Mbit/s, 150 ms
 * Latenz) und auf dem Desktop, jeweils für neue Besucher (Cookie-Hinweis
 * sichtbar) und mit gespeicherter Wahl.
 *
 *   pnpm measure:performance https://x-portal.eu
 *   pnpm measure:performance https://deploy-preview-128--app-x-portal-chat.netlify.app / /contact
 *
 * Gegen die Produktion nur mit Bedacht: jeder Lauf ist ein echter Aufruf in
 * den Netlify-Logs (die Zählung im Umsatzweg fängt das Skript ab).
 *
 * Gemessen werden TTFB, FCP, LCP mit dem größten Element, CLS, Total Blocking
 * Time und die übertragenen Bytes je Typ. Zählungen (Kalenderklick, Aufruf
 * der Kontakt- und Praxisseite, Produktmessung) fängt das Skript ab, damit
 * Messungen nicht im Umsatzweg landen.
 */

const [base = "http://localhost:3000", ...paths] = process.argv.slice(2);
const PATHS = paths.length ? paths : ["/", "/contact", "/praxis", "/preise", "/fuer-unternehmen"];
const COUNTING = /\/api\/(sales-call|praxis\/event|funnel-events|recruiting-events)(\/|$)/u;

// Ein vorinstalliertes Chromium (etwa in CI-Containern) über
// PLAYWRIGHT_CHROMIUM_PATH, sonst das von `playwright install`.
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });

async function measure(path, { mobile, consent }) {
  const context = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } });
  if (consent) await context.addCookies([{ name: "xportal_cookie_consent", value: "v3.essential", url: base }]);
  await context.route(COUNTING, (route) => route.fulfill({ status: 204 }));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  if (mobile) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }
  const bytes = {};
  const types = new Map();
  cdp.on("Network.responseReceived", (event) => types.set(event.requestId, event.type));
  cdp.on("Network.loadingFinished", (event) => {
    const type = types.get(event.requestId) ?? "Other";
    bytes[type] = (bytes[type] ?? 0) + event.encodedDataLength;
  });
  await page.addInitScript(() => {
    const store = { lcp: null, cls: 0, tbt: 0 };
    window.__perf = store;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const element = entry.element;
        store.lcp = {
          time: Math.round(entry.startTime),
          element: element ? `${element.tagName.toLowerCase()} „${(element.textContent ?? "").trim().slice(0, 40)}“` : String(entry.url).slice(-40),
        };
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) store.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) store.tbt += Math.max(0, entry.duration - 50);
    }).observe({ type: "longtask", buffered: true });
  });

  await page.goto(base + path, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(3000);
  const result = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      ttfb: Math.round(navigation.responseStart),
      fcp: Math.round(fcp?.startTime ?? -1),
      lcp: window.__perf.lcp,
      cls: Math.round(window.__perf.cls * 1000) / 1000,
      tbt: Math.round(window.__perf.tbt),
    };
  });
  await context.close();
  return { ...result, bytes };
}

const kb = (value) => `${Math.round((value ?? 0) / 1024)} KB`;
console.log(`Messung gegen ${base}, ${new Date().toISOString()}`);
for (const path of PATHS) {
  for (const mobile of [true, false]) {
    for (const consent of [false, true]) {
      const r = await measure(path, { mobile, consent });
      console.log([
        path.padEnd(18),
        (mobile ? "Handy" : "Desktop").padEnd(7),
        (consent ? "gewählt" : "neu").padEnd(7),
        `TTFB ${r.ttfb} ms`,
        `FCP ${r.fcp} ms`,
        `LCP ${r.lcp?.time ?? "–"} ms ${r.lcp?.element ?? ""}`,
        `CLS ${r.cls}`,
        `TBT ${r.tbt} ms`,
        `JS ${kb(r.bytes.Script)} · CSS ${kb(r.bytes.Stylesheet)} · Schrift ${kb(r.bytes.Font)} · Bild ${kb(r.bytes.Image)}`,
      ].join(" | "));
    }
  }
}
await browser.close();
