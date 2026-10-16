import Link from "next/link";
import type { ReactNode } from "react";

import { LegalFooter } from "@/components/LegalFooter";
import { SALES_CALENDAR_PATH } from "@/lib/sales/sales-call-links";
import { phoneHref, SALES_CONTACT } from "@/lib/sales/sales-contact-model";

import { CONTACT_PATH, FOOTER_COLUMNS, MAIN_NAVIGATION, MENU_EXTRA_LINKS } from "./company-links";
import { PublicAppAction } from "./PublicAppAction";
import styles from "./public-chrome.module.css";

/** Der Kalender für das Erstgespräch, mit Herkunft für den Umsatzweg. */
export function callHref(entry: "header" | "menu" | "footer"): string {
  return `${SALES_CALENDAR_PATH}?von=${entry}`;
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 2.5h2.5l1.2 3-1.6 1.1a8 8 0 0 0 3.8 3.8l1.1-1.6 3 1.2v2.5a1 1 0 0 1-1 1A11 11 0 0 1 2.5 3.5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

/**
 * Kopf aller öffentlichen Seiten (Entwurf 3, 16.10.2026): links die Marke
 * und vier Wege — Live-Demo, Leistungen, Preise, Über uns —, rechts
 * „Anmelden“, die Telefonnummer und „Erstgespräch buchen“. Der Knopf öffnet
 * den Kalender (über /contact/termin, damit der Klick zählt). Auf dem grünen
 * Rahmen (`framed`) ist er weiß, auf Weiß tannengrün; die frühere Limette
 * ist weg.
 *
 * Eine Seite mit eigenem Hauptschritt (Bewerber-Portal) gibt ihre Knöpfe als
 * `actions` mit. Auf dem Telefon öffnet „Menü“ die Navigation — ein
 * `<details>`, damit es ohne JavaScript geht.
 */
export function PublicHeader({ context, authenticated = false, actions, framed = false }: {
  context?: string;
  authenticated?: boolean;
  actions?: ReactNode;
  framed?: boolean;
}) {
  return (
    <header className={styles.header} data-public-surface data-framed={framed ? "true" : undefined}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="XPORTAL – Startseite">
          <span>XPORTAL</span>
        </Link>
        {context ? <span className={styles.context}>{context}</span> : null}
        <nav className={styles.navigation} aria-label="Hauptnavigation">
          {MAIN_NAVIGATION.map((link) => <Link key={link.label} href={link.href} prefetch={false}>{link.label}</Link>)}
        </nav>
        <div className={styles.headerActions}>
          {actions ?? (
            <>
              {authenticated ? <PublicAppAction className={styles.textAction} /> : (
                <Link href="/anmelden" prefetch={false} className={styles.textAction}>Anmelden</Link>
              )}
              <a href={phoneHref(SALES_CONTACT.phone)} className={styles.phoneAction}>
                <PhoneIcon />
                <span>{SALES_CONTACT.phone}</span>
              </a>
              <a href={callHref("header")} target="_blank" rel="noopener noreferrer nofollow" className={styles.primaryAction}>
                Erstgespräch buchen
              </a>
            </>
          )}
        </div>
        <details className={styles.menu}>
          <summary>
            <span className={styles.menuIcon} aria-hidden="true" />
            <span className="sr-only">Menü</span>
          </summary>
          <nav aria-label="Navigation">
            {[...MAIN_NAVIGATION, ...MENU_EXTRA_LINKS].map((link) => <Link key={link.label} href={link.href} prefetch={false}>{link.label}</Link>)}
            <a href={phoneHref(SALES_CONTACT.phone)}>Anrufen: {SALES_CONTACT.phone}</a>
            {authenticated ? <PublicAppAction className={styles.menuAction} /> : (
              <Link href="/anmelden" prefetch={false}>Anmelden</Link>
            )}
            <a href={callHref("menu")} target="_blank" rel="noopener noreferrer nofollow" className={styles.menuAction}>Erstgespräch buchen</a>
          </nav>
        </details>
      </div>
    </header>
  );
}

/**
 * Der Inhalt einer öffentlichen Seite als weiße Karte auf dem grünen Rahmen
 * (nach dem Vorbild von apollo.io). Kopf und Fußzeile (beide `framed`)
 * stehen außerhalb auf dem Grün.
 */
export function PublicFrame({ children }: { children: ReactNode }) {
  return <div className={styles.frame}>{children}</div>;
}

/**
 * Fußzeile: Marke, Leistungen, XPORTAL, Für Freelancer, Rechtliches (die
 * Pflichtlinks aus LegalFooter, untereinander).
 */
export function PublicFooter({ framed = false }: { framed?: boolean }) {
  return (
    <footer className={styles.footer} data-framed={framed ? "true" : undefined}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <strong>XPORTAL</strong>
          <p>KI für den Mittelstand. Ein Familienunternehmen aus Deutschland.</p>
          <p><a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a> · <Link href={CONTACT_PATH} prefetch={false}>Kontakt</Link></p>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.label} className={styles.footerColumn} aria-label={column.label}>
            <p>{column.label}</p>
            {column.links.map((link) => link.href.startsWith(SALES_CALENDAR_PATH) ? (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer nofollow">{link.label}</a>
            ) : (
              <Link key={link.label} href={link.href} prefetch={false}>{link.label}</Link>
            ))}
          </nav>
        ))}
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
