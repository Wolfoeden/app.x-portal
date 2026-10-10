"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";

/** Immediate route feedback without a full-screen loader or layout shift. */
export function PublicAppAction({ className }: { className: string }) {
  const [loading, setLoading] = useState(false);
  const [reducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function start(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setLoading(true);
  }

  return (
    <Link
      href="/chat"
      prefetch
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
    </Link>
  );
}
