import type { ProjectTeaser } from "@/lib/profile/project-limits";
import { IconArrowUpRight } from "@/components/icons";

/**
 * Das Referenzprojekt auf einer Karte: worum es ging, für wen und wann, mit
 * welchen Werkzeugen. Mehr steht im Profil-Panel.
 */
export function ProjectTeaserBlock({ teaser, total, links = true }: { teaser: ProjectTeaser; total: number; links?: boolean }) {
  const label = [teaser.relevant ? "Passend zur Anfrage" : null, total > 1 ? `Referenzprojekt · ${total} insgesamt` : "Referenzprojekt", teaser.verified ? "geprüft" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="showcase-card-teaser is-project">
      <small>{label}</small>
      <strong>{teaser.title}</strong>
      {teaser.meta ? <span>{teaser.meta}</span> : null}
      {teaser.technologies.length ? (
        <span className="project-teaser-tech">
          {teaser.technologies.map((technology) => (
            <i key={technology}>{technology}</i>
          ))}
        </span>
      ) : null}
      {teaser.href && teaser.linkLabel ? (
        <span className="dossier-project-links">
          {links ? (
            <a href={teaser.href} target="_blank" rel="noopener noreferrer nofollow" onClick={(event) => event.stopPropagation()}>
              {teaser.linkLabel} <IconArrowUpRight size={12} />
            </a>
          ) : <span>{teaser.linkLabel} im vollständigen Profil</span>}
        </span>
      ) : null}
    </span>
  );
}
