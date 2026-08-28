import type { Metadata } from "next";
import Link from "next/link";

import {
  bookingDestinationLabel,
  isAllowedBookingHost,
} from "@/lib/freelancer/booking-hosts";
import { loadBookingDestination } from "@/lib/freelancer/profile-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weiterleitung | XPORTAL",
  description: "Bestätigung vor dem Wechsel zu einer externen Buchungsseite.",
  // Eine Seite je Profil-ID gehört nicht in einen Index.
  robots: { index: false, follow: false },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="xlegal" lang="de">
      <header className="xlegal-header">
        <Link href="/chat" className="xlegal-wordmark">XPORTAL</Link>
        <span>WEITERLEITUNG</span>
      </header>
      <article className="xlegal-document">{children}</article>
      <footer className="xlegal-footer">
        <Link href="/chat">Zurück zu XPORTAL</Link>
        <span>
          <Link href="/imprint">Impressum</Link>
          {" · "}
          <Link href="/privacy">Datenschutz</Link>
        </span>
      </footer>
    </main>
  );
}

/**
 * Die Zwischenseite vor einem fremden Buchungsziel.
 *
 * `/api/freelancers/<id>/book` leitet nur noch zu bekannten Buchungsdiensten
 * direkt weiter. Jede andere Adresse landet hier — nicht weil sie verdächtig
 * wäre, sondern weil x-portal.eu sonst als Weiterleiter für ein Ziel
 * einstünde, das es nicht kennt. Die Adresse kommt dabei aus der Datenbank,
 * nie aus der Anfrage: eine Zieladresse im Query-String wäre genau die offene
 * Weiterleitung, die hier geschlossen wird.
 */
export default async function BookingHandoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return (
      <Frame>
        <p className="xhome-label">Weiterleitung</p>
        <h1>Dieser Link führt nirgendwohin.</h1>
        <p className="xlegal-lead">
          Die Adresse ist unvollständig oder wurde beim Kopieren abgeschnitten.
        </p>
      </Frame>
    );
  }

  const destination = await loadBookingDestination(id).catch(() => null);

  if (!destination) {
    return (
      <Frame>
        <p className="xhome-label">Weiterleitung</p>
        <h1>Diese Buchungsseite ist gerade nicht verfügbar.</h1>
        <p className="xlegal-lead">
          Das Profil ist nicht mehr aktiv, oder es ist keine Buchungsadresse
          hinterlegt.
        </p>
      </Frame>
    );
  }

  // Ein bekannter Dienst kommt hier normalerweise nicht an. Falls doch — etwa
  // über einen kopierten Link — bleibt die Bestätigung stehen statt sich
  // selbst zu überspringen: eine Seite, die automatisch weiterleitet, wäre
  // wieder eine offene Weiterleitung.
  const known = isAllowedBookingHost(destination.url);
  const label = bookingDestinationLabel(destination.url);

  return (
    <Frame>
      <p className="xhome-label">Weiterleitung</p>
      <h1>Sie verlassen XPORTAL.</h1>
      <p className="xlegal-lead">
        {destination.displayName} nimmt Termine auf einer eigenen Seite
        entgegen. Der Aufruf entsteht erst mit Ihrem Klick.
      </p>

      <div className="xlegal-warning">
        <strong>Ziel</strong>
        <p>
          <span className="booking-host">{label?.host ?? "unbekannt"}</span>
          <br />
          <span className="booking-url">{label?.full ?? destination.url}</span>
        </p>
      </div>

      <div className="booking-actions">
        <a
          className="booking-continue"
          href={destination.url}
          rel="noreferrer nofollow"
        >
          Weiter zur Buchungsseite
        </a>
        <Link href="/chat">Abbrechen</Link>
      </div>

      <p className="booking-note">
        XPORTAL betreibt diese Seite nicht{known ? "" : " und kennt sie nicht"}.
        Was Sie dort eingeben, verarbeitet der jeweilige Anbieter nach seinen
        eigenen Bedingungen. Aus Ihrem Chat wird nichts übermittelt. Näheres
        steht in Abschnitt 7 der{" "}
        <Link href="/privacy">Datenschutzhinweise</Link>.
      </p>
    </Frame>
  );
}
