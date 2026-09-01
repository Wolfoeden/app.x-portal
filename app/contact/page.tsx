import type { Metadata } from "next";
import Link from "next/link";

import { CaptchaField } from "@/components/CaptchaField";
import { CONTACT_RESPONSE_PROMISE } from "@/lib/legal/policy";

export const metadata: Metadata = {
  title: "Kontakt | XPORTAL",
  description:
    "Direkter Kontaktweg zu XPORTAL mit zugesagter Reaktionszeit von einem Werktag.",
};

type Status = "sent" | "error" | "invalid";

function statusOf(value: string | string[] | undefined): Status | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "sent" || raw === "error" || raw === "invalid" ? raw : null;
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const status = statusOf((await searchParams).status);

  return (
    <main className="xlegal" lang="de">
      <header className="xlegal-header">
        <Link href="/chat" className="xlegal-wordmark">XPORTAL</Link>
        <span>KONTAKT / 01</span>
      </header>

      <article className="xlegal-document">
        <p className="xhome-label">Kontakt</p>
        <h1>Schreiben Sie uns.</h1>
        <p className="xlegal-lead">
          Für Fragen zum Produkt, zu einem Vertrag, zu Ihren Daten oder zu einem
          Profil im Portal. {CONTACT_RESPONSE_PROMISE}
        </p>

        {status === "sent" ? (
          <div className="xlegal-warning" role="status">
            <strong>Eingegangen</strong>
            <p>
              Ihre Nachricht ist angekommen. {CONTACT_RESPONSE_PROMISE} Eine
              Kopie versenden wir nicht — notieren Sie sich Ihr Anliegen bei
              Bedarf selbst.
            </p>
          </div>
        ) : null}

        {status === "invalid" ? (
          <div className="xlegal-warning" role="alert">
            <strong>Bitte prüfen</strong>
            <p>
              Eine Angabe fehlt oder ist zu kurz. Name ab 2 Zeichen, Betreff ab
              3 Zeichen, Nachricht ab 20 Zeichen, dazu eine gültige
              E-Mail-Adresse.
            </p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="xlegal-warning" role="alert">
            <strong>Nicht gespeichert</strong>
            <p>
              Die Nachricht konnte gerade nicht entgegengenommen werden. Bitte
              versuchen Sie es später erneut oder schreiben Sie direkt an{" "}
              <a href="mailto:info@x-portal.eu">info@x-portal.eu</a>.
            </p>
          </div>
        ) : null}

        <form
          id="formular"
          className="contact-form"
          action="/api/contact"
          method="post"
        >
          <label>
            <span>Name</span>
            <input
              name="fullName"
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
            />
          </label>
          <label>
            <span>E-Mail-Adresse</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={160}
              required
            />
          </label>
          <label>
            <span>Betreff</span>
            <input name="subject" minLength={3} maxLength={150} required />
          </label>
          <label>
            <span>Nachricht</span>
            <textarea name="message" rows={8} minLength={20} maxLength={5000} required />
          </label>

          <div className="contact-honeypot" aria-hidden="true">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <CaptchaField />
          <button type="submit" className="contact-submit">
            Nachricht senden
          </button>
        </form>

        <p className="contact-note">
          Wir verarbeiten Ihre Angaben ausschließlich, um dieses Anliegen zu
          bearbeiten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO bei einem
          vertraglichen Anliegen, sonst Art. 6 Abs. 1 lit. f DSGVO. Einzelheiten
          in Abschnitt 8 der{" "}
          <Link href="/privacy">Datenschutzhinweise</Link>. Bitte senden Sie
          über dieses Formular keine besonderen Kategorien personenbezogener
          Daten.
        </p>
      </article>

      <footer className="xlegal-footer">
        <Link href="/chat">Zurück zu XPORTAL</Link>
        <span>
          <Link href="/imprint">Impressum</Link>
          {" · "}
          <Link href="/terms">AGB</Link>
          {" · "}
          <Link href="/privacy">Datenschutz</Link>
        </span>
      </footer>
    </main>
  );
}
