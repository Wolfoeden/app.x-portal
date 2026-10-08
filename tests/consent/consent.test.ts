import { afterEach, describe, expect, it, vi } from "vitest";

import {
  adsTagAllowed,
  consentCookieValue,
  googleAdsId,
  optionalServicesAvailable,
  parseConsent,
} from "@/lib/consent/consent";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Oktober 2026: Das Google-Ads-Tag ist der erste Dienst, der eine
// Einwilligung braucht. Ohne Zustimmung lädt es nicht.
describe("Einwilligung für das Google-Ads-Tag", () => {
  it("liest nur eine gültige Google-Ads-ID", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", " AW-10826269095 ");
    expect(googleAdsId()).toBe("AW-10826269095");
    expect(optionalServicesAvailable()).toBe(true);

    for (const invalid of ["", "G-ABC123", "AW-", "AW-123\"><script>", "UA-1234567"]) {
      vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", invalid);
      expect(googleAdsId()).toBeNull();
      expect(optionalServicesAvailable()).toBe(false);
    }
  });

  it("wertet eine alte Kenntnisnahme nicht als Einwilligung", () => {
    expect(parseConsent("xportal_cookie_consent=v2.all")).toBeNull();
    // Bis Oktober 2026 hieß „Verstanden“ schlicht `essential` oder `all`.
    expect(parseConsent("xportal_cookie_consent=all")).toBeNull();
    expect(parseConsent("xportal_cookie_consent=essential")).toBeNull();
    expect(parseConsent(`a=1; xportal_cookie_consent=${consentCookieValue("all")}; b=2`)).toBe("all");
    expect(parseConsent(`xportal_cookie_consent=${consentCookieValue("essential")}`)).toBe("essential");
    expect(parseConsent("")).toBeNull();
  });

  it("bietet Produktmessung auch ohne Werbe-ID nur bei aktiver Konfiguration an", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", "");
    vi.stubEnv("NEXT_PUBLIC_PRODUCT_ANALYTICS_ENABLED", "true");
    expect(optionalServicesAvailable()).toBe(true);
    expect(googleAdsId()).toBeNull();
  });

  it("lädt nur mit Zustimmung, mit ID und nicht auf Betreiberseiten", () => {
    const id = "AW-10826269095";
    expect(adsTagAllowed({ consent: "all", pathname: "/chat", id })).toBe(true);
    expect(adsTagAllowed({ consent: "all", pathname: "/freelancer-finden", id })).toBe(true);
    expect(adsTagAllowed({ consent: "essential", pathname: "/chat", id })).toBe(false);
    expect(adsTagAllowed({ consent: null, pathname: "/chat", id })).toBe(false);
    expect(adsTagAllowed({ consent: "all", pathname: "/chat", id: null })).toBe(false);
    expect(adsTagAllowed({ consent: "all", pathname: "/chat/admin", id })).toBe(false);
    expect(adsTagAllowed({ consent: "all", pathname: "/chat/admin/vermittlungen", id })).toBe(false);
    expect(adsTagAllowed({ consent: "all", pathname: "/chat/administration", id })).toBe(true);
  });
});
