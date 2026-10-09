import Link from "next/link";
import type { ReactNode } from "react";

import { LegalFooter } from "@/components/LegalFooter";
import { RecruitingLink } from "@/components/marketing/RecruitingLink";
import { MARKETING_PAGE } from "@/lib/seo";

import styles from "./public-chrome.module.css";

function NavigationLinks() {
  return (
    <>
      <Link href={MARKETING_PAGE.find.path}>Freelancer finden</Link>
      <Link href={MARKETING_PAGE.pricing.path}>Preise</Link>
      <Link href="/freelancer/apply">Für Freelancer</Link>
    </>
  );
}

/**
 * Kopf aller öffentlichen Seiten. Zwei Wege, wie bei Anbietern, die verkaufen
 * statt nur zeigen: „Gespräch buchen“ für alle, die lieber mit einem Menschen
 * sprechen, „Kostenlos testen“ für alle, die selbst suchen wollen. Bleibt
 * beim Scrollen stehen; auf dem Telefon öffnet „Menü“ die Navigation — ein
 * `<details>`, damit es ohne JavaScript geht.
 */
export function PublicHeader({ context }: { context?: string }) {
  return (
    <header className={styles.header} data-public-surface>
      <div className={styles.headerInner}>
        <Link href={MARKETING_PAGE.find.path} className={styles.brand} aria-label="XPORTAL – Freelancer finden">
          <span>XPORTAL</span>
        </Link>
        {context ? <span className={styles.context}>{context}</span> : null}
        <nav className={styles.navigation} aria-label="Hauptnavigation">
          <NavigationLinks />
        </nav>
        <div className={styles.headerActions}>
          <Link href="/chat" prefetch={false} className={styles.secondaryAction}>
            Anmelden
          </Link>
          <RecruitingLink href="/preise#tarife" event="trial_cta_clicked" className={styles.primaryAction}>
            14 Tage kostenlos testen
          </RecruitingLink>
        </div>
        <details className={styles.menu}>
          <summary>
            <span className={styles.menuIcon} aria-hidden="true" />
            <span className="sr-only">Menü</span>
          </summary>
          <nav aria-label="Navigation">
            <NavigationLinks />
            <Link href="/chat" prefetch={false}>Anmelden</Link>
            <RecruitingLink href="/preise#tarife" event="trial_cta_clicked" className={styles.menuAction}>14 Tage kostenlos testen</RecruitingLink>
          </nav>
        </details>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerIntro}>
        <div>
          <strong>XPORTAL</strong>
          <span>Match-Protokoll statt Black Box.</span>
        </div>
        <p>
          Anforderung, Profilbeleg und offene Frage bleiben getrennt sichtbar.
          Sie entscheiden selbst.
        </p>
        <Link href="/freelancer/apply">Als Freelancer bewerben ↗</Link>
      </div>
      <LegalFooter />
    </footer>
  );
}

export function PublicDocumentIntro({
  eyebrow,
  title,
  children,
  signal,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  signal: { label: string; value: string };
}) {
  return (
    <header className={styles.documentIntro}>
      <div className={styles.documentCopy}>
        <p className={styles.documentEyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <div className={styles.documentLead}>{children}</div>
      </div>
      <dl className={styles.documentSignal} aria-label={`${signal.label}: ${signal.value}`}>
        <dt>{signal.label}</dt>
        <dd>{signal.value}</dd>
      </dl>
    </header>
  );
}
