import type { Metadata } from "next";
import Link from "next/link";

import { CONFIRMATION_TTL_HOURS } from "@/lib/whitelist/confirmation";

export const metadata: Metadata = {
  title: "Anmeldung bestätigen | XPORTAL",
  description: "Bestätigung der Anmeldung zur XPORTAL-Whitelist.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Result = "confirmed" | "expired" | "unknown" | "error";

function resultOf(value: string | string[] | undefined): Result | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "confirmed" || raw === "expired" || raw === "unknown" || raw === "error"
    ? raw
    : null;
}

function tokenOf(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  // Nur die Form wird hier geprüft; ob der Token gilt, entscheidet die Route.
  return /^[A-Za-z0-9_-]{32,128}$/u.test(raw) ? raw : null;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="xlegal" lang="de">
      <header className="xlegal-header">
        <Link href="/chat" className="xlegal-wordmark">XPORTAL</Link>
        <span>ANMELDUNG</span>
      </header>
      <article className="xlegal-document">{children}</article>
      <footer className="xlegal-footer">
        <Link href="/chat">Zurück zu XPORTAL</Link>
        <span>
          <Link href="/imprint">Impressum</Link>
          {" · "}
          <Link href="/privacy">Datenschutz</Link>
          {" · "}
          <Link href="/contact">Kontakt</Link>
        </span>
      </footer>
    </main>
  );
}

/**
 * Die Bestätigungsseite des Double-Opt-in.
 *
 * Sie bestätigt nichts von selbst. Der Link aus der E-Mail führt hierher, und
 * erst ein Klick auf die Schaltfläche schickt den Token per POST an die Route.
 * Damit lösen Virenscanner und Vorschaudienste, die Links in E-Mails
 * automatisch abrufen, keine Einwilligung aus, die niemand erteilt hat.
 */
export default async function WhitelistConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = resultOf(params.result);
  const token = tokenOf(params.token);

  if (result === "confirmed") {
    return (
      <Frame>
        <p className="xhome-label">Anmeldung</p>
        <h1>Bestätigt. Danke.</h1>
        <p className="xlegal-lead">
          Ihre Adresse ist bestätigt. Sie erhalten die Start- und
          Onboarding-Informationen, sobald es so weit ist.
        </p>
        <div className="xlegal-warning">
          <strong>Jederzeit widerrufbar</strong>
          <p>
            Sie können die Einwilligung jederzeit mit Wirkung für die Zukunft
            widerrufen — formlos per E-Mail an{" "}
            <a href="mailto:info@x-portal.eu?subject=Widerruf%20Whitelist">
              info@x-portal.eu
            </a>{" "}
            oder über das <Link href="/contact">Kontaktformular</Link>.
          </p>
        </div>
      </Frame>
    );
  }

  if (result === "expired") {
    return (
      <Frame>
        <p className="xhome-label">Anmeldung</p>
        <h1>Dieser Link ist abgelaufen.</h1>
        <p className="xlegal-lead">
          Ein Bestätigungslink gilt {CONFIRMATION_TTL_HOURS} Stunden. Tragen Sie
          sich bitte erneut ein, dann senden wir einen neuen.
        </p>
        <p className="contact-note">
          <Link href="/cardano#access">Zur Anmeldung</Link>
        </p>
      </Frame>
    );
  }

  if (result === "unknown") {
    return (
      <Frame>
        <p className="xhome-label">Anmeldung</p>
        <h1>Dieser Link führt nirgendwohin.</h1>
        <p className="xlegal-lead">
          Der Bestätigungslink ist unvollständig, wurde bereits verwendet oder
          gehört zu einem gelöschten Eintrag.
        </p>
        <p className="contact-note">
          <Link href="/cardano#access">Zur Anmeldung</Link>
        </p>
      </Frame>
    );
  }

  if (result === "error") {
    return (
      <Frame>
        <p className="xhome-label">Anmeldung</p>
        <h1>Das hat gerade nicht geklappt.</h1>
        <p className="xlegal-lead">
          Bitte versuchen Sie es später erneut oder schreiben Sie uns über das{" "}
          <Link href="/contact">Kontaktformular</Link>.
        </p>
      </Frame>
    );
  }

  if (!token) {
    return (
      <Frame>
        <p className="xhome-label">Anmeldung</p>
        <h1>Hier fehlt der Bestätigungslink.</h1>
        <p className="xlegal-lead">
          Öffnen Sie den vollständigen Link aus unserer E-Mail. Manche
          Mailprogramme kürzen lange Adressen beim Weiterleiten.
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <p className="xhome-label">Anmeldung</p>
      <h1>Noch ein Klick.</h1>
      <p className="xlegal-lead">
        Bestätigen Sie, dass Sie die XPORTAL-Informationen an diese Adresse
        erhalten möchten. Ohne diesen Schritt senden wir Ihnen nichts.
      </p>

      <form
        className="contact-form"
        action="/api/whitelist/confirm"
        method="post"
      >
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="contact-submit">
          Anmeldung bestätigen
        </button>
      </form>

      <p className="contact-note">
        Sie haben sich nicht eingetragen? Dann tun Sie nichts. Ohne Bestätigung
        senden wir nichts, und der Eintrag wird nach 30 Tagen gelöscht. Wie wir
        die Angaben verarbeiten, steht in Abschnitt 6 der{" "}
        <Link href="/privacy">Datenschutzhinweise</Link>.
      </p>
    </Frame>
  );
}
