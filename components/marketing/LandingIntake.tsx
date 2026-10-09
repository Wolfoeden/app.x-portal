"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useEffect, useState } from "react";

import { IconArrowUp, IconCheck } from "@/components/icons";
import { actionClass } from "@/components/ui/actions";
import { saveProjectDraft } from "@/lib/recruiting/project-draft";
import { SALES_CONTACT } from "@/lib/sales/sales-contact-model";

import { RecruitingLink } from "./RecruitingLink";
import styles from "./landing.module.css";

export function LandingIntake({ contactPhotoUrl = null }: { contactPhotoUrl?: string | null }) {
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const profilePhotoUrl = contactPhotoUrl ?? "https://x-portal.eu/api/freelancer/avatar-image/c314d7c4-4428-45ac-ba54-1a657b9f6b62/avatar-84a397c000177b632748345e59baa596.jpg";

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setRevealed(true), reducedMotion ? 0 : 1_900);
    return () => window.clearTimeout(timer);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (!draft.trim()) {
      event.preventDefault();
      return;
    }
    saveProjectDraft(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (draft.trim()) event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <header className={`${styles.section} ${styles.hero}`}>
      <div className={`${styles.frame} ${styles.heroScene}`} data-revealed={revealed ? "true" : "false"}>
        <div className={styles.heroStage}>
          <div className={styles.heroTitleBlock}>
            <h1>Kundenanfrage rein.<br /><span>Prüfbare Auswahl raus.</span></h1>
          </div>

          <div className={styles.heroSupport}>
            <div className={styles.actions}>
              <RecruitingLink href="/preise#tarife" event="trial_cta_clicked" className={actionClass("primary")}>14 Tage kostenlos testen</RecruitingLink>
              <RecruitingLink href="#produktablauf" event="demo_viewed" className={actionClass("secondary", { className: styles.prominentSecondary })}>Produktablauf ansehen</RecruitingLink>
            </div>
          </div>

          <Link
            href={`/chat?profil=${SALES_CONTACT.profileId}`}
            prefetch={false}
            className={styles.profileLink}
            aria-label="Profil von Roman D. im Chat öffnen"
            onClick={() => saveProjectDraft(draft)}
          >
            <article className={`profile-card is-primary ${styles.landingProfile}`}>
              <div className="profile-main">
                <div className="pband" data-field="ai">
                  <span className="pband-label">Blockchain &amp; KI</span>
                  <span className="pband-verified"><IconCheck size={11} /> Profil geprüft</span>
                </div>
                <header className="profile-header">
                  <div className="profile-identity">
                    <Image className={styles.chatProfileAvatar} src={profilePhotoUrl} alt="Roman Dering" width={54} height={54} priority unoptimized />
                    <div><h3>Roman D.</h3><p>Senior Blockchain-Spezialist · remote</p></div>
                  </div>
                  <span className="match-role">Hauptvorschlag</span>
                </header>
                <div className={styles.profileProof}>
                  <strong><IconCheck size={14} /> Blockchain und KI-Automatisierung</strong>
                  <span>im Profil belegt</span>
                </div>
                <div className={styles.profileOpenPoint}><strong>Offener Punkt</strong><span>Start November wird angefragt</span></div>
                <p className={styles.profileOpenHint}>Roman D.s Profil im Chat öffnen →</p>
              </div>
            </article>
          </Link>
        </div>

        <div className={styles.intakeDock} aria-label="Projektbeschreibung in den Chat übernehmen">
          <ul className={styles.sourceLogos} aria-label="Mögliche Quellen einer Projektbeschreibung">
            <li><Image src="/images/landing/source-freelancermap.png" alt="freelancermap" width={44} height={42} /></li>
            <li><Image src="/images/landing/source-linkedin.png" alt="LinkedIn" width={42} height={42} /></li>
            <li><Image src="/images/landing/source-arbeitsagentur.png" alt="Bundesagentur für Arbeit" width={42} height={42} /></li>
            <li><Image src="/images/landing/source-upwork.png" alt="Upwork" width={42} height={42} /></li>
          </ul>
          <form className={`composer ${styles.landingComposer}`} action="/chat" method="get" onSubmit={submit}>
            <label className="sr-only" htmlFor="landing-project-brief">Projektbeschreibung einfügen</label>
            <div className="composer-field">
              <textarea
                id="landing-project-brief"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => setRevealed(true)}
                onKeyDown={handleKeyDown}
                rows={1}
                maxLength={12_000}
              />
              {draft ? null : <span className="composer-placeholder" aria-hidden="true">Projektbeschreibung einfügen …</span>}
            </div>
            <div className="composer-bottom">
              <button className="send-button is-project-match" type="submit" disabled={!draft.trim()} aria-label="Projektbeschreibung im Chat abgleichen">
                <span>Projekt abgleichen</span><IconArrowUp size={17} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </header>
  );
}
