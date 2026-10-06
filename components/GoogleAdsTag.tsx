"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  adsTagAllowed,
  CONSENT_CHANGED_EVENT,
  GOOGLE_ADS_COOKIES,
  googleAdsId,
  parseConsent,
  type ConsentChoice,
} from "@/lib/consent/consent";

type Gtag = (...args: unknown[]) => void;
type AdsWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag };

const SCRIPT_ID = "xportal-google-ads-tag";

/**
 * Das Google-Ads-Tag (gtag.js), erst nach Einwilligung.
 *
 * Der Inhalt entspricht dem Snippet aus Google Ads. Er steht nicht als
 * Inline-Skript im HTML, sondern wird hier nach der Zustimmung angelegt: Ein
 * Inline-Skript liefe vor jeder Wahl, und die Nonce-Richtlinie
 * (`'strict-dynamic'`) erlaubt ein Skript, das der eigene Code erzeugt, ohne
 * eigene Nonce.
 *
 * Widerruf: Consent Mode auf „denied“, die `_gcl_*`-Cookies löschen und neu
 * laden — ein einmal geladenes Skript lässt sich anders nicht entfernen.
 */
export function GoogleAdsTag() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    const id = googleAdsId();
    if (!id) return;

    const load = (consent: ConsentChoice | null) => {
      if (!adsTagAllowed({ consent, pathname, id })) return;
      if (document.getElementById(SCRIPT_ID)) return;
      const win = window as AdsWindow;
      win.dataLayer = win.dataLayer || [];
      // gtag.js erwartet das `arguments`-Objekt, kein Array.
      win.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        win.dataLayer!.push(arguments);
      };
      // Es gibt kein Google Analytics; gemessen wird nur, was Anzeigen bringen.
      win.gtag("consent", "default", {
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
        analytics_storage: "denied",
      });
      win.gtag("js", new Date());
      win.gtag("config", id);
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(script);
    };

    const revoke = () => {
      const win = window as AdsWindow;
      win.gtag?.("consent", "update", {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      });
      const host = window.location.hostname;
      const domains = ["", `; domain=${host}`, `; domain=.${host.replace(/^www\./u, "")}`];
      for (const name of GOOGLE_ADS_COOKIES) {
        for (const domain of domains) {
          document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
        }
      }
      window.location.reload();
    };

    load(parseConsent(document.cookie));

    const onChange = (event: Event) => {
      const choice = (event as CustomEvent<ConsentChoice>).detail;
      if (choice === "all") load(choice);
      // Auch ohne geladenes Skript auf dieser Seite: Cookies aus einem
      // früheren Besuch mit Zustimmung gehören mit dem Widerruf gelöscht.
      else if (document.getElementById(SCRIPT_ID) || /(?:^|;\s*)_gcl_/u.test(document.cookie)) revoke();
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  }, [pathname]);

  return null;
}
