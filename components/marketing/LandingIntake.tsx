"use client";

import Link from "next/link";
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { IconArrowUp } from "@/components/icons";
import { saveProjectDraft } from "@/lib/recruiting/project-draft";
import { salesCallHref } from "@/lib/sales/sales-call-links";

import { RecruitingLink } from "./RecruitingLink";
import styles from "./landing.module.css";

const DEMO_BRIEF = "KI-Entwickler für Midnight-Blockchain, remote, ab November";

/**
 * Wann die Demo im Eingabefeld zu tippen beginnt. Früher wartete sie gut drei
 * Sekunden auf eine Animation mit Quellen-Logos, und die Profilkarte kam erst
 * danach (rund fünf Sekunden nach dem Laden). Beides ist weg: Die Karte steht
 * sofort da, die Demo beginnt nach einem Augenblick.
 */
const DEMO_DELAY_MS = 600;

/**
 * Kopf der Startseite nach dem Vorbild von apollo.io (Oktober 2026): Titel in
 * der Mitte, ein Satz, die Wahl zwischen Projekt abgleichen und Gespräch,
 * darunter das Eingabefeld als einzige Hauptaktion. Die Profilkarte steht
 * darunter als Beispiel für einen Treffer. Karte und Rollen rendert der
 * Server (FreelancerLanding); hier liegt nur, was im Browser läuft: die Demo
 * im Eingabefeld und das Mitnehmen des Entwurfs in den Talent Index.
 */
export function LandingIntake({ profileId, note, roleChips, profileCard }: {
  profileId: string;
  note: string;
  roleChips: ReactNode;
  profileCard: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [demoDraft, setDemoDraft] = useState("");
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [userEditing, setUserEditing] = useState(false);
  const userInteracted = useRef(false);
  const visibleDraft = userEditing ? draft : demoDraft;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    const later = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(callback, delay);
      timers.push(timer);
    };

    if (reducedMotion) {
      later(() => {
        setDemoDraft(DEMO_BRIEF);
        setDemoSubmitted(true);
      }, 0);
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }

    later(() => {
      let index = 0;
      const typeNext = () => {
        if (userInteracted.current) return;
        index += 1;
        setDemoDraft(DEMO_BRIEF.slice(0, index));
        if (index < DEMO_BRIEF.length) {
          later(typeNext, 24);
          return;
        }
        later(() => {
          if (!userInteracted.current) setDemoSubmitted(true);
        }, 180);
      };
      typeNext();
    }, DEMO_DELAY_MS);

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (!visibleDraft.trim()) {
      event.preventDefault();
      return;
    }
    saveProjectDraft(visibleDraft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (visibleDraft.trim()) event.currentTarget.form?.requestSubmit();
    }
  };

  const beginEditing = () => {
    userInteracted.current = true;
    setDraft(visibleDraft);
    setUserEditing(true);
    setDemoSubmitted(false);
  };

  return (
    <>
      <header className={styles.hero}>
        <div
          className={`${styles.wrap} ${styles.heroCenter}`}
          data-demo={userEditing ? "false" : "true"}
          data-demo-submitted={demoSubmitted ? "true" : "false"}
        >
          <h1>Weniger Bewerbungen.<br /><span>Mehr relevante Gespräche.</span></h1>
          <p className={styles.heroLead}>Projekt einfügen und passende Freelancer mit Belegen sehen. Provisionsfrei, ohne Vermittler.</p>

          <div className={styles.heroSwitch} role="group" aria-label="Wie möchten Sie starten?">
            <a href="#landing-project-brief" className={styles.switchActive} aria-current="true">Projekt abgleichen</a>
            <Link href={salesCallHref("hero")} prefetch={false}>Gespräch vereinbaren</Link>
          </div>
          <p className={styles.heroPill}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="m5.3 8.2 1.9 1.9 3.6-3.8" /></svg>
            {note}
          </p>

          <form className={`composer ${styles.landingComposer}`} action="/chat" method="get" onSubmit={submit}>
            {/* Der Talent Index startet die Analyse mit diesem Signal von selbst
                (ChatWorkspace, `?start=1`); ohne Konto kommt zuerst die
                kostenlose Registrierung. */}
            <input type="hidden" name="start" value="1" />
            <label className="sr-only" htmlFor="landing-project-brief">Projektbeschreibung einfügen</label>
            <div className="composer-field">
              <textarea
                id="landing-project-brief"
                value={visibleDraft}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={beginEditing}
                onKeyDown={handleKeyDown}
                rows={1}
                maxLength={12_000}
              />
              {visibleDraft ? null : <span className="composer-placeholder" aria-hidden="true">Projektbeschreibung einfügen – aus Ihrer Ausschreibung, von freelancermap oder LinkedIn …</span>}
            </div>
            <div className="composer-bottom">
              <button className="send-button is-project-match" type="submit" disabled={!visibleDraft.trim()} aria-label="Projektbeschreibung im Talent Index abgleichen">
                <span>Passende Freelancer finden</span><IconArrowUp size={17} />
              </button>
            </div>
          </form>

          <p className={styles.heroOr}><span>oder mit einer Rolle beginnen</span></p>
          <nav className={styles.roleChips} aria-label="Mit einer Rolle beginnen">{roleChips}</nav>
          <p className={styles.heroTerms}>
            Die Analyse startet nach einer kostenlosen Registrierung. Ihre Eingaben trainieren keine KI.{" "}
            <RecruitingLink href="#produktablauf" event="demo_viewed" className={styles.heroTermsLink}>Produktablauf ansehen</RecruitingLink>
          </p>
        </div>
      </header>

      <section className={styles.showcase} aria-label="Beispiel für einen Treffer">
        <div className={`${styles.wrap} ${styles.showcaseInner}`}>
          <p className={styles.showcaseLabel}>So sieht ein Treffer aus</p>
          <Link
            href={`/chat?profil=${profileId}`}
            prefetch={false}
            className={styles.profileLink}
            aria-label="Profil von Roman D. im Talent Index öffnen"
            onClick={() => saveProjectDraft(visibleDraft)}
          >
            {profileCard}
          </Link>
        </div>
      </section>
    </>
  );
}
