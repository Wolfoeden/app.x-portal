import type { ProjectTeaser } from "@/lib/profile/project-limits";

/**
 * Das Referenzprojekt auf einer Karte: worum es ging, für wen und wann, mit
 * welchen Werkzeugen. Mehr steht im Profil-Panel.
 */
export function ProjectTeaserBlock({ teaser, total }: { teaser: ProjectTeaser; total: number }) {
  const label = [total > 1 ? `Referenzprojekt · ${total} insgesamt` : "Referenzprojekt", teaser.verified ? "geprüft" : null]
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
    </span>
  );
}
