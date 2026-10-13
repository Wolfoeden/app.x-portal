import { Fragment, type ReactNode } from "react";

import { WORK_MODE_LABELS } from "@/lib/freelancer/limits";
import type { PublicProfileView } from "@/lib/freelancer/public-profile";
import type { DossierProject } from "@/lib/profile/dossier";
import type { ProfilePageAction } from "@/lib/profile/profile-link";

import { availabilityNotice } from "../chat/availability";
import { initials } from "../chat/shared";
import { IconArrowUpRight, IconCheck } from "../icons";

import { ProfileContactCard } from "./ProfileContactCard";
import styles from "./public-profile.module.css";

/*
 * Die Profilseite `/profil/<id>` für Recruiter (Entwurf Oktober 2026): oben in
 * einer Sekunde, wer das ist, was er kann und wie man ihn erreicht; darunter
 * die Schwerpunkte statt einer Wand aus Begriffen, die Zusammenfassung,
 * Projekte und Eckdaten. Rendert auf dem Server; nur der Kontaktkasten läuft
 * im Browser.
 *
 * Kernsatz, deutsche Fassung und Schwerpunkte kommen aus der Aufbereitung
 * (`lib/freelancer/profile-presentation.ts`). Fehlt sie, zeigt die Seite
 * dieselben Abschnitte aus den Rohdaten.
 */

const FALLBACK_SKILLS = 12;

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/u)[0] ?? displayName;
}

function availabilityValue(status: string, availableFrom: string | null): string {
  if (status === "available") {
    if (!availableFrom) return "ab sofort";
    const date = new Date(`${availableFrom}T00:00:00`);
    return Number.isNaN(date.getTime()) || date.getTime() <= Date.now()
      ? "ab sofort"
      : `ab ${new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date)}`;
  }
  if (status === "limited") return "eingeschränkt";
  if (status === "unavailable") return "derzeit nicht";
  return "auf Anfrage";
}

function SkillChip({ value, verified }: { value: string; verified: boolean }) {
  return (
    <li className={verified ? styles.verified : undefined}>
      {verified ? <IconCheck size={11} /> : null}
      {value}
    </li>
  );
}

function ProjectCard({ project }: { project: DossierProject }) {
  const meta = [project.client ?? project.industry, project.period].filter(Boolean).join(" · ");
  return (
    <article className={styles.project}>
      {meta ? <p className={styles.muted}>{meta}</p> : null}
      <h3>
        {project.title}
        {project.verified ? <span className={styles.badge}><IconCheck size={11} /> geprüft</span> : null}
      </h3>
      {project.role ? <p className={styles.muted}>{project.role}</p> : null}
      {project.outcome ? <p>{project.outcome}</p> : null}
      {project.technologies.length ? (
        <ul className={styles.chips} aria-label="Technologien">
          {project.technologies.map((technology) => <li key={technology}>{technology}</li>)}
        </ul>
      ) : null}
      {project.link ? (
        <a className={styles.textLink} href={project.link} target="_blank" rel="noopener noreferrer nofollow">
          Projekt ansehen <IconArrowUpRight size={12} />
        </a>
      ) : null}
    </article>
  );
}

function DocumentRow({ href, icon, title, detail }: { href: string; icon: ReactNode; title: string; detail: string }) {
  return (
    <a className={styles.docRow} href={href}>
      <span className={styles.docIcon} aria-hidden="true">{icon}</span>
      <span className={styles.docText}><strong>{title}</strong><span>{detail}</span></span>
      <span className={styles.docAction}>Öffnen</span>
    </a>
  );
}

