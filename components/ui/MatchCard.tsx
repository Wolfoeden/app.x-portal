import Image from "next/image";
import type { ReactNode } from "react";

import styles from "./match-card.module.css";

/** Eine Anforderung auf der Karte: erfüllt mit Beleg oder offen fürs Gespräch. */
export type MatchCardRow = { label: string; detail: string; open?: boolean };

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2.5 6.2 2.3 2.3 4.7-5" />
    </svg>
  );
}

/**
 * Die Profilkarte aus dem Desktop-Entwurf (Oktober 2026): Kopf mit Person
 * und Abdeckung, je Anforderung eine Zeile mit Beleg oder offenem Punkt,
 * darunter Honorar und Verfügbarkeit. Ohne Zustand, damit sie auf Server-
 * und Client-Seiten gleich aussieht (Startseite, Bewerber-Portal).
 */
export function MatchCard({
  caption,
  label,
  verified = false,
  avatar,
  name,
  role,
  score,
  rows,
  facts = [],
  footer,
  className,
}: {
  /** Kleine Zeile über allem, etwa die Anfrage, zu der die Karte gehört. */
  caption?: string;
  label?: string;
  verified?: boolean;
  avatar: { src?: string | null; initials: string };
  name: string;
  role: string;
  /** „4 von 4“; `partial`, wenn nicht alles erfüllt ist. */
  score?: { text: string; partial?: boolean } | null;
  rows: MatchCardRow[];
  facts?: ReadonlyArray<{ label: string; value: string }>;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <article className={className ? `${styles.card} ${className}` : styles.card}>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
      {label || verified ? (
        <div className={styles.band}>
          {label ? <span className={styles.label}>{label}</span> : <span />}
          {verified ? <span className={styles.verified}><Check /> Profil geprüft</span> : null}
        </div>
      ) : null}
      <div className={styles.head}>
        {avatar.src ? (
          <Image className={styles.avatar} src={avatar.src} alt="" width={52} height={52} unoptimized />
        ) : (
          <span className={styles.avatar} aria-hidden="true">{avatar.initials}</span>
        )}
        <div className={styles.identity}>
          <strong>{name}</strong>
          <span>{role}</span>
        </div>
        {score ? <span className={score.partial ? `${styles.score} ${styles.partial}` : styles.score}>{score.text}</span> : null}
      </div>
      {rows.length ? (
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={row.label} className={row.open ? styles.open : undefined}>
              <span>{row.open ? null : <Check />}{row.label}</span>
              <span>{row.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {facts.length ? (
        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </article>
  );
}
