"use client";

import { useEffect, useState } from "react";

import { appPath } from "@/lib/app-path";
import type {
  RegisteredShowcase,
  ShowcaseContact,
  ShowcaseProfile,
  ShowcaseTheme,
} from "@/lib/freelancer/showcase";
import { profilePath } from "@/lib/profile/profile-link";
import { availabilityNotice, type AvailabilityNotice } from "./availability";
import { IconCheck } from "../icons";
import { initials } from "./shared";

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

function avatarStyle(avatarUrl: string | null) {
  return avatarUrl ? { backgroundImage: `url(${JSON.stringify(avatarUrl)})` } : undefined;
}

export function showcaseHeading(total: number, label: string): string {
  return total === 1
    ? `1 selbst angemeldetes Profil für ${label}`
    : `${total.toLocaleString("de-DE")} selbst angemeldete Profile für ${label}`;
}

const CONTACT_LABELS: Readonly<Record<ShowcaseContact, string | null>> = {
  request: "Kontakt: Anfrage über XPORTAL",
  calendar: "Kontakt: eigener Terminkalender",
  none: null,
};

/**
 * Was vor einem Gespräch offen ist, aus dem, was die Karte zeigt — oder eben
 * nicht zeigen kann. Die Anforderungen eines Projekts kennt die Liste noch
 * nicht; die prüft der Abgleich.
 */
export function showcaseOpenPoints(
  profile: Pick<ShowcaseProfile, "rate" | "contact">,
  availability: AvailabilityNotice,
): string[] {
  const points: string[] = [];
  if (!profile.rate) points.push("Honorar nicht angegeben");
  if (availability.tone === "unknown") points.push("Verfügbarkeit offen");
  else if (!availability.statedOn) points.push("Verfügbarkeit ohne Datum");
  else if (availability.stale) points.push(`Verfügbarkeit zuletzt am ${availability.statedOn} angegeben`);
  if (profile.contact === "none") points.push("Derzeit kein direkter Kontaktweg");
  return points;
}

function ShowcaseCard({ profile, now }: { profile: ShowcaseProfile; now: Date }) {
  const availability = availabilityNotice(profile.availability.status, profile.availability.updatedAt, now, {
    availableFrom: profile.availability.availableFrom,
    confirmedBy: profile.contact === "request" ? "introduction" : "call",
  });
  const openPoints = showcaseOpenPoints(profile, availability);
  const contact = CONTACT_LABELS[profile.contact];

  return (
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
        {profile.evidence.length ? (
          <span className="registered-showcase-skills">
            <span className="sr-only">Im Profil belegt: </span>
            {profile.evidence.map((entry) => (
              <span
                key={entry.skill}
                className={entry.required ? "is-required" : undefined}
                title={entry.verified ? "Von XPORTAL geprüft" : "Vom Freelancer angegeben"}
              >
                {entry.required ? <IconCheck size={11} /> : null}
                {entry.skill}
                {entry.verified ? <small> · geprüft</small> : null}
              </span>
            ))}
          </span>
        ) : null}
        <span className="registered-showcase-facts">
          {profile.rate ? <span className="registered-showcase-rate">{profile.rate}</span> : null}
          <span
            className={`registered-showcase-availability is-${availability.tone}`}
            title={availability.title ?? undefined}
          >
            {availability.label}
          </span>
          {contact ? <span>{contact}</span> : null}
        </span>
        {openPoints.length ? (
          <span className="registered-showcase-open">Vorher klären: {openPoints.join(" · ")}</span>
        ) : null}
      </span>
    </a>
  );
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
            <ShowcaseCard profile={profile} now={shownAt} />
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
