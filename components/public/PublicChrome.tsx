import Link from "next/link";
import type { ReactNode } from "react";

import { LegalFooter } from "@/components/LegalFooter";
import { MARKETING_PAGE } from "@/lib/seo";

import styles from "./public-chrome.module.css";

export function PublicHeader({ context }: { context?: string }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={MARKETING_PAGE.find.path} className={styles.brand} aria-label="XPORTAL – Freelancer finden">
          <span>XPORTAL</span>
        </Link>
        {context ? <span className={styles.context}>{context}</span> : null}
        <nav className={styles.navigation} aria-label="Hauptnavigation">
          <Link href={MARKETING_PAGE.find.path}>Freelancer finden</Link>
          <Link href={MARKETING_PAGE.matching.path}>KI-Matching</Link>
          <Link href={MARKETING_PAGE.how.path}>So funktioniert’s</Link>
          <Link href={MARKETING_PAGE.pricing.path}>Preise</Link>
          <Link href="/freelancer/apply">Freelancer-Portal</Link>
        </nav>
        <Link href="/chat" prefetch={false} className={styles.primaryAction}>
          Projekt beschreiben <span aria-hidden="true">↗</span>
        </Link>
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
