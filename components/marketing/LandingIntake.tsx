"use client";

import Link from "next/link";
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { IconArrowUp } from "@/components/icons";
import { actionClass } from "@/components/ui/actions";
import { saveProjectDraft } from "@/lib/recruiting/project-draft";

import { RecruitingLink } from "./RecruitingLink";
import styles from "./landing.module.css";

const DEMO_BRIEF = "ai developer on chain for midnight starting november";

/**
 * Wann die Demo im Eingabefeld zu tippen beginnt. Früher wartete sie gut drei
 * Sekunden auf eine Animation mit Quellen-Logos, und die Profilkarte kam erst
 * danach (rund fünf Sekunden nach dem Laden). Beides ist weg: Die Karte steht
 * sofort da, die Demo beginnt nach einem Augenblick.
 */
const DEMO_DELAY_MS = 600;

/**
 * Kopf der Startseite über die volle Breite: links Titel und die zwei Wege,
 * rechts die Profilkarte, darunter das Eingabefeld über die ganze Breite mit
 * den Rollen-Vorschlägen. Karte und Vorschläge rendert der Server
 * (FreelancerLanding); hier liegt nur, was im Browser läuft: die Demo im
 * Eingabefeld und das Mitnehmen des Entwurfs in den Chat.
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
    <header className={`${styles.section} ${styles.hero}`}>
      <div
        className={`${styles.wrap} ${styles.heroScene}`}
        data-demo={userEditing ? "false" : "true"}
        data-demo-submitted={demoSubmitted ? "true" : "false"}
      >
        <div className={styles.heroStage}>
          <div className={styles.heroMain}>
            <h1>Weniger Bewerbungen.<br /><span>Mehr relevante Gespräche.</span></h1>
            <div className={styles.heroActions}>
              <Link href="/chat" prefetch={false} className={actionClass("primary")}>Kostenlos starten</Link>
              <RecruitingLink href="#produktablauf" event="demo_viewed" className={actionClass("secondary")}>Produktablauf ansehen</RecruitingLink>
            </div>
            <p className={styles.heroNote}>{note}</p>
          </div>

          <Link
            href={`/chat?profil=${profileId}`}
            prefetch={false}
            className={styles.profileLink}
            aria-label="Profil von Roman D. im Chat öffnen"
            onClick={() => saveProjectDraft(visibleDraft)}
          >
            {profileCard}
          </Link>
        </div>

        <div className={styles.intakeDock}>
          <nav className={styles.roleChips} aria-label="Mit einer Rolle beginnen">
            <span>Oder mit einer Rolle beginnen:</span>
            {roleChips}
          </nav>
          <div className={styles.composerArea} aria-label="Projektbeschreibung in den Chat übernehmen">
            <form className={`composer ${styles.landingComposer}`} action="/chat" method="get" onSubmit={submit}>
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
                <button className="send-button is-project-match" type="submit" disabled={!visibleDraft.trim()} aria-label="Projektbeschreibung im Chat abgleichen">
                  <span>Projekt abgleichen</span><IconArrowUp size={17} />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
