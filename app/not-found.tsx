import type { Metadata } from "next";
import Link from "next/link";
import "@/app/styles/legal.css";
import {
  PublicDocumentIntro,
  PublicFooter,
  PublicHeader,
} from "@/components/public/PublicChrome";

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
    <div className="xlegal" lang="de">
      <PublicHeader context="404 · Seite nicht gefunden" />

      <main className="xlegal-document">
        <PublicDocumentIntro
          eyebrow="Nicht gefunden"
          title="Diese Seite gibt es nicht."
          signal={{ label: "Route", value: "404" }}
        >
          <p>
            Möglicherweise wurde die Adresse geändert, oder beim Kopieren ist ein
            Teil verloren gegangen.
          </p>
        </PublicDocumentIntro>

        <div className="booking-actions">
          <Link className="booking-continue" href="/chat">
            Zur Freelancer-Suche
          </Link>
          <Link href="/contact">Etwas melden</Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
