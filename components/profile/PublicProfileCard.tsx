"use client";

import { useState } from "react";

import { appPath } from "@/lib/app-path";
import { placementRequestsEnabled } from "@/lib/placement/config";
import type { ProfilePageAction } from "@/lib/profile/profile-link";

import type { FreelancerProfileResult, ProjectMode } from "../chat-contract";
import { availabilityNotice } from "../chat/availability";
import { profileCheck } from "../chat/verification";
import { PlacementDialog } from "../chat/placement-dialog";
import { initials } from "../chat/shared";
import { IconArrowRight, IconCheck, IconChevronDown, IconInfo } from "../icons";

import styles from "./public-profile.module.css";

/** So viele Kompetenzen zeigt die gekürzte Karte; der Rest steht im Profil. */
const SKILLS_IN_SUMMARY = 6;

const MODE_LABELS: Readonly<Record<ProjectMode, string>> = {
  remote: "Remote",
  "on-site": "Vor Ort",
  hybrid: "Hybrid",
  unknown: "Arbeitsmodus offen",
};

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

function FactList({ label, facts, verified = false }: { label: string; facts: string[]; verified?: boolean }) {
  if (!facts.length) return null;
  return (
    <div className={styles.factGroup} data-verified={verified}>
      <h3>{label}</h3>
      <ul>
        {facts.map((fact) => (
          <li key={fact}>
            {verified ? <span aria-hidden="true"><IconCheck size={12} /></span> : null}
            {fact}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Die Profilkarte für die eigene Profilseite.
 *
 * Aufgebaut wie die Karte im Chat — Kopf, Eckdaten, Kompetenzen, Knopf —,
 * aber gekürzt: Ohne Projekt gibt es keinen Abgleich, also auch keine Zeilen
 * dazu. Der Rest des Profils steht hinter „Vollständiges Profil“ und klappt
 * auf der Seite auf, statt in einen Chat zu führen.
 */
export function PublicProfileCard({
  profile,
  action,
  shareUrl,
  expandedByDefault = false,
}: {
  profile: FreelancerProfileResult;
  action: ProfilePageAction;
  shareUrl: string;
  expandedByDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(expandedByDefault);
  const [requestOpen, setRequestOpen] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const availability = availabilityNotice(profile.availabilityStatus, profile.availabilityUpdatedAt, new Date(), {
    availableFrom: profile.availableFrom ?? null,
    confirmedBy: placementRequestsEnabled() ? "introduction" : "call",
  });
  const skills = [...new Set(profile.skillTags)];
  const shownSkills = skills.slice(0, SKILLS_IN_SUMMARY);
  const hiddenSkills = skills.length - shownSkills.length;
  const verifiedFacts = profile.facts.filter((fact) => fact.verification === "verified").map((fact) => fact.value);
  const selfReportedFacts = profile.facts.filter((fact) => fact.verification === "self-reported").map((fact) => fact.value);
  const check = profileCheck(profile.referenceStatus);
  const keyFacts = [
    profile.rate ?? "Honorar auf Anfrage",
    MODE_LABELS[profile.remoteMode],
    profile.location,
    profile.languages.length ? profile.languages.join(", ") : null,
  ].filter((value): value is string => Boolean(value));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  return (
    <article className={styles.card} aria-labelledby="profile-name">
      <header className={styles.head}>
        <div
          className={styles.avatar}
          style={profile.avatarUrl ? { backgroundImage: `url(${JSON.stringify(profile.avatarUrl)})` } : undefined}
          aria-hidden="true"
        >
          {profile.avatarUrl ? null : initials(profile.displayName)}
        </div>
        <div className={styles.identity}>
          <h1 id="profile-name">{profile.displayName}</h1>
          <p>{profile.role}</p>
        </div>
        <div className={styles.badges}>
          <span className={styles.availability} data-tone={availability.tone} title={availability.title ?? undefined}>
            {availability.label}
          </span>
          {check?.verified ? (
            <span className={styles.verified}><IconCheck size={12} /> Profil geprüft</span>
          ) : null}
        </div>
      </header>

      <p className={styles.keyFacts}>
        {keyFacts.map((fact, index) => (
          <span key={fact} className={index === 0 ? styles.rate : undefined}>{fact}</span>
        ))}
      </p>

      {profile.experienceSummary ? (
        <p className={styles.summary} data-expanded={expanded}>{profile.experienceSummary}</p>
      ) : null}

      {shownSkills.length ? (
        <ul className={styles.skills} aria-label="Kompetenzen">
          {(expanded ? skills : shownSkills).map((skill) => <li key={skill}>{skill}</li>)}
          {!expanded && hiddenSkills > 0 ? (
            <li className={styles.more}>+{hiddenSkills} weitere</li>
          ) : null}
        </ul>
      ) : null}

      {availability.openPoint ? (
        <p className={styles.openPoint}><span aria-hidden="true"><IconInfo size={13} /></span>{availability.openPoint}</p>
      ) : null}

      {expanded ? (
        <div className={styles.details} role="region" aria-label="Vollständiges Profil">
          <div className={styles.facts}>
            <FactList label="Von XPORTAL geprüft" facts={verifiedFacts} verified />
            <FactList label="Vom Freelancer angegeben" facts={selfReportedFacts} />
          </div>
          <dl className={styles.grid}>
            <div><dt>Arbeitsmodus</dt><dd>{MODE_LABELS[profile.remoteMode]}</dd></div>
            <div><dt>Ort</dt><dd>{profile.location ?? "nicht angegeben"}</dd></div>
            <div><dt>Sprachen</dt><dd>{profile.languages.length ? profile.languages.join(", ") : "nicht angegeben"}</dd></div>
            <div><dt>Honorar</dt><dd>{profile.rate ?? "auf Anfrage"}</dd></div>
            <div>
              <dt>Verfügbarkeit angegeben</dt>
              <dd>{profile.availabilityUpdatedAt ? dateFormat.format(new Date(profile.availabilityUpdatedAt)) : "nicht angegeben"}</dd>
            </div>
            <div><dt>Profilprüfung</dt><dd>{check?.text ?? "nicht angegeben"}</dd></div>
          </dl>
          <p className={styles.note}>
            Den Lebenslauf sehen Sie mit einem Konto in dem Projekt, in dem XPORTAL Ihnen das Profil vorgeschlagen hat.
          </p>
        </div>
      ) : null}

      <footer className={styles.footer}>
        <div className={styles.actions}>
          {action.kind === "booking" || action.kind === "link" ? (
            <a
              className={styles.primary}
              href={appPath(action.href)}
              {...(action.kind === "booking" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {action.label} <IconArrowRight size={13} />
            </a>
          ) : action.kind === "request" ? (
            <button type="button" className={styles.primary} onClick={() => setRequestOpen(true)}>
              {action.label} <IconArrowRight size={13} />
            </button>
          ) : (
            <button type="button" className={styles.primary} disabled>{action.label}</button>
          )}
          <button type="button" className={styles.secondary} onClick={() => void copyLink()}>
            {copy === "copied" ? <><IconCheck size={13} /> Link kopiert</> : "Link kopieren"}
          </button>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <span aria-hidden="true" data-expanded={expanded}><IconChevronDown size={14} /></span>
            {expanded ? "Profil einklappen" : "Vollständiges Profil"}
          </button>
        </div>
        <p className={styles.hint}>{action.hint}</p>
        {copy === "failed" ? (
          <p className={styles.hint}>Kopieren ging nicht. Der Link: <span className={styles.url}>{shareUrl}</span></p>
        ) : null}
      </footer>

      {requestOpen && action.kind === "request" ? (
        <PlacementDialog
          profile={profile}
          projectId={action.projectId}
          introductionsPath={appPath("/api/introductions")}
          onClose={() => setRequestOpen(false)}
        />
      ) : null}
    </article>
  );
}
