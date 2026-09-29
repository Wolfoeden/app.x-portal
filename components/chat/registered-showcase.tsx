"use client";

import { useEffect, useState } from "react";

import { appPath } from "@/lib/app-path";
import type { RegisteredShowcase } from "@/lib/freelancer/showcase";
import { profilePath } from "@/lib/profile/profile-link";
import { initials } from "./shared";

let pending: Promise<RegisteredShowcase | null> | null = null;

/**
 * Einmal je Seitenaufruf geladen und geteilt: Der Shortcut stößt das Laden
 * schon beim Überfahren an, damit die Liste beim Klick meist schon da ist.
 * Ein Fehlschlag wird nicht gemerkt, der nächste Klick versucht es erneut.
 */
export function loadRegisteredShowcase(): Promise<RegisteredShowcase | null> {
  pending ??= fetch(appPath("/api/showcase/automation"), { credentials: "same-origin" })
    .then((response) => (response.ok ? (response.json() as Promise<RegisteredShowcase>) : null))
    .catch(() => null)
    .then((showcase) => {
      if (!showcase) pending = null;
      return showcase;
    });
  return pending;
}

function avatarStyle(avatarUrl: string | null) {
  return avatarUrl ? { backgroundImage: `url(${JSON.stringify(avatarUrl)})` } : undefined;
}

export function showcaseHeading(total: number): string {
  return total === 1
    ? "1 selbst angemeldetes Profil für KI-Agenten & Automatisierung"
    : `${total.toLocaleString("de-DE")} selbst angemeldete Profile für KI-Agenten & Automatisierung`;
}

/**
 * Wer sich für KI & Automatisierung selbst angemeldet hat — gezeigt unter dem
 * Beispiel-Brief des Shortcuts.
 *
 * Bewusst ohne Zusage: keine Verfügbarkeit, kein „passt“. Die Liste sagt nur,
 * dass es diese Menschen im Verzeichnis gibt. Ist niemand da oder scheitert
 * das Laden, erscheint nichts.
 */
export function RegisteredShowcasePanel({ initial }: { initial?: RegisteredShowcase }) {
  const [showcase, setShowcase] = useState<RegisteredShowcase | null>(initial ?? null);

  useEffect(() => {
    if (initial) return;
    let active = true;
    void loadRegisteredShowcase().then((loaded) => {
      if (active) setShowcase(loaded);
    });
    return () => {
      active = false;
    };
  }, [initial]);

  if (!showcase || showcase.profiles.length === 0) return null;
  const more = showcase.total - showcase.profiles.length;

  return (
    <section className="registered-showcase" aria-labelledby="registered-showcase-title">
      <p className="registered-showcase-eyebrow">Bereits bei XPORTAL</p>
      <h2 id="registered-showcase-title">{showcaseHeading(showcase.total)}</h2>
      <ul className="registered-showcase-list">
        {showcase.profiles.map((profile) => (
          <li key={profile.id}>
            <a
              href={appPath(profilePath(profile.id, "shortcut"))}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Profil von ${profile.displayName} öffnen: ${profile.role}`}
            >
              <span
                className={profile.avatarUrl ? "profile-avatar has-image" : "profile-avatar"}
                style={avatarStyle(profile.avatarUrl)}
                aria-hidden="true"
              >
                {profile.avatarUrl ? null : initials(profile.displayName)}
              </span>
              <span className="registered-showcase-identity">
                <strong>{profile.displayName}</strong>
                <span>{profile.role}</span>
                {profile.skills.length ? (
                  <span className="registered-showcase-skills">
                    {profile.skills.map((skill) => (
                      <span key={skill}>{skill}</span>
                    ))}
                  </span>
                ) : null}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="registered-showcase-note">
        {more > 0 ? `Dazu ${more.toLocaleString("de-DE")} weitere. ` : null}
        Selbst registriert und von XPORTAL freigegeben. Ob jemand zu Ihrem Projekt passt und
        verfügbar ist, zeigt der Abgleich nach dem Absenden – und klären Sie im Gespräch.
      </p>
    </section>
  );
}
