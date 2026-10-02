"use client";

import { useEffect, useState } from "react";

import { appPath } from "@/lib/app-path";
import type { RegisteredShowcase, ShowcaseTheme } from "@/lib/freelancer/showcase";
import { profilePath } from "@/lib/profile/profile-link";
import { ShowcaseCard } from "./showcase-card";

const pending = new Map<ShowcaseTheme, Promise<RegisteredShowcase | null>>();

/**
 * Einmal je Rolle und Seitenaufruf geladen und geteilt: Der Shortcut stößt
 * das Laden schon beim Überfahren an, damit die Liste beim Klick meist schon
 * da ist. Ein Fehlschlag wird nicht gemerkt, der nächste Klick versucht es
 * erneut.
 */
export function loadRegisteredShowcase(theme: ShowcaseTheme): Promise<RegisteredShowcase | null> {
  const known = pending.get(theme);
  if (known) return known;
  const loading = fetch(appPath(`/api/showcase?theme=${encodeURIComponent(theme)}`), {
    credentials: "same-origin",
  })
    .then((response) => (response.ok ? (response.json() as Promise<RegisteredShowcase>) : null))
    .catch(() => null)
    .then((showcase) => {
      if (!showcase) pending.delete(theme);
      return showcase;
    });
  pending.set(theme, loading);
  return loading;
}

export function showcaseHeading(total: number, label: string): string {
  return total === 1
    ? `1 selbst angemeldetes Profil für ${label}`
    : `${total.toLocaleString("de-DE")} selbst angemeldete Profile für ${label}`;
}

/**
 * Wer sich für die Rolle des Shortcuts selbst angemeldet hat — gezeigt unter
 * dem Anfang der Anfrage.
 *
 * Jede Karte sagt, warum sich ein Gespräch lohnen kann und was davor zu
 * klären ist: belegte Kompetenzen der Rolle, Honorar, Stand der
 * Verfügbarkeit, Kontaktweg und die offenen Punkte. Ohne „passt“ und ohne
 * Prozentzahl: Ob Aufgabe, Muss-Skills, Start und Budget des Projekts
 * passen, kann erst der Abgleich sagen. Ist niemand da oder scheitert das
 * Laden, erscheint nichts.
 */
export function RegisteredShowcasePanel({
  theme,
  initial,
  now,
}: {
  theme: ShowcaseTheme;
  initial?: RegisteredShowcase;
  /** Fester Zeitpunkt für Vorschau und Tests; sonst der Moment der Anzeige. */
  now?: Date;
}) {
  const preset = initial?.theme === theme ? initial : null;
  const [loaded, setLoaded] = useState<RegisteredShowcase | null>(null);
  const [shownAt] = useState(() => now ?? new Date());

  useEffect(() => {
    if (preset) return;
    let active = true;
    void loadRegisteredShowcase(theme).then((showcase) => {
      if (active) setLoaded(showcase);
    });
    return () => {
      active = false;
    };
  }, [preset, theme]);

  const showcase = preset ?? (loaded?.theme === theme ? loaded : null);
  if (!showcase || showcase.profiles.length === 0) return null;
  const more = showcase.total - showcase.profiles.length;

  return (
    <section className="registered-showcase" aria-labelledby="registered-showcase-title">
      <p className="registered-showcase-eyebrow">Bereits bei XPORTAL</p>
      <h2 id="registered-showcase-title">{showcaseHeading(showcase.total, showcase.label)}</h2>
      <ul className="registered-showcase-list">
        {showcase.profiles.map((profile) => (
          <li key={profile.id}>
            <ShowcaseCard profile={profile} now={shownAt} href={appPath(profilePath(profile.id, "shortcut"))} />
          </li>
        ))}
      </ul>
      <p className="registered-showcase-note">
        {more > 0 ? `Dazu ${more.toLocaleString("de-DE")} weitere. ` : null}
        Selbst registriert und von XPORTAL freigegeben; Honorar und Verfügbarkeit sind Angaben der
        Freelancer mit Stand. Ob Aufgabe, Muss-Skills, Start und Budget passen, zeigt der Abgleich
        nach dem Absenden – den Rest klären Sie im Gespräch.
      </p>
    </section>
  );
}
