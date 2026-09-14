"use client";

import Link from "next/link";
import "@/app/styles/legal.css";
import {
  PublicDocumentIntro,
  PublicFooter,
  PublicHeader,
} from "@/components/public/PublicChrome";

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
    <div className="xlegal" lang="de">
      <PublicHeader context="Fehler" />

      <main className="xlegal-document">
        <PublicDocumentIntro
          eyebrow="Fehler"
          title="Da ist etwas schiefgegangen."
          signal={{ label: "Wiederherstellung", value: "Erneut versuchen" }}
        >
          <p>
            Ihre Daten sind nicht verloren. Versuchen Sie es erneut — bleibt es
            dabei, melden Sie sich mit der Kennung unten bei uns.
          </p>
        </PublicDocumentIntro>

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
      </main>

      <PublicFooter />
    </div>
  );
}
