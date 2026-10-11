"use client";

import { useId } from "react";

import styles from "./apply.module.css";

/** Ein kleines „i“ mit Erklärung beim Zeigen oder Antippen, ohne eigenen Absatz. */
export function InfoTip({ label, children }: { label: string; children: string }) {
  const id = useId();
  return (
    <span className={styles.infoBubble}>
      <button type="button" className={styles.infoTip} aria-label={label} aria-describedby={id}>i</button>
      <span role="tooltip" id={id}>{children}</span>
    </span>
  );
}

