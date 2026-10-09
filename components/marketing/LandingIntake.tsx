"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";

import { IconArrowUp, IconCheck } from "@/components/icons";
import { actionClass } from "@/components/ui/actions";
import { saveProjectDraft } from "@/lib/recruiting/project-draft";
import { SALES_CONTACT } from "@/lib/sales/sales-contact-model";

import { RecruitingLink } from "./RecruitingLink";
import styles from "./landing.module.css";

const DEMO_BRIEF = "ai developer on chain for midnight starting november";

export function LandingIntake({ contactPhotoUrl = null }: { contactPhotoUrl?: string | null }) {
  const [draft, setDraft] = useState("");
  const [demoDraft, setDemoDraft] = useState("");
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [userEditing, setUserEditing] = useState(false);
  const userInteracted = useRef(false);
  const profilePhotoUrl = contactPhotoUrl ?? "https://x-portal.eu/api/freelancer/avatar-image/c314d7c4-4428-45ac-ba54-1a657b9f6b62/avatar-84a397c000177b632748345e59baa596.jpg";
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
        setRevealed(true);
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
          if (userInteracted.current) return;
          setDemoSubmitted(true);
          later(() => {
            if (!userInteracted.current) setRevealed(true);
          }, 420);
        }, 180);
      };
      typeNext();
    }, 3_250);

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
    setRevealed(true);
  };

  return (
    <header className={`${styles.section} ${styles.hero}`}>
      <div
        className={`${styles.frame} ${styles.heroScene}`}
        data-revealed={revealed ? "true" : "false"}
        data-demo={userEditing ? "false" : "true"}
        data-demo-submitted={demoSubmitted ? "true" : "false"}
      >
        <ul className={styles.sourceLogos} aria-label="Mögliche Quellen einer Projektbeschreibung">
          <li><Image src="/images/landing/source-freelancermap.png" alt="freelancermap" width={44} height={42} /></li>
          <li><Image src="/images/landing/source-linkedin.png" alt="LinkedIn" width={42} height={42} /></li>
          <li><Image src="/images/landing/source-arbeitsagentur.png" alt="Bundesagentur für Arbeit" width={42} height={42} /></li>
          <li><Image src="/images/landing/source-upwork.png" alt="Upwork" width={42} height={42} /></li>
        </ul>
        <div className={styles.heroStage}>
          <div className={styles.heroTitleBlock}>
            <h1>Keine Bewerbungen.<br /><span>Nur noch Gespräche.</span></h1>
          </div>

          <div className={styles.heroSupport}>
            <div className={styles.actions}>
              <RecruitingLink href="#produktablauf" event="demo_viewed" className={actionClass("secondary", { className: styles.prominentSecondary })}>Produktablauf ansehen</RecruitingLink>
            </div>
          </div>

          <Link
            href={`/chat?profil=${SALES_CONTACT.profileId}`}
            prefetch={false}
            className={styles.profileLink}
            aria-label="Profil von Roman D. im Chat öffnen"
            onClick={() => saveProjectDraft(visibleDraft)}
          >
            <article className={styles.expertCard}>
              <div className={styles.verifiedBadge}><IconCheck size={14} /> Blockchain &amp; KI-Profil geprüft</div>
              <div className={styles.expertProfile}>
                <Image className={styles.chatProfileAvatar} src={profilePhotoUrl} alt="Roman Dering" width={68} height={68} priority unoptimized />
                <div><h3>Roman D.</h3><p>Senior Blockchain &amp; AI Automation Specialist</p></div>
              </div>
              <div className={styles.expertSkills} aria-label="Fachgebiete">
                <span>Blockchain</span><span>KI-Agenten</span><span>Automation</span><span>Web3</span><span>Smart Contracts</span>
              </div>
              <p className={styles.expertDescription}>Entwicklung intelligenter Blockchain-, Automatisierungs- und KI-Lösungen für Unternehmen.</p>
              <div className={styles.expertFacts}>
                <div><strong>Verfügbarkeit</strong><span>Ab November</span></div>
                <div><strong>Einsatz</strong><span>Remote</span></div>
              </div>
              <span className={styles.expertAction}>Experte kontaktieren →</span>
            </article>
          </Link>
        </div>

        <div className={styles.intakeDock} aria-label="Projektbeschreibung in den Chat übernehmen">
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
              {visibleDraft ? null : <span className="composer-placeholder" aria-hidden="true">Projektbeschreibung einfügen …</span>}
            </div>
            <div className="composer-bottom">
              <button className="send-button is-project-match" type="submit" disabled={!visibleDraft.trim()} aria-label="Projektbeschreibung im Chat abgleichen">
                <span>Projekt abgleichen</span><IconArrowUp size={17} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </header>
  );
}
