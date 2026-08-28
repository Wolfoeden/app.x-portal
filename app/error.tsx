"use client";

import Link from "next/link";

/**
 * Die Fehlerseite innerhalb des Layouts.
 *
 * Gezeigt wird die Kennung (`digest`), nie die Fehlermeldung: Eine
 * Serverfehlermeldung kann Tabellennamen, Pfade oder Werte enthalten, und
 * nichts davon gehört auf den Bildschirm eines Besuchers. Die Kennung reicht,
 * um denselben Fall in den Protokollen wiederzufinden.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="xlegal" lang="de">
      <header className="xlegal-header">
        <Link href="/chat" className="xlegal-wordmark">XPORTAL</Link>
        <span>FEHLER</span>
      </header>

      <article className="xlegal-document">
        <p className="xhome-label">Fehler</p>
        <h1>Da ist etwas schiefgegangen.</h1>
        <p className="xlegal-lead">
          Ihre Daten sind nicht verloren. Versuchen Sie es erneut — bleibt es
          dabei, melden Sie sich mit der Kennung unten bei uns.
        </p>

        <div className="booking-actions">
          <button type="button" className="booking-continue" onClick={reset}>
            Erneut versuchen
          </button>
          <Link href="/chat">Zur Startseite</Link>
        </div>

        {error.digest ? (
          <div className="xlegal-warning">
            <strong>Kennung für den Support</strong>
            <p>
              <code>{error.digest}</code>
            </p>
          </div>
        ) : null}

        <p className="contact-note">
          Über das <Link href="/contact">Kontaktformular</Link> erreichen Sie
          uns direkt; nennen Sie dabei die Kennung, dann finden wir den Vorgang
          wieder.
        </p>
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
