import type { CaseStudy } from "@/lib/marketing/case-studies";

import styles from "./case-studies.module.css";

/**
 * Echte Abgleiche statt Kundenlogos: Anforderung, Profilbeleg, offener Punkt
 * und was daraus wurde — dieselben vier Schritte wie in der Produktansicht
 * im Kopf der Seite. Ohne freigegebene Fälle erscheint der Abschnitt nicht.
 */
export function CaseStudies({ cases }: { cases: readonly CaseStudy[] }) {
  if (!cases.length) return null;
  return (
    <section className={styles.section} id="fallbeispiele" aria-labelledby="fallbeispiele-title">
      <div className={styles.frame}>
        <p className={styles.eyebrow}>Echte Abgleiche</p>
        <h2 id="fallbeispiele-title">Ausschreibungen von Personaldienstleistern, nachvollziehbar abgeglichen.</h2>
        <p className={styles.lead}>
          Öffentliche Ausschreibungen und freigegebene Profile, so wie XPORTAL sie abgeglichen hat: was belegt ist und
          was vor einer Vorstellung offen blieb.
        </p>
        <ol className={styles.cases}>
          {cases.map((entry) => (
            <li key={entry.id}>
              <article className={styles.case} aria-labelledby={`fall-${entry.id}`}>
                <header>
                  <p className={styles.meta}>{entry.month} · {entry.source}</p>
                  <h3 id={`fall-${entry.id}`}>{entry.title}</h3>
                  <p className={styles.conditions}>{entry.conditions}</p>
                </header>
                <div className={styles.columns}>
                  <div>
                    <h4>Anforderung</h4>
                    <ul>{entry.required.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                  <div>
                    <h4>Profilbeleg</h4>
                    <p className={styles.role}><strong>{entry.profile.role}</strong><span>{entry.profile.check}</span></p>
                    <ul className={styles.evidence}>
                      {entry.evidence.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h4>Offener Punkt</h4>
                    <ul className={styles.open}>
                      {entry.open.map((item) => <li key={item}><span aria-hidden="true">?</span>{item}</li>)}
                    </ul>
                  </div>
                </div>
                <footer>
                  <p>{entry.action}</p>
                  <p className={styles.outcome}>{entry.outcome}</p>
                </footer>
              </article>
            </li>
          ))}
        </ol>
        <p className={styles.note}>
          Anonymisiert: ohne Firmen, Kennungen und Namen. Ein Abgleich ist noch keine Vermittlung.
        </p>
      </div>
    </section>
  );
}
