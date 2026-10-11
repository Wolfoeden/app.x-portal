import Link from "next/link";
import type { ReactNode } from "react";

import { LegalFooter } from "@/components/LegalFooter";
import { MARKETING_PAGE } from "@/lib/seo";

import { CompanyMenu } from "./CompanyMenu";
import { COMPANY_LINKS } from "./company-links";
import { PublicAppAction } from "./PublicAppAction";
import styles from "./public-chrome.module.css";

/**
 * „Für Unternehmen“ zeigt, was XPORTAL Firmen anbietet: Talent Index (die
 * Arbeitsfläche), Compliance Check und KI-Webinar. Im Kopf ein Menü, im
 * Telefon-Menü dieselben drei Einträge als Gruppe.
 */
function NavigationLinks({ audience, variant }: { audience: "business" | "freelancer"; variant: "bar" | "menu" }) {
  return (
    <>
      {variant === "bar" ? <CompanyMenu /> : (
        <div className={styles.menuGroup} role="group" aria-labelledby="menu-company">
          <span id="menu-company">Für Unternehmen</span>
          {COMPANY_LINKS.map((link) => <Link key={link.label} href={link.href} prefetch={false}>{link.label}</Link>)}
        </div>
      )}
      <Link href={MARKETING_PAGE.pricing.path}>{audience === "freelancer" ? "Preise für Unternehmen" : "Preise"}</Link>
      <Link href="/bewerber-portal/apply">Bewerber-Portal</Link>
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
        <Link href={MARKETING_PAGE.find.path} className={styles.brand} aria-label="XPORTAL – Für Unternehmen">
          <span>XPORTAL</span>
        </Link>
        {context ? <span className={styles.context}>{context}</span> : null}
        <nav className={styles.navigation} aria-label="Hauptnavigation">
          <NavigationLinks audience={audience} variant="bar" />
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
            <NavigationLinks audience={audience} variant="menu" />
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
        <Link href="/bewerber-portal/apply">Als Freelancer bewerben ↗</Link>
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
