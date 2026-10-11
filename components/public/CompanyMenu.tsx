"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { COMPANY_LINKS } from "./company-links";
import styles from "./public-chrome.module.css";

/**
 * „Für Unternehmen“ im Kopf: ein Menü mit Talent Index (die Arbeitsfläche
 * unter /chat) und den beiden Angeboten über das Kontaktformular. Die Links
 * stehen immer im HTML (nur versteckt), damit sie ohne JavaScript und für
 * Suchmaschinen da sind; auf Geräten mit Maus öffnet schon das Überfahren.
 */
export function CompanyMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!groupRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className={styles.navGroup} ref={groupRef}>
      <button
        type="button"
        className={styles.navGroupButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        Für Unternehmen
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <ul id={panelId} className={styles.navPanel} hidden={!open}>
        {COMPANY_LINKS.map((link) => (
          <li key={link.label}>
            <Link href={link.href} prefetch={false} onClick={() => setOpen(false)}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
