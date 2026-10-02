"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import styles from "./cockpit.module.css";

/**
 * Hält eine Admin-Seite aktuell, ohne sie neu zu laden.
 *
 * `router.refresh()` rechnet die Server-Komponenten neu und tauscht nur, was
 * sich geändert hat; Eingaben, offene Bereiche und die Scrollposition
 * bleiben. Solange der Tab verborgen ist, ruht die Abfrage — niemand liest
 * mit, und die Datenbank muss nicht für ein Hintergrundfenster arbeiten.
 * Während neu geladen wird, bleibt der alte Stand sichtbar.
 */
export function LiveRefresh({
  intervalSeconds = 30,
  renderedAt,
}: {
  intervalSeconds?: number;
  /** Wann der Server den angezeigten Stand berechnet hat (ISO). */
  renderedAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    timer.current = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, intervalSeconds * 1000);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [intervalSeconds, paused, router, visible]);

  const state = paused ? "paused" : "live";
  const time = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(renderedAt));

  return (
    <span className={styles.toolbar}>
      <span className={styles.live} data-state={state} aria-live="polite">
        <span className={styles.liveDot} aria-hidden="true" />
        {paused ? "Pausiert" : pending ? "Aktualisiert …" : "Live"} · Stand {time}
      </span>
      <button
        type="button"
        className={styles.button}
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
      >
        Jetzt aktualisieren
      </button>
      <button type="button" className={styles.button} onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
        {paused ? "Live fortsetzen" : "Live pausieren"}
      </button>
    </span>
  );
}

export type ColumnPoint = { label: string; value: number; title: string };

/**
 * Tageswerte als Säulen, mit einem Wert je Säule beim Überfahren oder Fokus.
 * Eine Reihe, eine Farbe; die Achse beschriftet Anfang, Mitte und Ende, der
 * höchste Wert steht an seiner Säule, der Rest im Hinweis und in der Tabelle
 * daneben.
 */
export function DailyColumns({
  points,
  label,
  unit,
}: {
  points: readonly ColumnPoint[];
  label: string;
  unit: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  // In echten Pixeln zeichnen: Ein gestrecktes SVG verzerrt die Beschriftung.
  const frame = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(Math.round(entry.contentRect.width), 200));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = 200;
  const top = 18;
  const bottom = 22;
  const plot = height - top - bottom;
  const max = Math.max(...points.map((point) => point.value), 1);
  const slot = width / Math.max(points.length, 1);
  const barWidth = Math.min(24, slot - 4);
  const peak = points.reduce((best, point, index) => (point.value > (points[best]?.value ?? -1) ? index : best), 0);
  const ticks = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, index) => index);
  const hovered = active === null ? null : points[active];

  return (
    <div className={styles.chart} ref={frame}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
        <line className={styles.chartGrid} x1={0} x2={width} y1={top + plot} y2={top + plot} />
        <line className={styles.chartGrid} x1={0} x2={width} y1={top} y2={top} />
        {points.map((point, index) => {
          const barHeight = point.value > 0 ? Math.max((point.value / max) * plot, 3) : 0;
          const x = index * slot + (slot - barWidth) / 2;
          const y = top + plot - barHeight;
          return (
            <g key={`${point.label}-${index}`}>
              {barHeight > 0 ? (
                <path
                  className={styles.chartBar}
                  data-active={active === index}
                  d={`M${x},${top + plot} V${y + 3} Q${x},${y} ${x + 3},${y} H${x + barWidth - 3} Q${x + barWidth},${y} ${x + barWidth},${y + 3} V${top + plot} Z`}
                />
              ) : null}
              {index === peak && point.value > 0 ? (
                <text className={styles.chartAxis} x={x + barWidth / 2} y={y - 5} textAnchor="middle">
                  {point.value.toLocaleString("de-DE")}
                </text>
              ) : null}
              <rect
                className={styles.chartHit}
                x={index * slot}
                y={0}
                width={slot}
                height={height}
                tabIndex={0}
                aria-label={`${point.title}: ${point.value.toLocaleString("de-DE")} ${unit}`}
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
              />
            </g>
          );
        })}
        {ticks.map((index) => (
          <text
            key={`tick-${index}`}
            className={styles.chartAxis}
            x={index * slot + slot / 2}
            y={height - 6}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
          >
            {points[index]?.label}
          </text>
        ))}
      </svg>
      {hovered && active !== null ? (
        <div
          className={styles.tooltip}
          style={{ left: `${((active + 0.5) / points.length) * 100}%`, top: 8 }}
          role="status"
        >
          <strong>{hovered.value.toLocaleString("de-DE")}</strong>
          <span>
            {unit} · {hovered.title}
          </span>
        </div>
      ) : null}
    </div>
  );
}
