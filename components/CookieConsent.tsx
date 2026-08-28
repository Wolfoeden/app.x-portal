"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Die Datenschutz-Auswahl.
 *
 * XPORTAL setzt derzeit ausschließlich technisch notwendige Cookies und
 * Sitzungsspeicher ein. Ein Layer mit „Alle akzeptieren“ holte damit eine
 * Einwilligung ein, die nichts trug: Es gab keinen Dienst, den sie aktiviert
 * hätte. Rechtlich unschädlich, aber es gewöhnt Nutzer an eine bedeutungslose
 * Zustimmung — und bei einer Prüfung sieht es aus wie ein Platzhalter.
 *
 * Solange `OPTIONAL_SERVICES_AVAILABLE` falsch ist, zeigt der Layer deshalb
 * nur eine Kenntnisnahme. Der Auswahlpfad bleibt im Code stehen und schaltet
 * sich mit dem ersten optionalen Dienst wieder ein — der Schalter ist die
 * ehrlichere Lösung, als den Code zu löschen und ihn später neu zu erfinden.
 */

/**
 * Auf `true` setzen, sobald ein Dienst existiert, der ohne Einwilligung nicht
 * geladen werden darf. Dann greift wieder die vollständige Auswahl, und die
 * gespeicherte Kenntnisnahme reicht nicht mehr als Einwilligung.
 */
const OPTIONAL_SERVICES_AVAILABLE = false;

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
            {view === "settings"
              ? "Cookie-Einstellungen"
              : OPTIONAL_SERVICES_AVAILABLE
                ? "Ihre Datenschutz-Auswahl"
                : "Nur notwendige Cookies"}
          </h2>
          <p>
            XPORTAL verwendet ausschließlich technisch notwendige Cookies und
            Sitzungsspeicher für Anmeldung, Sicherheit und Ihre Auswahl.
            {OPTIONAL_SERVICES_AVAILABLE
              ? " Optionale Dienste werden erst nach Ihrer Zustimmung geladen."
              : " Analyse- und Marketingdienste setzen wir nicht ein — hier gibt es nichts zu entscheiden. Sollte sich das ändern, fragen wir vorher."}
            {" "}<a href="/privacy">Datenschutzhinweise</a>
            {" · "}<a href="/imprint">Impressum</a>
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
              <strong>
                {OPTIONAL_SERVICES_AVAILABLE
                  ? choice === "all"
                    ? "Auswahl: akzeptiert"
                    : "Auswahl: abgelehnt"
                  : "Nicht eingesetzt"}
              </strong>
              <p>
                {OPTIONAL_SERVICES_AVAILABLE
                  ? "Diese Auswahl steuert, ob optionale Dienste geladen werden."
                  : "Es ist kein optionaler Dienst eingebunden. Eine Zustimmung würde nichts aktivieren."}
              </p>
            </div>
          </div>
        ) : null}

        <div className="cookie-actions">
          {OPTIONAL_SERVICES_AVAILABLE ? (
            <>
              <button type="button" onClick={() => saveChoice("essential")}>
                Optionale ablehnen
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => saveChoice("all")}
              >
                Alle akzeptieren
              </button>
            </>
          ) : (
            // Eine Schaltfläche, weil es genau eine Möglichkeit gibt. Zwei
            // gleich wirkende Knöpfe wären eine Scheinwahl.
            <button
              type="button"
              className="is-primary"
              onClick={() => saveChoice("essential")}
            >
              Verstanden
            </button>
          )}
        </div>
      </section>
    </div>
  ) : null;

  return consentLayer && typeof document !== "undefined"
    ? createPortal(consentLayer, document.body)
    : null;
}
