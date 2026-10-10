import Link from "next/link";
import type { ReactNode } from "react";

import { LegalFooter } from "@/components/LegalFooter";
import { MARKETING_PAGE } from "@/lib/seo";

import { PublicAppAction } from "./PublicAppAction";
import styles from "./public-chrome.module.css";

function NavigationLinks({ audience }: { audience: "business" | "freelancer" }) {
  return (
    <>
      <Link href={MARKETING_PAGE.find.path}>{audience === "freelancer" ? "Für Unternehmen" : "Freelancer Index"}</Link>
      <Link href={MARKETING_PAGE.pricing.path}>{audience === "freelancer" ? "Preise für Unternehmen" : "Preise"}</Link>
      <Link href="/freelancer/apply">Freelancer-Portal</Link>
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
export function PublicHeader({ context, authenticated = false, audience = "business" }: {
  context?: string;
  authenticated?: boolean;
  audience?: "business" | "freelancer";
}) {
  return (
    <header className={styles.header} data-public-surface>
      <div className={styles.headerInner}>
        <Link href={MARKETING_PAGE.find.path} className={styles.brand} aria-label="XPORTAL – Freelancer Index">
          <span>XPORTAL</span>
        </Link>
        {context ? <span className={styles.context}>{context}</span> : null}
        <nav className={styles.navigation} aria-label="Hauptnavigation">
          <NavigationLinks audience={audience} />
        </nav>
        <div className={styles.headerActions}>
          {authenticated ? <PublicAppAction className={styles.primaryAction} /> : (
            <Link href="/anmelden" prefetch={false} className={styles.primaryAction}>Anmelden</Link>
          )}
        </div>
        <details className={styles.menu}>
          <summary>
            <span className={styles.menuIcon} aria-hidden="true" />
            <span className="sr-only">Menü</span>
          </summary>
          <nav aria-label="Navigation">
            <NavigationLinks audience={audience} />
            {authenticated ? <PublicAppAction className={styles.menuAction} /> : (
              <Link href="/anmelden" prefetch={false} className={styles.menuAction}>Anmelden</Link>
            )}
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
