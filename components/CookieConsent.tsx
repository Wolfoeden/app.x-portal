"use client";

import { useEffect, useState } from "react";

import {
  CONSENT_CHANGED_EVENT,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  consentCookieValue,
  googleAdsId,
  optionalServicesAvailable,
  parseConsent,
  type ConsentChoice,
} from "@/lib/consent/consent";

/**
 * Die Datenschutz-Auswahl.
 *
 * Bis Oktober 2026 setzte XPORTAL nur technisch notwendige Cookies ein, und
 * der Layer war eine Kenntnisnahme: Ein „Alle akzeptieren“ hätte eine
 * Einwilligung eingeholt, die nichts trug. Mit dem Google-Ads-Tag
 * (`components/GoogleAdsTag.tsx`) gibt es den ersten optionalen Dienst; ist
 * seine ID gesetzt (`optionalServicesAvailable()`), fragt der Layer wieder
 * richtig — Ablehnen so leicht wie Zustimmen. Ohne ID (lokal, Vorschau)
 * bleibt es bei der Kenntnisnahme.
 *
 * Seit 18.10.2026 steht der Hinweis schon im HTML jeder Seite. Vorher
 * erschien er erst nach dem JavaScript und war auf dem Telefon das größte
 * Element, also das, auf das die Ladezeit (LCP) wartete. Wer schon gewählt
 * hat, sieht ihn trotzdem nicht: `CONSENT_PAINT_SCRIPT` blendet ihn vor dem
 * ersten Zeichnen aus, nach dem Laden verschwindet er ganz.
 */

type ConsentView = "hidden" | "banner" | "settings";

export const OPEN_COOKIE_SETTINGS_EVENT = "xportal:open-cookie-settings";

function currentChoice(): ConsentChoice | null {
  return parseConsent(document.cookie);
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}

export function CookieSettingsButton({ className = "legal-footer-button" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={openCookieSettings}>
      Cookie-Einstellungen verwalten
    </button>
  );
}

