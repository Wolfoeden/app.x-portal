import Link from "next/link";

import { actionClass } from "@/components/ui/actions";
import { SITE_URL } from "@/lib/seo";

import { OpenOnMobileButton } from "./open-on-mobile";
import styles from "./desktop-only.module.css";

export const DESKTOP_ONLY_TITLE = "Der Talent Index ist derzeit nur für den Desktop.";

/** Schickt den Link an die eigene Adresse, um ihn am Computer zu öffnen. */
export const DESKTOP_LINK_MAIL = `mailto:?subject=${encodeURIComponent("XPORTAL Talent Index")}&body=${encodeURIComponent(`Am Computer öffnen: ${SITE_URL}/chat`)}`;

/**
 * Auf dem Handy steht vor dem Talent Index dieser Hinweis (Oktober 2026: die
 * App ist für den Zweitbildschirm im Büro gebaut). Ob er erscheint, regelt
 * allein CSS über die Fensterbreite; der Server liefert ihn immer mit, damit
 * nichts aufblitzt. „Trotzdem hier öffnen“ ist der Hauptknopf: Nur 4 von 38
 * Aufrufen des Talent Index kamen vom Handy, die übrigen blieben hier stehen.
 * Wer von der Startseite mit einem Projekttext kommt (`?start=1`), sieht den
 * Hinweis gar nicht erst (ChatWorkspace setzt `data-chat-on-mobile`).
 */
export function DesktopOnlyNotice() {
  return (
    <section className={styles.notice} aria-labelledby="desktop-only-title">
      <p className={styles.brand}>XPORTAL</p>
      <div className={styles.body}>
        <span className={styles.icon} aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="12" rx="1.5" />
            <path d="M8 20h8M12 16v4" />
          </svg>
        </span>
        <h1 id="desktop-only-title">{DESKTOP_ONLY_TITLE}</h1>
        <p>
          Öffnen Sie <strong>x-portal.eu/chat</strong> am Computer. Dort sehen Sie Profile, Belege und Ihr Projekt nebeneinander.
        </p>
        <div className={styles.actions}>
          <OpenOnMobileButton className={actionClass("primary", { block: true })} />
          <a className={actionClass("secondary", { block: true })} href={DESKTOP_LINK_MAIL}>Link per E-Mail senden</a>
        </div>
        <Link className={styles.skip} href="/">Zur Startseite</Link>
      </div>
      <nav className={styles.legal} aria-label="Rechtliches">
        <a href="/imprint">Impressum</a>
        <a href="/privacy">Datenschutz</a>
        <a href="/contact">Kontakt</a>
      </nav>
    </section>
  );
}
