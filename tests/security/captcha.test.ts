import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captchaConfigured,
  captchaErrorMessage,
  verifyCaptcha,
} from "@/lib/security/captcha";

const ORIGINAL = { ...process.env };

function configure({ production = false } = {}) {
  process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY = "site-key";
  process.env.HCAPTCHA_SECRET = "secret-key";
  vi.stubEnv("NODE_ENV", production ? "production" : "test");
}

function unconfigure({ production = false } = {}) {
  delete process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY;
  delete process.env.HCAPTCHA_SECRET;
  vi.stubEnv("NODE_ENV", production ? "production" : "test");
}

function respondWith(body: unknown, ok = true) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 }));
}

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.unstubAllEnvs();
});

describe("captcha verification", () => {
  it("accepts a token hCaptcha confirms", async () => {
    configure();
    const fetcher = respondWith({ success: true, "error-codes": [] });

    await expect(verifyCaptcha("token", "203.0.113.10", fetcher)).resolves.toEqual({ ok: true });
  });

  it("sends secret, response and sitekey as form data", async () => {
    configure();
    const fetcher = respondWith({ success: true });

    await verifyCaptcha("token", "203.0.113.10", fetcher);

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.hcaptcha.com/siteverify");
    const sent = new URLSearchParams(String(init.body));
    expect(sent.get("secret")).toBe("secret-key");
    expect(sent.get("response")).toBe("token");
    expect(sent.get("sitekey")).toBe("site-key");
    expect(sent.get("remoteip")).toBe("203.0.113.10");
  });

  // Ein fehlender Wert darf die Anfrage nicht als leeres Feld verfaelschen.
  it("omits the address when none is known", async () => {
    configure();
    const fetcher = respondWith({ success: true });

    await verifyCaptcha("token", null, fetcher);

    const sent = new URLSearchParams(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.has("remoteip")).toBe(false);
  });

  it("rejects a token hCaptcha refuses", async () => {
    configure();
    const fetcher = respondWith({ success: false, "error-codes": ["invalid-input-response"] });

    await expect(verifyCaptcha("token", null, fetcher)).resolves.toEqual({
      ok: false,
      reason: "rejected",
    });
  });

  it("rejects an empty token without asking hCaptcha", async () => {
    configure();
    const fetcher = respondWith({ success: true });

    await expect(verifyCaptcha("   ", null, fetcher)).resolves.toEqual({
      ok: false,
      reason: "missing",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  // Dass hCaptcha gerade nicht erreichbar ist, sagt nichts darueber aus, ob am
  // anderen Ende ein Mensch sitzt.
  it("does not let people through when hCaptcha cannot be reached", async () => {
    configure();
    const failing = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(verifyCaptcha("token", null, failing)).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });

    const serverError = respondWith({}, false);
    await expect(verifyCaptcha("token", null, serverError)).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  describe("when no keys are set", () => {
    it("blocks in production, so a forgotten key cannot silently disable the check", async () => {
      unconfigure({ production: true });

      await expect(verifyCaptcha("token", null, respondWith({}))).resolves.toEqual({
        ok: false,
        reason: "not_configured",
      });
    });

    it("lets development through, so nobody needs keys to fill in a form locally", async () => {
      unconfigure();

      await expect(verifyCaptcha(null, null, respondWith({}))).resolves.toEqual({ ok: true });
    });

    it("reports itself as not configured", () => {
      unconfigure();
      expect(captchaConfigured()).toBe(false);

      configure();
      expect(captchaConfigured()).toBe(true);
    });
  });
});

describe("captcha error messages", () => {
  // Ein fehlender Haken ist der Fehler des Nutzers, alles andere unserer.
  it("names the missing tick as something the user can fix", () => {
    expect(captchaErrorMessage("missing")).toContain("Kästchen");
  });

  it("does not send the user looking for a mistake they did not make", () => {
    for (const reason of ["unreachable", "not_configured"] as const) {
      const message = captchaErrorMessage(reason);
      expect(message).toContain("nicht erreichbar");
      expect(message).not.toContain("Kästchen");
    }
  });
});
