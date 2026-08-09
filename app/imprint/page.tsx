import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Imprint | XPORTAL",
  description: "Impressum und Anbieterangaben der XPORTAL Website.",
};

export default function ImprintPage() {
  return (
    <main className="xlegal" lang="de">
      <header className="xlegal-header">
        <Link href="/home" className="xlegal-wordmark">XPORTAL</Link>
        <span>IMPRINT / 01</span>
      </header>

      <article className="xlegal-document">
        <p className="xhome-label">Imprint</p>
        <h1>Impressum</h1>
        <p className="xlegal-lead">
          Angaben gemäß § 5 DDG
        </p>

        <section>
          <h2>300</h2>
          <p>
            Inhaber: Roman Dering<br />
            Einzelunternehmen
          </p>
          <p>
            Heilig-Kreuz-Straße 18<br />
            87600 Kaufbeuren<br />
            Deutschland
          </p>
        </section>

        <section>
          <h2>Kontakt</h2>
          <p>
            E-Mail: <a href="mailto:info@x-portal.eu">info@x-portal.eu</a>
          </p>
        </section>

        <section>
          <h2>Umsatzsteuer-Identifikationsnummer</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG:<br />
            DE459643156
          </p>
        </section>

        <p className="xlegal-updated">Stand: 9. August 2026</p>
      </article>

      <footer className="xlegal-footer">
        <Link href="/home">Zurück zu XPORTAL</Link>
        <Link href="/privacy">Datenschutz</Link>
      </footer>
    </main>
  );
}
