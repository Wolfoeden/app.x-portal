import { WORK_MODE_LABELS } from "@/lib/freelancer/limits";
import type { DossierLinkKind, DossierProject, ProfileDossier as Dossier } from "@/lib/profile/dossier";
import { monogramTone, PROFILE_FIELD_LABELS } from "@/lib/profile/identity";

import { availabilityNotice } from "../chat/availability";
import { initials } from "../chat/shared";
import { IconArrowUpRight, IconCheck, IconInfo } from "../icons";

/*
 * Die Detailansicht eines Profils: im Seitenpanel des Chats und auf
 * `/profil/<id>`. Ohne Hooks, damit die Profilseite sie auf dem Server
 * rendert. Was der Freelancer nur angibt, bleibt als Angabe erkennbar; der
 * Haken steht nur bei dem, was XPORTAL geprüft hat.
 */

const CONTACT_LABELS: Readonly<Record<Dossier["contact"], string>> = {
  request: "Anfrage über XPORTAL",
  calendar: "Eigener Terminkalender",
  none: "Derzeit kein direkter Weg",
};

const LINK_LABELS: Readonly<Record<DossierLinkKind, string>> = {
  linkedin: "LinkedIn",
  website: "Website",
  github: "GitHub",
  portfolio: "Portfolio",
  freelancermap: "freelancermap",
};

function avatarStyle(avatarUrl: string | null) {
  return avatarUrl ? { backgroundImage: `url(${JSON.stringify(avatarUrl)})` } : undefined;
}

function ProjectEntry({ project }: { project: DossierProject }) {
  const meta = [project.role, project.client ?? project.industry, project.period].filter(Boolean).join(" · ");
  return (
    <li>
      <div className="dossier-project-head">
        <strong>{project.title}</strong>
        {project.verified ? (
          <span className="dossier-badge is-verified"><IconCheck size={11} /> geprüft</span>
        ) : project.source === "research" ? (
          <span className="dossier-badge">aus öffentlicher Quelle</span>
        ) : null}
      </div>
      {meta ? <p className="dossier-muted">{meta}</p> : null}
      {project.outcome ? <p>{project.outcome}</p> : null}
      {project.technologies.length ? (
        <ul className="dossier-chips" aria-label="Technologien">
          {project.technologies.map((technology) => <li key={technology}>{technology}</li>)}
        </ul>
      ) : null}
      {project.link || project.sourceUrl ? (
        <p className="dossier-project-links">
          {project.link ? (
            <a href={project.link} target="_blank" rel="noopener noreferrer nofollow">
              Projekt ansehen <IconArrowUpRight size={12} />
            </a>
          ) : null}
          {project.sourceUrl ? (
            <a href={project.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
              Quelle <IconArrowUpRight size={12} />
            </a>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

export function ProfileDossier({
  dossier,
  now,
  headingLevel = 2,
}: {
  dossier: Dossier;
  now: Date;
  /** 1 auf der eigenen Profilseite, sonst 2. */
  headingLevel?: 1 | 2;
}) {
  const Name = headingLevel === 1 ? "h1" : "h2";
  const availability = availabilityNotice(dossier.availability.status, dossier.availability.updatedAt, now, {
    availableFrom: dossier.availability.availableFrom,
    confirmedBy: dossier.contact === "request" ? "introduction" : "call",
  });
  const meta = [
    dossier.location,
    dossier.workModes.map((mode) => WORK_MODE_LABELS[mode]).join(", "),
    dossier.languages.join(", "),
  ].filter(Boolean);
  const verifiedSkills = dossier.skills.filter((skill) => skill.verified).length;

  return (
    <article className="dossier" aria-labelledby={`dossier-${dossier.id}`}>
      <header className="dossier-hero">
        <div className="pband" data-field={dossier.field ?? "none"}>
          <span className="pband-label">{dossier.field ? PROFILE_FIELD_LABELS[dossier.field] : "Profil"}</span>
          {dossier.verified ? (
            <span className="pband-verified" title={dossier.verificationText}>
              <IconCheck size={11} /> Profil geprüft
            </span>
          ) : null}
        </div>
        <div className="dossier-head">
          <span
            className={dossier.avatarUrl ? "profile-avatar pid has-image" : "profile-avatar pid"}
            data-tone={monogramTone(dossier.displayName)}
            style={avatarStyle(dossier.avatarUrl)}
            aria-hidden="true"
          >
            {dossier.avatarUrl ? null : initials(dossier.displayName)}
          </span>
          <div>
            <Name id={`dossier-${dossier.id}`}>{dossier.displayName}</Name>
            <p>{dossier.role}</p>
            {meta.length ? <p className="dossier-muted">{meta.join(" · ")}</p> : null}
          </div>
        </div>
        <dl className="dossier-keyfacts">
          <div>
            <dt>Honorar</dt>
            <dd>{dossier.rate ?? "auf Anfrage"}</dd>
          </div>
          <div>
            <dt>Verfügbarkeit</dt>
            <dd>
              <span className={`availability ${availability.tone}`} title={availability.title ?? undefined}>
                {availability.label}
              </span>
            </dd>
          </div>
          <div>
            <dt>Kontakt</dt>
            <dd>{CONTACT_LABELS[dossier.contact]}</dd>
          </div>
        </dl>
        {dossier.links.length ? (
          <ul className="dossier-links" aria-label="Online">
            {dossier.links.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer nofollow">
                  {LINK_LABELS[link.kind]} <IconArrowUpRight size={12} />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {dossier.summary ? (
        <div className="dossier-section">
          <h3>Über mich</h3>
          <p>{dossier.summary}</p>
        </div>
      ) : null}

      {dossier.projects.length ? (
        <div className="dossier-section">
          <h3>Projekte</h3>
          <ol className="dossier-timeline">
            {dossier.projects.map((project, index) => <ProjectEntry key={`${project.title}-${index}`} project={project} />)}
          </ol>
        </div>
      ) : null}

      {dossier.referencesSummary ? (
        <div className="dossier-section">
          <h3>Referenzen</h3>
          <p>{dossier.referencesSummary}</p>
          <p className="dossier-muted">Notiz von XPORTAL aus der Sichtung des Profils.</p>
        </div>
      ) : null}

      {dossier.skills.length ? (
        <div className="dossier-section">
          <h3>Kompetenzen</h3>
          <ul className="dossier-chips">
            {dossier.skills.map((skill) => (
              <li key={skill.value} className={skill.verified ? "is-verified" : undefined}>
                {skill.verified ? <IconCheck size={11} /> : null}
                {skill.value}
              </li>
            ))}
          </ul>
          <p className="dossier-muted">
            {verifiedSkills
              ? `Mit Haken: von XPORTAL geprüft (${verifiedSkills}). Ohne Haken: Angabe des Freelancers.`
              : "Angaben des Freelancers; noch keine davon von XPORTAL geprüft."}
          </p>
        </div>
      ) : null}

      {dossier.facts.length ? (
        <div className="dossier-section">
          <h3>Weitere Angaben</h3>
          <dl className="dossier-facts">
            {dossier.facts.map((group) => (
              <div key={group.label}>
                <dt>{group.label}</dt>
                <dd>
                  {group.items.map((item, index) => (
                    <span key={item.value} className={item.verified ? "is-verified" : undefined}>
                      {index ? ", " : null}
                      {item.value}
                      {item.verified ? <small> (geprüft)</small> : null}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <p className="dossier-check">
        <IconInfo size={13} /> {dossier.verificationText}
      </p>
    </article>
  );
}
