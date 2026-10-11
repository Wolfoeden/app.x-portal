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
function NavigationLinks({ variant }: { variant: "bar" | "menu" }) {
  return (
    <>
      {variant === "bar" ? <CompanyMenu /> : (
        <div className={styles.menuGroup} role="group" aria-labelledby="menu-company">
          <span id="menu-company">Für Unternehmen</span>
          {COMPANY_LINKS.map((link) => <Link key={link.label} href={link.href} prefetch={false}>{link.label}</Link>)}
        </div>
      )}
      <Link href={MARKETING_PAGE.pricing.path}>Preise</Link>
      <Link href="/bewerber-portal/apply">Bewerber-Portal</Link>
    </>
  );
}

/**
 * Kopf aller öffentlichen Seiten, so breit wie der Inhalt (bis 1600 px).
 * Rechts „Anmelden“ und „Kostenlos starten“; eine Seite mit eigenem
 * Hauptschritt (Bewerber-Portal) gibt ihre Knöpfe als `actions` mit. Bleibt
 * beim Scrollen stehen; auf dem Telefon öffnet „Menü“ die Navigation — ein
 * `<details>`, damit es ohne JavaScript geht.
 */
export function PublicHeader({ context, authenticated = false, actions }: {
  context?: string;
  authenticated?: boolean;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header} data-public-surface>
      <div className={styles.headerInner}>
        <Link href={MARKETING_PAGE.find.path} className={styles.brand} aria-label="XPORTAL – Für Unternehmen">
          <span>XPORTAL</span>
        </Link>
        {context ? <span className={styles.context}>{context}</span> : null}
        <nav className={styles.navigation} aria-label="Hauptnavigation">
          <NavigationLinks variant="bar" />
        </nav>
        <div className={styles.headerActions}>
          {actions ?? (authenticated ? <PublicAppAction className={styles.primaryAction} /> : (
            <>
              <Link href="/anmelden" prefetch={false} className={styles.secondaryAction}>Anmelden</Link>
              <Link href="/chat" prefetch={false} className={styles.primaryAction}>Kostenlos starten</Link>
            </>
          ))}
        </div>
        <details className={styles.menu}>
          <summary>
            <span className={styles.menuIcon} aria-hidden="true" />
            <span className="sr-only">Menü</span>
          </summary>
          <nav aria-label="Navigation">
            <NavigationLinks variant="menu" />
            {authenticated ? <PublicAppAction className={styles.menuAction} /> : (
              <Link href="/anmelden" prefetch={false} className={styles.menuAction}>Anmelden</Link>
            )}
          </nav>
        </details>
      </div>
    </header>
  );
}

/**
 * Fußzeile in vier Spalten über die volle Breite: Marke, Angebote für
 * Unternehmen, Bewerber-Portal, Rechtliches (die Pflichtlinks aus
 * LegalFooter, untereinander).
 */
export function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <strong>XPORTAL</strong>
          <p>Talent Index, Compliance Check und KI-Webinare für Unternehmen. Ein Familienunternehmen aus Deutschland.</p>
        </div>
        <nav className={styles.footerColumn} aria-label="Für Unternehmen">
          <p>Für Unternehmen</p>
          {COMPANY_LINKS.map((link) => <Link key={link.label} href={link.href} prefetch={false}>{link.label}</Link>)}
          <Link href={MARKETING_PAGE.pricing.path}>Preise</Link>
        </nav>
        <nav className={styles.footerColumn} aria-label="Für Bewerber">
          <p>Für Bewerber</p>
          <Link href="/bewerber-portal/apply">Bewerber-Portal</Link>
          <Link href="/bewerber-portal/apply#fragen">Fragen und Antworten</Link>
        </nav>
        <div className={styles.footerColumn}>
          <p>Rechtliches</p>
          <LegalFooter className={styles.footerLegal} />
        </div>
      </div>
      <div className={styles.footerBottom}><p>© XPORTAL</p></div>
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
