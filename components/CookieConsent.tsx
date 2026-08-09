"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ConsentChoice = "all" | "essential";
type ConsentView = "hidden" | "banner" | "settings";

const CONSENT_COOKIE = "xportal_cookie_consent";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function currentChoice(): ConsentChoice | null {
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  const value = match?.slice(CONSENT_COOKIE.length + 1);
  return value === "all" || value === "essential" ? value : null;
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

  const saveChoice = (nextChoice: ConsentChoice) => {
    document.cookie = `${CONSENT_COOKIE}=${nextChoice}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax; Secure`;
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
          <p className="xhome-label">Privacy controls</p>
          <h2 id="cookie-title">
            {view === "settings" ? "Cookie settings" : "Your choice. Kept simple."}
          </h2>
          <p>
            Essential cookies keep security and your consent choice working.
            Optional cookies are disabled unless you accept them. XPORTAL does
            not currently load third-party analytics on this page.
          </p>
        </div>

        {view === "settings" ? (
          <div className="cookie-options">
            <div>
              <span>Essential</span>
              <strong>Always active</strong>
              <p>Required for security, session handling and consent storage.</p>
            </div>
            <div>
              <span>Optional</span>
              <strong>{choice === "all" ? "Accepted" : "Rejected"}</strong>
              <p>Reserved for optional measurement tools if they are introduced later.</p>
            </div>
          </div>
        ) : null}

        <div className="cookie-actions">
          <button type="button" onClick={() => saveChoice("essential")}>Reject optional cookies</button>
          <button type="button" className="is-primary" onClick={() => saveChoice("all")}>Accept all cookies</button>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        className="xhome-footer-button"
        onClick={() => setView("settings")}
      >
        Cookie settings
      </button>
      {consentLayer && typeof document !== "undefined"
        ? createPortal(consentLayer, document.body)
        : null}
    </>
  );
}
