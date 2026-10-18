"use client";

import { useEffect, useState, type MouseEvent } from "react";

import { appPath } from "@/lib/app-path";

/**
 * Immediate route feedback without a full-screen loader or layout shift.
 *
 * Ein gewöhnlicher Link statt `<Link>`: Der Talent Index muss als eigenes
 * Dokument laden, sonst bliebe die CSP der Seite stehen, von der man kommt
 * (`NONCE_ROUTES` in lib/security/csp.ts).
 */
export function PublicAppAction({ className }: { className: string }) {
  const [loading, setLoading] = useState(false);
  const [reducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Zurück aus dem Verlauf (bfcache) steht die Seite so da, wie man sie
  // verlassen hat; ohne das drehte sich der Hinweis weiter.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setLoading(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  function start(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setLoading(true);
  }

  return (
    <a
      href={appPath("/chat")}
      className={className}
      aria-label={loading ? "App wird gestartet" : "App starten"}
      onClick={start}
    >
      {loading ? (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <line x1={reducedMotion ? 8 : 7} y1="5" x2={reducedMotion ? 8 : 17} y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {reducedMotion ? null : <><animate attributeName="x1" values="7;8;8;7" dur="900ms" repeatCount="indefinite" /><animate attributeName="x2" values="17;8;8;17" dur="900ms" repeatCount="indefinite" /></>}
          </line>
          <line x1={reducedMotion ? 16 : 17} y1="5" x2={reducedMotion ? 16 : 7} y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {reducedMotion ? null : <><animate attributeName="x1" values="17;16;16;17" dur="900ms" repeatCount="indefinite" /><animate attributeName="x2" values="7;16;16;7" dur="900ms" repeatCount="indefinite" /></>}
          </line>
        </svg>
      ) : "App starten"}
    </a>
  );
}
