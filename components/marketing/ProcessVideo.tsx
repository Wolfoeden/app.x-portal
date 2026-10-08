"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { appPath } from "@/lib/app-path";

import styles from "./landing.module.css";

export type ProcessStep = {
  title: string;
  text: string;
  icon: ReactNode;
  /** Sekunde im Video, ab der dieser Schritt gezeigt wird. */
  startsAt: number;
};

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const subscribeToReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
const readReducedMotionOnServer = () => false;

/** Welcher Schritt zu einer Stelle im Video gehört. */
export function stepAt(steps: readonly Pick<ProcessStep, "startsAt">[], seconds: number): number {
  let index = 0;
  steps.forEach((step, candidate) => {
    if (seconds >= step.startsAt) index = candidate;
  });
  return index;
}

/**
 * Der Ablauf als kurzes Video, daneben die drei Schritte als Kapitel.
 *
 * Das Video zeigt links selbst die Schrittliste. Auf der Seite übernimmt diese
 * Rolle echter Text — lesbar auf jedem Bildschirm, anklickbar, für
 * Screenreader —, und das Video wird auf seinen animierten Teil
 * zugeschnitten (landing.module.css, `.processVideo video`). So stehen die
 * Schritte nicht doppelt da, und auf dem Handy wird die Animation größer.
 *
 * Das Video lädt erst, wenn der Abschnitt ins Bild kommt, und hält an, sobald
 * er es verlässt — auf dem Handy soll es weder Datenvolumen noch Akku kosten,
 * solange niemand hinsieht. Der gerade gezeigte Schritt ist unten markiert;
 * ein Klick auf einen Schritt springt an seine Stelle.
 *
 * Wer reduzierte Bewegung eingestellt hat, bekommt kein automatisch laufendes
 * Video, sondern das Standbild mit Steuerung zum selbst Abspielen. Die
 * Schritte stehen als Text darunter, das Video ist Illustration, nicht Inhalt.
 */
export function ProcessVideo({ steps }: { steps: readonly ProcessStep[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    readReducedMotion,
    readReducedMotionOnServer,
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let frame = 0;
    // Der Balken läuft jedes Bild mit; er wird direkt als CSS-Variable gesetzt,
    // statt die Liste sechzigmal in der Sekunde neu zu rendern.
    const update = () => {
      const index = stepAt(steps, video.currentTime);
      const start = steps[index]?.startsAt ?? 0;
      const end = steps[index + 1]?.startsAt ?? (Number.isFinite(video.duration) ? video.duration : start + 1);
      const progress = Math.min(1, Math.max(0, (video.currentTime - start) / Math.max(0.1, end - start)));
      listRef.current?.style.setProperty("--step-progress", progress.toFixed(3));
      setActive(index);
    };
    const loop = () => {
      update();
      frame = window.requestAnimationFrame(loop);
    };
    const onPlay = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(loop);
    };
    const onPause = () => {
      window.cancelAnimationFrame(frame);
      update();
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", update);
    return () => {
      window.cancelAnimationFrame(frame);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", update);
    };
  }, [steps]);

  const jumpTo = (index: number) => {
    const video = videoRef.current;
    const step = steps[index];
    if (!video || !step) return;
    video.currentTime = step.startsAt;
    listRef.current?.style.setProperty("--step-progress", "0");
    setActive(index);
    if (!reducedMotion) void video.play().catch(() => undefined);
  };

  return (
    <div className={styles.processLayout}>
      <figure className={styles.processVideo}>
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          controls={reducedMotion}
          poster={appPath("/images/landing/ablauf-poster.webp")}
          width={1920}
          height={1280}
          aria-label="Kurzvideo: Eine Ausschreibung wird kopiert, bei XPORTAL eingefügt, ein passendes Profil geprüft und der Kontakt angefragt."
        >
          <source src={appPath("/videos/ablauf.webm")} type="video/webm" />
          <source src={appPath("/videos/ablauf.mp4")} type="video/mp4" />
        </video>
        <figcaption className="sr-only">Produktablauf in XPORTAL.</figcaption>
      </figure>
      <ol ref={listRef} className={`${styles.steps} ${styles.videoSteps}`}>
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={index === active ? styles.stepActive : index < active ? styles.stepDone : undefined}
            aria-current={index === active ? "step" : undefined}
          >
            <button type="button" className={styles.stepButton} onClick={() => jumpTo(index)}>
              <span className={styles.stepProgress} aria-hidden="true"><span /></span>
              <span className={styles.stepTop}>
                {step.icon}
                <span>{String(index + 1).padStart(2, "0")}</span>
              </span>
              <strong className={styles.stepTitle}>{step.title}</strong>
              <span className={styles.stepText}>{step.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
