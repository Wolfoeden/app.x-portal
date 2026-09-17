import type { Metadata } from "next";
import Link from "next/link";
import "@/app/styles/legal.css";

import {
  PublicDocumentIntro,
  PublicFooter,
  PublicHeader,
} from "@/components/public/PublicChrome";
import { CONTACT_RESPONSE_PROMISE } from "@/lib/legal/policy";

export const metadata: Metadata = {
  title: "Impressum | XPORTAL",
  description: "Impressum und Anbieterangaben der XPORTAL Website.",
};

export default function ImprintPage() {
  return (
    <div className="xlegal" lang="de">
      <PublicHeader context="Impressum" />

      <main className="xlegal-document">
        <PublicDocumentIntro
          eyebrow="Anbieterangaben"
          title="Impressum"
          signal={{ label: "Anbieter", value: "Einzelunternehmen" }}
        >
          <p>Angaben gemäß § 5 DDG</p>
        </PublicDocumentIntro>

        <section>
          <h2>Anbieter</h2>
          <p>
            XPORTAL — 300, Inhaber Roman Dering<br />
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
          <p>
            Kontaktformular: <Link href="/contact">x-portal.eu/contact</Link>
          </p>
          <p>
            {CONTACT_RESPONSE_PROMISE} Beide Wege führen zur selben Stelle; das
            Formular ist der schnellere, weil es direkt im Betrieb landet.
          </p>
        </section>

        <section>
          <h2>Angebot</h2>
          <p>
            XPORTAL richtet sich ausschließlich an Unternehmer im Sinne des
            § 14 BGB. Ein Angebot an Verbraucher erfolgt nicht. Es gelten die{" "}
            <Link href="/terms">Allgemeinen Geschäftsbedingungen</Link>.
          </p>
        </section>

        <section>
          <h2>Umsatzsteuer-Identifikationsnummer</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG:<br />
            DE459643156
          </p>
        </section>

        <section>
          <h2>Streitbeilegung</h2>
          <p>
            Wir sind bereit, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen. Zuständig ist die
            Universalschlichtungsstelle des Bundes, Zentrum für Schlichtung
            e.V., Straßburger Straße 8, 77694 Kehl am Rhein,{" "}
            <a href="https://www.universalschlichtungsstelle.de" target="_blank" rel="noreferrer">www.universalschlichtungsstelle.de</a>.
          </p>
        </section>

        <p className="xlegal-updated">Stand: 17. September 2026</p>
      </main>

      <PublicFooter />
    </div>
  );
}
