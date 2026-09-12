import Link from "next/link";
import type { ReactNode } from "react";

import { JsonLd } from "@/components/JsonLd";
import { MARKETING_PAGES, type PublicPage } from "@/lib/seo";
import { breadcrumbStructuredData } from "@/lib/structured-data";
import styles from "./marketing.module.css";

export function ProjectLink({ children = "Projekt beschreiben" }: { children?: ReactNode }) {
  return (
    <Link href="/chat" prefetch={false} className={styles.primaryLink}>
      {children}<span aria-hidden="true">↗</span>
    </Link>
  );
}

export function MarketingPage({
  page, eyebrow, title, intro, aside, children,
}: {
  page: PublicPage;
  eyebrow: string;
  title: string;
  intro: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="main-content" className={styles.main} tabIndex={-1}>
      <JsonLd data={breadcrumbStructuredData(page)} />
      <nav aria-label="Brotkrümelnavigation" className={styles.breadcrumb}>
        <ol>
          <li><Link href="/chat" prefetch={false}>XPORTAL</Link></li>
          <li><span aria-current="page">{page.label}</span></li>
        </ol>
      </nav>
      <header className={aside ? styles.hero : styles.heroText}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.lead}>{intro}</p>
          <div className={styles.heroActions}>
            <ProjectLink />
            <span className={styles.subtle}>Ohne Anmeldung starten</span>
          </div>
        </div>
        {aside}
      </header>
      {children}
      <section className={styles.nextStep} aria-labelledby="next-step-title">
        <div>
          <p className={styles.eyebrow}>Ihr nächster Schritt</p>
          <h2 id="next-step-title">Aus Ihrer Aufgabe wird eine konkrete Suche.</h2>
          <p>Beschreiben Sie, was entstehen soll und welche Erfahrung Sie dafür brauchen.</p>
        </div>
        <ProjectLink />
      </section>
      <nav className={styles.related} aria-label="Passend zum Thema">
        <p className={styles.eyebrow}>Weiterlesen</p>
        <ul>
          {MARKETING_PAGES.filter((entry) => entry.path !== page.path).map((entry) => (
            <li key={entry.path}>
              <Link href={entry.path}>{entry.label}<span aria-hidden="true">↗</span></Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}

export function ContentSection({
  id, label, title, children,
}: { id: string; label?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={id + "-title"}>
      <header className={styles.sectionHeading}>
        {label ? <p className={styles.eyebrow}>{label}</p> : null}
        <h2 id={id + "-title"}>{title}</h2>
      </header>
      <div className={styles.sectionContent}>{children}</div>
    </section>
  );
}

export function Questions({ items }: { items: readonly { question: string; answer: ReactNode }[] }) {
  return (
    <div className={styles.questions}>
      {items.map(({ question, answer }) => (
        <details key={question}>
          <summary>{question}</summary>
          <div className={styles.answer}>{answer}</div>
        </details>
      ))}
    </div>
  );
}

/** An explanatory artifact, deliberately without a person, score or endorsement. */
export function MatchExample() {
  return (
    <figure className={styles.matchExample}>
      <figcaption>So lesen Sie einen Abgleich</figcaption>
      <p className={styles.exampleLabel}>Illustratives Beispiel · kein reales Profil</p>
      <blockquote>„Wir suchen React-Erfahrung, remote. Der Start ist noch offen.“</blockquote>
      <dl className={styles.evidenceList}>
        <div>
          <dt>React</dt>
          <dd><span className={styles.fact}>Im Beispielprofil genannt</span><small>Ein Grund für die fachliche Überschneidung.</small></dd>
        </div>
        <div>
          <dt>Remote</dt>
          <dd><span className={styles.fact}>Arbeitsmodus passt</span><small>Die Angabe entspricht der Anforderung.</small></dd>
        </div>
        <div>
          <dt>Projektstart</dt>
          <dd><span className={styles.gap}>Noch zu klären</span><small>Eine fehlende Angabe ist keine Zusage.</small></dd>
        </div>
      </dl>
      <p className={styles.exampleFoot}>Ein Match ist eine Entscheidungshilfe. Sie führen das Gespräch und wählen selbst.</p>
    </figure>
  );
}
