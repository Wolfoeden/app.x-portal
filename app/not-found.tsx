import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Seite nicht gefunden | XPORTAL",
  robots: { index: false, follow: false },
};

/**
 * Ein Tippfehler in der Adresse führte bisher auf die Standardseite von
 * Next.js: englisch, ohne Marke, ohne Navigation — und ohne die Pflichtlinks,
 * die von jeder Seite aus erreichbar sein müssen.
 */
export default function NotFound() {
  return (
    <main className="xlegal" lang="de">
      <header className="xlegal-header">
        <Link href="/chat" className="xlegal-wordmark">XPORTAL</Link>
        <span>404</span>
      </header>

      <article className="xlegal-document">
        <p className="xhome-label">Nicht gefunden</p>
        <h1>Diese Seite gibt es nicht.</h1>
        <p className="xlegal-lead">
          Möglicherweise wurde die Adresse geändert, oder beim Kopieren ist ein
          Teil verloren gegangen.
        </p>

        <div className="booking-actions">
          <Link className="booking-continue" href="/chat">
            Zur Freelancer-Suche
          </Link>
          <Link href="/contact">Etwas melden</Link>
        </div>
      </article>

      <footer className="xlegal-footer">
        <Link href="/chat">Zurück zu XPORTAL</Link>
        <span>
          <Link href="/imprint">Impressum</Link>
          {" · "}
          <Link href="/privacy">Datenschutz</Link>
          {" · "}
          <Link href="/terms">AGB</Link>
        </span>
      </footer>
    </main>
  );
}