export function PublicProfilePage({
  view,
  action,
  bookingHref,
  shareUrl,
  now,
}: {
  view: PublicProfileView;
  action: ProfilePageAction;
  bookingHref: string | null;
  shareUrl: string;
  now: Date;
}) {
  const { dossier, profile } = view;
  const presentation = view.presentation?.presentation ?? null;
  const name = firstName(dossier.displayName);
  const workModes = dossier.workModes.map((mode) => WORK_MODE_LABELS[mode]).join(", ");
  const meta = [dossier.location, workModes, dossier.languages.join(", ")].filter(Boolean).join(" · ");
  const availability = availabilityNotice(dossier.availability.status, dossier.availability.updatedAt, now, {
    availableFrom: dossier.availability.availableFrom,
    confirmedBy: dossier.contact === "request" ? "introduction" : "call",
  });

  const group = (label: string) => dossier.facts.find((entry) => entry.label === label)?.items ?? [];
  const qualifications = group("Qualifikationen");
  const industries = presentation?.industries.length ? presentation.industries : group("Branchen").map((item) => item.value);
  const education = presentation?.educationShort ?? qualifications[0]?.value ?? null;
  const otherFacts = dossier.facts.filter((entry) => !["Branchen", "Qualifikationen"].includes(entry.label));

  const verified = new Map(dossier.skills.map((skill) => [skill.value.toLocaleLowerCase("de-DE"), skill.verified]));
  const focusAreas = presentation?.focusAreas.length
    ? presentation.focusAreas
    : dossier.skills.length
      ? [{ title: "Kompetenzen", skills: dossier.skills.slice(0, FALLBACK_SKILLS).map((skill) => skill.value) }]
      : [];
  const shownSkills = new Set(focusAreas.flatMap((area) => area.skills.map((skill) => skill.toLocaleLowerCase("de-DE"))));
  const hiddenSkills = dossier.skills.length - shownSkills.size;
  const anyVerified = dossier.skills.some((skill) => skill.verified);

  const summary = presentation?.summaryDe ?? dossier.summary;
  const translated = Boolean(presentation?.summaryDe && dossier.summary);
  const documents = view.documents ?? { cv: false, links: { linkedin: false, github: false } };
  const workspaceHref = `/chat?profil=${encodeURIComponent(dossier.id)}`;
  const linkHref = (kind: "linkedin" | "github") => `/api/freelancers/${encodeURIComponent(dossier.id)}/link?kind=${kind}`;

  const tiles = [
    { label: "Honorar", value: dossier.rate ?? "auf Anfrage" },
    { label: "Verfügbar", value: availabilityValue(dossier.availability.status, dossier.availability.availableFrom), tone: dossier.availability.status === "available" ? styles.positive : undefined },
    ...(workModes ? [{ label: "Einsatz", value: workModes }] : []),
    education ? { label: "Ausbildung", value: education } : { label: "Sprachen", value: dossier.languages.join(", ") || "–" },
  ];

  const hasDocuments = documents.cv || documents.links.linkedin || documents.links.github;

  return (
    <>
      <section className={styles.hero} aria-labelledby="profil-name">
        <div className={`${styles.wrap} ${styles.heroGrid}`}>
          <div className={styles.heroMain}>
            <div className={styles.badges}>
              <span className={`${styles.pill} ${styles[`tone_${availability.tone}`] ?? ""}`} title={availability.title ?? undefined}>
                <span aria-hidden="true" className={styles.dot} />
                {availability.label}
              </span>
              <span className={styles.pill}>Von XPORTAL freigegeben</span>
            </div>
            <div className={styles.identity}>
              <span
                className={styles.avatar}
                style={dossier.avatarUrl ? { backgroundImage: `url(${JSON.stringify(dossier.avatarUrl)})` } : undefined}
                aria-hidden="true"
              >
                {dossier.avatarUrl ? null : initials(dossier.displayName)}
              </span>
              <div>
                <h1 id="profil-name">{dossier.displayName}</h1>
                <p className={styles.role}>{dossier.role}</p>
                {meta ? <p className={styles.meta}>{meta}</p> : null}
              </div>
            </div>
            {presentation?.headline ? <p className={styles.headline}>{presentation.headline}</p> : null}
            <dl className={styles.tiles}>
              {tiles.map((tile) => (
                <div key={tile.label}>
                  <dt>{tile.label}</dt>
                  <dd className={"tone" in tile ? tile.tone : undefined}>{tile.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <ProfileContactCard
            firstName={name}
            profile={profile}
            action={action}
            bookingHref={bookingHref}
            shareUrl={shareUrl}
            cvHref={documents.cv ? workspaceHref : null}
          >
            {hasDocuments ? (
              <div className={styles.docs}>
                <p className={styles.docsTitle}>Unterlagen und Profile</p>
                {documents.cv ? (
                  <DocumentRow
                    href={workspaceHref}
                    title="Lebenslauf (PDF)"
                    detail="im Arbeitsbereich"
                    icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M4 1.5h5.5L12.5 4.5v10H4z" /><path d="M9.5 1.5v3h3" strokeLinecap="round" /></svg>}
                  />
                ) : null}
                {documents.links.linkedin ? (
                  <DocumentRow href={linkHref("linkedin")} title="LinkedIn" detail="Profil auf LinkedIn" icon={<span className={styles.linkedin}>in</span>} />
                ) : null}
                {documents.links.github ? (
                  <DocumentRow
                    href={linkHref("github")}
                    title="GitHub"
                    detail="öffentliche Projekte"
                    icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3" /></svg>}
                  />
                ) : null}
              </div>
            ) : null}
          </ProfileContactCard>
        </div>
      </section>

      {focusAreas.length ? (
        <section className={`${styles.wrap} ${styles.section}`} aria-labelledby="schwerpunkte">
          <div className={styles.sectionHead}>
            <h2 id="schwerpunkte">Das kann {name}</h2>
            {presentation?.focusAreas.length ? (
              <span className={styles.muted}>{dossier.skills.length} Angaben in {focusAreas.length} Schwerpunkten</span>
            ) : null}
          </div>
          <div className={styles.focusGrid}>
            {focusAreas.map((area) => (
              <article key={area.title} className={styles.focus}>
                <h3>{area.title}</h3>
                <ul className={styles.chips}>
                  {area.skills.map((skill) => (
                    <SkillChip key={skill} value={skill} verified={verified.get(skill.toLocaleLowerCase("de-DE")) ?? false} />
                  ))}
                </ul>
              </article>
            ))}
          </div>
          {hiddenSkills > 0 ? (
            <details className={styles.more}>
              <summary>Alle {dossier.skills.length} Kompetenzen anzeigen</summary>
              <ul className={styles.chips}>
                {dossier.skills.map((skill) => <SkillChip key={skill.value} value={skill.value} verified={skill.verified} />)}
              </ul>
            </details>
          ) : null}
          {anyVerified ? <p className={styles.small}>Mit Haken: von XPORTAL geprüft. Ohne Haken: Angabe des Freelancers.</p> : null}
        </section>
      ) : null}

      <section className={`${styles.wrap} ${styles.section} ${styles.detailGrid}`}>
        <div className={styles.detailMain}>
          {summary ? (
            <div className={styles.about}>
              <h2>Über {name}</h2>
              <p>{summary}</p>
              {translated ? (
                <details className={styles.original}>
                  <summary>Originaltext anzeigen</summary>
                  <p>{dossier.summary}</p>
                </details>
              ) : null}
            </div>
          ) : null}
          {dossier.referencesSummary ? (
            <div className={styles.about}>
              <h2>Referenzen</h2>
              <p>{dossier.referencesSummary}</p>
              <p className={styles.small}>Notiz von XPORTAL aus der Sichtung des Profils.</p>
            </div>
          ) : null}
          {dossier.projects.length ? (
            <div className={styles.about}>
              <h2>Referenzprojekte</h2>
              <div className={styles.projects}>
                {dossier.projects.map((project, index) => <ProjectCard key={`${project.title}-${index}`} project={project} />)}
              </div>
            </div>
          ) : null}
        </div>

        <aside className={styles.detailAside} aria-label="Eckdaten">
          <div className={styles.box}>
            <h2>Eckdaten</h2>
            <dl className={styles.facts}>
              {dossier.location ? <><dt>Standort</dt><dd>{dossier.location}</dd></> : null}
              {dossier.languages.length ? <><dt>Sprachen</dt><dd>{dossier.languages.join(", ")}</dd></> : null}
              {industries.length ? <><dt>Branchen</dt><dd>{industries.join(", ")}</dd></> : null}
              {qualifications.length ? <><dt>Ausbildung</dt><dd>{qualifications.map((item) => item.value).join("; ")}</dd></> : null}
              {otherFacts.map((entry) => (
                <Fragment key={entry.label}>
                  <dt>{entry.label}</dt>
                  <dd>{entry.items.map((item) => item.value).join(", ")}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
          <div className={`${styles.box} ${styles.boxSoft}`}>
            <p className={styles.boxTitle}>So entsteht dieses Profil</p>
            <p className={styles.small}>XPORTAL hat das Profil vor der Freigabe gesichtet. {dossier.verificationText}.</p>
            {translated ? <p className={styles.small}>Die Zusammenfassung ist automatisch übersetzt.</p> : null}
          </div>
        </aside>
      </section>

      <section className={styles.check} aria-labelledby="profil-pruefen">
        <div className={`${styles.wrap} ${styles.checkGrid}`}>
          <div>
            <h2 id="profil-pruefen">Passt {name} zu Ihrem Projekt?</h2>
            <p>Ein Satz genügt. XPORTAL prüft jede Anforderung gegen dieses Profil und zeigt, was belegt ist und was offen bleibt.</p>
          </div>
          <form className={styles.checkForm} action="/chat" method="get">
            <label htmlFor="profil-projekt" className={styles.srOnly}>Projekt in einem Satz</label>
            <input id="profil-projekt" name="q" type="text" required maxLength={2000} placeholder="Ihr Projekt in einem Satz" />
            <input type="hidden" name="profil" value={dossier.id} />
            <button type="submit">Gegen Profil prüfen</button>
          </form>
        </div>
      </section>
    </>
  );
}
