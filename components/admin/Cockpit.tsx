import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./cockpit.module.css";

/**
 * Bausteine des Admin-Cockpits, ohne Zustand und ohne Browser-Code: Karten,
 * Kennzahlen mit Verlauf, Status. Was sich bewegt (Live-Aktualisierung,
 * Säulen mit Hover), liegt in CockpitClient.tsx.
 */

export type StatusTone = "good" | "warning" | "critical" | "neutral";

const STATUS_ICON: Readonly<Record<StatusTone, ReactNode>> = {
  good: <path d="M3.5 8.5l3 3 6-7" />,
  warning: <path d="M8 3.5v5.5M8 12v.5" />,
  critical: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  neutral: <path d="M4 8h8" />,
};

/** Status mit Symbol und Wort — nie nur mit Farbe. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={styles.status} data-tone={tone}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {STATUS_ICON[tone]}
      </svg>
      {children}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.card}${className ? ` ${className}` : ""}`}>
      <header className={styles.cardHeader}>
        <h2>{title}</h2>
        {action ? (
          <Link href={action.href} prefetch={false}>
            {action.label} <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/**
 * Der Verlauf unter einer Kennzahl: die Vergangenheit leise, der letzte Wert
 * in der Datenfarbe. Säulen statt Linie, weil es Tageszählungen sind.
 */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const width = 120;
  const height = 26;
  const gap = 2;
  const barWidth = (width - gap * (values.length - 1)) / values.length;
  return (
    <svg className={styles.spark} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {values.map((value, index) => {
        const barHeight = value > 0 ? Math.max((value / max) * height, 2) : 1;
        const last = index === values.length - 1;
        return (
          <rect
            key={index}
            x={index * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={Math.min(1.5, barWidth / 2)}
            fill={last ? "var(--series)" : "var(--series-quiet)"}
          />
        );
      })}
    </svg>
  );
}

export type Tile = {
  label: string;
  value: string;
  detail?: ReactNode;
  /** Veränderung gegenüber dem Vorzeitraum, mit Richtung und Wertung. */
  delta?: { text: string; tone: "good" | "bad" | "neutral" };
  trend?: readonly number[];
  href?: string;
};

export function StatTiles({ tiles, label }: { tiles: readonly Tile[]; label: string }) {
  return (
    <div className={styles.tiles} role="list" aria-label={label}>
      {tiles.map((tile) => {
        const inner = (
          <>
            <span className={styles.tileLabel}>{tile.label}</span>
            <span className={styles.tileValue}>{tile.value}</span>
            {tile.delta || tile.detail ? (
              <span className={styles.tileDetail}>
                {tile.delta ? (
                  <span className={styles.delta} data-tone={tile.delta.tone}>
                    {tile.delta.text}
                  </span>
                ) : null}
                {tile.delta && tile.detail ? " · " : null}
                {tile.detail}
              </span>
            ) : null}
            {tile.trend ? <Sparkline values={tile.trend} label={`${tile.label}, Verlauf der letzten ${tile.trend.length} Tage`} /> : null}
          </>
        );
        return tile.href ? (
          <Link role="listitem" className={styles.tile} href={tile.href} prefetch={false} key={tile.label}>
            {inner}
          </Link>
        ) : (
          <div role="listitem" className={styles.tile} key={tile.label}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export { styles as cockpitStyles };
