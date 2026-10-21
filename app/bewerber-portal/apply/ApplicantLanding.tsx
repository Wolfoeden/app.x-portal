import Image from "next/image";
import type { ReactNode } from "react";

import { MatchCard } from "@/components/ui/MatchCard";

import { APPLICANT_FAQ, APPLY_HERO, onboardingFacts } from "./applicant-copy";
import { GateActions } from "./GateActions";
import styles from "./applicant-landing.module.css";

const STEPS = [
  { title: "Profil ausfüllen", text: "Rolle, Kompetenzen, Sprachen, Verfügbarkeit, Honorar und ein, zwei Sätze über Sie. Drei Minuten, ohne Lebenslauf." },
  { title: "Konto bestätigen", text: "Mit Google, LinkedIn oder E-Mail. Ihre Angaben bleiben dabei erhalten." },
  { title: "Sofort sichtbar", text: "Ist alles vollständig, ist Ihr Profil gleich im Matching, als Angaben laut Freelancer. Sonst sieht es sich erst unser Team an." },
  { title: "Gefunden werden", text: "Passt eine Anfrage, meldet sich XPORTAL per E-Mail. Referenzprojekte und GitHub im Dashboard machen Ihr Profil stärker." },
] as const;

/**
 * Einstieg ins Bewerber-Portal für abgemeldete Besucher (Desktop-Entwurf,
 * Oktober 2026): Kernbotschaft und Beispielkarte, seit 21.10.2026 gleich
 * darunter das Formular, dann die Fakten vor der Registrierung, der Ablauf,
 * der Abgleich und die häufigen Fragen. Rendert auf dem Server; nur das
 * Formular und die Anmeldeknöpfe (GateActions) laufen im Browser.
 */
export function ApplicantLanding({ notices = null, form = null }: { notices?: ReactNode; form?: ReactNode }) {
  // „Ablauf“ steht ausführlich in den vier Schritten.
  const facts = onboardingFacts().filter((fact) => fact.term !== "Ablauf");
  return (
    <>
      <header id="start" className={styles.hero}>
        <div className={`${styles.wrap} ${styles.heroGrid}`}>
          <div className={styles.heroMain}>
            <p className={styles.eyebrow}>{APPLY_HERO.eyebrow}</p>
            <h1>Profil veröffentlichen. <span>Gefunden werden.</span></h1>
            <p className={styles.lead}>{APPLY_HERO.lead}</p>
            <GateActions variant="hero" />
            <p className={styles.note}>Kostenlos · keine Provision · Kontaktdaten bleiben privat</p>
          </div>
          <aside className={styles.example} aria-labelledby="apply-example-title">
            <h2 id="apply-example-title">So sehen Unternehmen Ihr Profil</h2>
            <MatchCard
              className={styles.exampleCard}
              caption="Anfrage: React-Frontend für eine Direktbank"
              avatar={{ initials: "AB" }}
              name="Anna Beispiel"
              role="Senior Frontend-Entwicklerin · Leipzig, Remote"
              score={{ text: "4 von 4" }}
              rows={[
                { label: "React", detail: "belegt" },
                { label: "TypeScript", detail: "belegt" },
                { label: "Design Systems", detail: "angegeben" },
                { label: "Banken", detail: "Referenzprojekt" },
              ]}
              facts={[
                { label: "Honorar", value: "760 € / Tag" },
                { label: "Verfügbar", value: "sofort" },
              ]}
              footer={<>
                <span className={styles.fakePrimary}>Anfragen</span>
                <span className={styles.fakeSecondary}>Profil</span>
              </>}
            />
            <p className={styles.exampleHint}>Ein ausgedachtes Profil. Ihres zeigt nur, was Sie angeben und XPORTAL freigibt.</p>
          </aside>
        </div>
      </header>

      {notices ? <div className={styles.wrap}>{notices}</div> : null}

      {form ? (
        <section id="profil" className={styles.formSection} aria-label="Profil anlegen">
          <div className={styles.wrap}>{form}</div>
        </section>
      ) : null}

      <section className={styles.facts} aria-label="Gut zu wissen">
        <dl className={`${styles.wrap} ${styles.factsRow}`}>
          {facts.map((fact) => (
            <div key={fact.term}>
              <dt>{fact.chip}</dt>
              <dd>{fact.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="ablauf-title">
        <div className={styles.wrap}>
          <p className={styles.eyebrow}>So läuft es ab</p>
          <h2 id="ablauf-title">In vier Schritten ins Matching.</h2>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span aria-hidden="true">{index + 1}</span>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tinted}`} aria-labelledby="pruefen-title">
        <div className={`${styles.wrap} ${styles.split}`}>
          <Image className={styles.splitImage} src="/images/landing/project-match.webp" alt="Eine Projektanfrage wird mit passenden Profilen verbunden." width={1536} height={1024} sizes="(max-width: 960px) 100vw, 760px" loading="lazy" />
          <div className={styles.splitText}>
            <p className={styles.eyebrow}>Erst prüfen, dann bewerben</p>
            <h2 id="pruefen-title">Jede Anforderung gegen Ihr Profil geprüft.</h2>
            <p>Unternehmen beschreiben ein Projekt. XPORTAL prüft jede Anforderung gegen Ihre Angaben und zeigt, was belegt ist und was im Gespräch zu klären bleibt. So landen Sie bei Anfragen, die wirklich passen.</p>
            <ul className={styles.checks}>
              <li>Belege statt Schlagworte</li>
              <li>Offene Punkte stehen sichtbar auf der Karte</li>
              <li>Honorar und Verfügbarkeit legen Sie selbst fest</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="fragen" className={styles.section} aria-labelledby="fragen-title">
        <div className={styles.wrap}>
          <p className={styles.eyebrow}>Gut zu wissen</p>
          <h2 id="fragen-title">Auch ohne Freelance-Erfahrung.</h2>
          <div className={styles.faq}>
            {APPLICANT_FAQ.map((entry) => (
              <article key={entry.label} aria-label={entry.label}>
                <h3>{entry.question}</h3>
                <p>{entry.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="start-title">
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.splitText}>
            <h2 id="start-title">Bereit, gefunden zu werden?</h2>
            <p>Kostenlos und ohne Provision. Unternehmen sehen Ihr Profil ohne E-Mail-Adresse und Telefonnummer.</p>
            <GateActions variant="closing" />
          </div>
          <Image className={styles.splitImage} src="/images/landing/project-conversation.webp" alt="Zwei Menschen besprechen eine Projektbeschreibung am Tisch." width={1536} height={1024} sizes="(max-width: 960px) 100vw, 760px" loading="lazy" />
        </div>
      </section>
    </>
  );
}