export function CookieConsent() {
  // Beim Build eingesetzt (`NEXT_PUBLIC_`); als Aufruf, damit Tests ihn setzen können.
  const OPTIONAL_SERVICES_AVAILABLE = optionalServicesAvailable();
  const ADS_AVAILABLE = googleAdsId() !== null;
  const [view, setView] = useState<ConsentView>("banner");
  const [choice, setChoice] = useState<ConsentChoice>("essential");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = currentChoice();
      if (!stored) return;
      setChoice(stored);
      setView("hidden");
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const openSettings = () => {
      setChoice(currentChoice() ?? "essential");
      setView("settings");
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
  }, []);

  const saveChoice = (nextChoice: ConsentChoice) => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_COOKIE}=${consentCookieValue(nextChoice)}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    setChoice(nextChoice);
    setView("hidden");
    if (nextChoice === "essential") {
      try {
        const keys = Object.keys(sessionStorage).filter(key => key.startsWith("xportal.recruiting-measurement."));
        keys.forEach(key => sessionStorage.removeItem(key));
        localStorage.removeItem("xportal.signup-funnel.v1");
        localStorage.removeItem("xportal.signup-funnel-entry.v1");
      } catch { /* Revocation still applies when browser storage is disabled. */ }
    }
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: nextChoice }));
  };

  const consentLayer = view !== "hidden" ? (
    <div className={`cookie-layer ${view === "settings" ? "is-settings" : ""}`}>
      <section
        className="cookie-panel"
        role={view === "settings" ? "dialog" : "region"}
        aria-modal={view === "settings" ? "true" : undefined}
        aria-labelledby="cookie-title"
      >
        <div className="cookie-copy">
          <p className="xhome-label">Datenschutz-Einstellungen</p>
          <h2 id="cookie-title">
            {view === "settings"
              ? "Cookie-Einstellungen"
              : OPTIONAL_SERVICES_AVAILABLE
                ? "Produkt- und Werbemessung erlauben?"
                : "Nur notwendige Cookies"}
          </h2>
          {/* Die Kenntnisnahme ohne Wahl bleibt kurz. hCaptcha wird dort
              ausgewiesen, wo es läuft (am Formular), und die vollständige
              Fassung steht in den Einstellungen und Datenschutzhinweisen. */}
          {view === "banner" && !OPTIONAL_SERVICES_AVAILABLE ? (
            <p>
              XPORTAL setzt nur technisch notwendige Cookies für Anmeldung,
              Sicherheit und Ihre Auswahl – keine Analyse, kein Marketing.
              {" "}<a href="/privacy">Datenschutzhinweise</a>
              {" · "}<a href="/imprint">Impressum</a>
            </p>
          ) : view === "banner" ? (
            // Kurz, damit der Hinweis auf dem Telefon nicht die Seite verdeckt;
            // Zweck, Empfänger, USA und Widerruf bleiben, der Rest steht in
            // den Einstellungen und den Datenschutzhinweisen.
            <p>
              Notwendige Cookies brauchen wir für Anmeldung und Sicherheit. Mit
              Ihrer Zustimmung messen wir außerdem die Nutzung, ohne Projekttexte,
              Lebensläufe und Kontaktdaten
              {ADS_AVAILABLE
                ? ", und mit Google Ads (Google Ireland Ltd.), welche Anzeigen zu Besuchen führen; dabei können Daten in die USA übertragen werden"
                : ""}
              . Sie können jederzeit unter „Cookie-Einstellungen“ widerrufen.
              {" "}<a href="/privacy">Datenschutzhinweise</a>
              {" · "}<a href="/imprint">Impressum</a>
            </p>
          ) : (
            <p>
              XPORTAL verwendet ausschließlich technisch notwendige Cookies und
              Sitzungsspeicher für Anmeldung, Sicherheit und Ihre Auswahl. Auf dem
              Kontaktformular prüft hCaptcha, ob ein Mensch
              absendet; dabei wird Ihre IP-Adresse an Intuition Machines, Inc.
              (USA) übertragen.
              {OPTIONAL_SERVICES_AVAILABLE
                ? " Optionale Produktmessung erfasst Nutzungsereignisse ohne Projekttexte, Lebensläufe und Kontaktdaten. Google Ads (Google Ireland Ltd.; Übermittlung in die USA möglich) lädt nur, wenn konfiguriert und zugestimmt. Ein Widerruf gilt ab sofort."
                : " Analyse- und Marketingdienste setzen wir nicht ein — hier gibt es nichts zu entscheiden. Sollte sich das ändern, fragen wir vorher."}
              {" "}<a href="/privacy">Datenschutzhinweise</a>
              {" · "}<a href="/imprint">Impressum</a>
            </p>
          )}
        </div>

        {view === "settings" ? (
          <div className="cookie-options">
            <div>
              <span>Notwendig</span>
              <strong>Immer aktiv</strong>
              <p>Erforderlich für Sicherheit, Sitzungen und die Speicherung Ihrer Auswahl.</p>
            </div>
            <div>
              <span>{OPTIONAL_SERVICES_AVAILABLE ? "Produkt- und Werbemessung" : "Optional"}</span>
              <strong>
                {OPTIONAL_SERVICES_AVAILABLE
                  ? choice === "all"
                    ? "Auswahl: akzeptiert"
                    : "Auswahl: abgelehnt"
                  : "Nicht eingesetzt"}
              </strong>
              <p>
                {OPTIONAL_SERVICES_AVAILABLE
                  ? "Erfasst die Nutzungsschritte der Software ohne sensible Inhalte. Ein konfiguriertes Google-Ads-Tag ordnet Anzeigenklicks Besuchen zu. Ohne Zustimmung werden diese optionalen Dienste nicht aktiviert."
                  : "Es ist kein optionaler Dienst eingebunden. Eine Zustimmung würde nichts aktivieren."}
              </p>
            </div>
          </div>
        ) : null}

        <div className="cookie-actions">
          {view === "banner" ? (
            <button type="button" className="is-settings-choice" onClick={() => setView("settings")}>
              Einwilligung anpassen
            </button>
          ) : null}
          <button type="button" className="is-decline-choice" onClick={() => saveChoice("essential")}>
            Ich lehne optionale Cookies ab
          </button>
          <button type="button" className="is-accept-choice" onClick={() => saveChoice("all")}>
            Alle Cookies akzeptieren
          </button>
        </div>
      </section>
    </div>
  ) : null;

  return consentLayer;
}
