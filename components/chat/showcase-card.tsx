import type { ShowcaseContact, ShowcaseProfile } from "@/lib/freelancer/showcase";
import { WORK_MODE_LABELS } from "@/lib/freelancer/limits";
import { availabilityNotice, type AvailabilityNotice } from "./availability";
import { IconArrowRight, IconCheck } from "../icons";
import { initials } from "./shared";
import { FitBar, type FitSegment } from "../profile/FitBar";
import { monogramTone, PROFILE_FIELD_LABELS } from "@/lib/profile/identity";

/*
 * Die Profilkarte für sich, ohne Laden und Panel: Sie steht unter den
 * Shortcuts im Chat und als Vorschau im Bewerbungsformular. Eigenes Modul,
 * damit die Bewerbungsseite nur die Karte mitlädt.
 */

function avatarStyle(avatarUrl: string | null) {
  return avatarUrl ? { backgroundImage: `url(${JSON.stringify(avatarUrl)})` } : undefined;
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

/** „Berlin · Remote, Hybrid“: wo und wie jemand arbeitet, soweit angegeben. */
export function showcaseMeta(profile: Pick<ShowcaseProfile, "location" | "workModes">): string | null {
  const modes = profile.workModes.map((mode) => WORK_MODE_LABELS[mode]).join(", ");
  return [profile.location, modes].filter(Boolean).join(" · ") || null;
}

/** Was die Karte unter dem Namen zeigt: Projekt, Referenzen oder der erste Satz. */
function teaser(profile: ShowcaseProfile): { label: string; text: string } | null {
  if (profile.referencesSummary) return { label: "Referenzen", text: profile.referencesSummary };
  if (profile.summaryExcerpt) return { label: "Über mich", text: profile.summaryExcerpt };
  return null;
}

/**
 * Eine Profilkarte. Mit `href` führt die ganze Karte zum öffentlichen Profil;
 * ohne ist sie eine Vorschau, etwa im Bewerbungsformular — dieselbe Karte,
 * die Kunden später sehen.
 *
 * Oben das Band in der Farbe des Fachgebiets, darüber das Monogramm in der
 * Farbe des Namens (oder das Foto). Dann, was für die Rolle belegt ist, ein
 * Satz aus Referenzen oder Kurzprofil und die Fakten vor dem Gespräch.
 */
export function ShowcaseCard({ profile, now, href }: { profile: ShowcaseProfile; now: Date; href: string | null }) {
  const availability = availabilityNotice(profile.availability.status, profile.availability.updatedAt, now, {
    availableFrom: profile.availability.availableFrom,
    confirmedBy: profile.contact === "request" ? "introduction" : "call",
  });
  const openPoints = showcaseOpenPoints(profile, availability);
  const contact = CONTACT_LABELS[profile.contact];
  const meta = showcaseMeta(profile);
  const intro = teaser(profile);
  const segments: FitSegment[] = profile.evidence.map((entry) => ({
    label: entry.skill,
    state: entry.verified ? "verified" : "stated",
  }));

  const body = (
    <>
      <span className="pband" data-field={profile.field ?? "none"}>
        <span className="pband-label">{profile.field ? PROFILE_FIELD_LABELS[profile.field] : "Profil"}</span>
        {profile.verified ? (
          <span className="pband-verified" title="Profilprüfung durch XPORTAL abgeschlossen">
            <IconCheck size={11} /> Profil geprüft
          </span>
        ) : null}
      </span>
      <span className="showcase-card-head">
        <span
          className={profile.avatarUrl ? "profile-avatar pid has-image" : "profile-avatar pid"}
          data-tone={monogramTone(profile.displayName)}
          style={avatarStyle(profile.avatarUrl)}
          aria-hidden="true"
        >
          {profile.avatarUrl ? null : initials(profile.displayName)}
        </span>
        <span className="showcase-card-identity">
          <strong>{profile.displayName}</strong>
          <span>{profile.role}</span>
          {meta ? <span>{meta}</span> : null}
        </span>
      </span>
      {profile.evidence.length ? (
        <span className="showcase-card-fit">
          <FitBar segments={segments} noun={segments.length === 1 ? "Kompetenz für die Rolle" : "Kompetenzen für die Rolle"} />
          <span className="showcase-card-skills">
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
        </span>
      ) : null}
      {intro ? (
        <span className="showcase-card-teaser">
          <small>{intro.label}</small>
          <span>{intro.text}</span>
        </span>
      ) : null}
      <span className="showcase-card-facts">
        <span className={`availability ${availability.tone}`} title={availability.title ?? undefined}>
          {availability.label}
        </span>
        <span className="showcase-card-rate">{profile.rate ?? "Honorar auf Anfrage"}</span>
      </span>
      {contact ? <span className="showcase-card-contact">{contact}</span> : null}
      {openPoints.length ? (
        <span className="showcase-card-open">Vorher klären: {openPoints.join(" · ")}</span>
      ) : null}
      {href ? (
        <span className="showcase-card-cta">
          Profil ansehen <IconArrowRight size={14} />
          <span className="sr-only"> (öffnet in neuem Tab)</span>
        </span>
      ) : null}
    </>
  );

  return href ? (
    <a className="showcase-card" href={href} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <div className="showcase-card">{body}</div>
  );
}
