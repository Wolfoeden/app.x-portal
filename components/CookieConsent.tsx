"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ConsentChoice = "all" | "essential";
type ConsentView = "hidden" | "banner" | "settings";

const CONSENT_COOKIE = "xportal_cookie_consent";
export const OPEN_COOKIE_SETTINGS_EVENT = "xportal:open-cookie-settings";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function currentChoice(): ConsentChoice | null {
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  const value = match?.slice(CONSENT_COOKIE.length + 1);
  return value === "all" || value === "essential" ? value : null;
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}

export function CookieSettingsButton({ className = "xhome-footer-button" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={openCookieSettings}>
      Cookie-Einstellungen verwalten
    </button>
  );
}

export function CookieConsent() {
  const [view, setView] = useState<ConsentView>("hidden");
  const [choice, setChoice] = useState<ConsentChoice>("essential");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = currentChoice();
      if (stored) {
        setChoice(stored);
        return;
      }
      setView("banner");
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
    document.cookie = `${CONSENT_COOKIE}=${nextChoice}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    setChoice(nextChoice);
    setView("hidden");
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
            {view === "settings" ? "Cookie-Einstellungen" : "Ihre Datenschutz-Auswahl"}
          </h2>
          <p>
            Notwendige Cookies sichern Anmeldung, Sicherheit und Ihre Auswahl.
            Optionale Dienste bleiben deaktiviert, bis Sie ausdrücklich zustimmen.
            XPORTAL lädt derzeit keine Drittanbieter-Analyse ohne Ihre Zustimmung.
            {" "}<a href="/privacy">Datenschutzhinweise ansehen</a>.
          </p>
        </div>

        {view === "settings" ? (
          <div className="cookie-options">
            <div>
              <span>Notwendig</span>
              <strong>Immer aktiv</strong>
              <p>Erforderlich für Sicherheit, Sitzungen und die Speicherung Ihrer Auswahl.</p>
            </div>
            <div>
              <span>Optional</span>
              <strong>{choice === "all" ? "Akzeptiert" : "Abgelehnt"}</strong>
              <p>Für optionale Mess- oder externe Mediendienste, falls diese später eingesetzt werden.</p>
            </div>
          </div>
        ) : null}

        <div className="cookie-actions">
          <button type="button" onClick={() => saveChoice("essential")}>Optionale ablehnen</button>
          <button type="button" className="is-primary" onClick={() => saveChoice("all")}>Alle akzeptieren</button>
        </div>
      </section>
    </div>
  ) : null;

  return consentLayer && typeof document !== "undefined"
    ? createPortal(consentLayer, document.body)
    : null;
}
