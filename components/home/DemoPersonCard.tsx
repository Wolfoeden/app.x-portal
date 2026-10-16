import Image from "next/image";

import type { DemoPerson } from "@/lib/marketing/live-demo";

import { CheckIcon } from "./icons";
import styles from "./home.module.css";

/**
 * Ein Treffer in der Live-Demo: gezeichnetes Bild, gekürzter Name, Rolle,
 * Tagessatz, Verfügbarkeit, welche Anforderungen passen und warum.
 * `compact` lässt das „Warum“ weg (kleines Fenster auf der Praxisseite).
 */
export function DemoPersonCard({ person, compact = false }: { person: DemoPerson; compact?: boolean }) {
  return (
    <article className={styles.person}>
      <div className={styles.personHead}>
        <Image src={person.avatar} alt="" width={48} height={48} className={styles.avatar} unoptimized />
        <div className={styles.personName}>
          <p>
            <strong>{person.name}</strong>
            {person.verified ? (
              <span className={styles.verified}><CheckIcon size={12} />geprüft</span>
            ) : (
              <span className={styles.unverified}>Angaben laut Profil</span>
            )}
          </p>
          <p className={styles.personMeta}>{person.role} · {person.where}</p>
        </div>
        <div className={styles.personRate}>
          <p><strong>{person.rate}</strong></p>
          <p className={styles.availability} data-available={person.available ? "true" : undefined}>
            <span aria-hidden="true" />
            {person.availability}
          </p>
        </div>
      </div>
      <ul className={styles.hits} aria-label="Anforderungen">
        {person.hits.map((hit) => (
          <li key={hit.label} data-state={hit.state}>
            {hit.state === "ok" ? <CheckIcon size={12} /> : null}
            {hit.label}
          </li>
        ))}
      </ul>
      {compact ? null : <p className={styles.why}><strong>Warum:</strong> {person.why}</p>}
    </article>
  );
}
