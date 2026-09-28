import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/styles/legal.css";

import {
  PublicDocumentIntro,
  PublicFooter,
  PublicHeader,
} from "@/components/public/PublicChrome";
import { Notice } from "@/components/ui/Primitives";
import { PLACEMENT_TERMS, placementRequestsEnabled } from "@/lib/placement/config";

export const metadata: Metadata = {
  title: "Vermittlungsbedingungen | XPORTAL",
  description:
    "Wann bei einer Vermittlung über XPORTAL ein Honorar anfällt: nur bei Beauftragung, einmalig.",
  // Solange die Fassung ein Entwurf ist, gehört sie in keinen Suchindex.
  robots:
    PLACEMENT_TERMS.status === "approved"
      ? undefined
      : { index: false, follow: false },
};

/**
 * Die Bedingungen, denen ein Kunde bei jeder Anfrage zustimmt.
 *
 * Ohne den Schalter gibt es die Seite nicht: Sie beschreibt ein Verfahren,
 * das es dann nicht gibt. Die Zahlen kommen aus `lib/placement/config.ts`,
 * damit Seite, Anfrage-Dialog und Rechnung nicht auseinanderlaufen können.
 */
export default function PlacementTermsPage() {
  if (!placementRequestsEnabled()) notFound();
  const t = PLACEMENT_TERMS;
  const draft = t.status !== "approved";

  return (
    <div className="xlegal" lang="de">
      <PublicHeader context={`Vermittlungsbedingungen · ${t.version}`} />

      <main className="xlegal-document">
        <PublicDocumentIntro
          eyebrow="Vermittlungsbedingungen"
          title="Kostenlos bis zur Beauftragung."
          signal={{ label: "Status", value: draft ? "Entwurf" : "Gültig" }}
        >
          <p>
            Diese Bedingungen gelten, wenn Sie über XPORTAL einen Freelancer
            anfragen und XPORTAL Sie vorstellt. Sie ergänzen die{" "}
            <Link href="/terms">Allgemeinen Geschäftsbedingungen</Link> und
            richten sich ausschließlich an Unternehmer.
          </p>
        </PublicDocumentIntro>

        {draft ? (
          <Notice title="Entwurf" tone="warning" role="status">
            <p>
              Diese Fassung ist noch nicht rechtlich geprüft. Sie wird vor der
              Freigabe überarbeitet und gilt erst, wenn hier „Gültig“ steht.
            </p>
          </Notice>
        ) : null}

        <section>
          <h2>1. Worum es geht</h2>
          <div>
            <p>
              XPORTAL stellt Ihnen auf Ihre Anfrage einen Freelancer vor, den
              Sie in einem Suchergebnis ausgewählt haben. Einen Vertrag über
              die Leistung des Freelancers schließen Sie direkt mit ihm.
              XPORTAL wird nicht Partei dieses Vertrags.
            </p>
          </div>
        </section>

        <section>
          <h2>2. Anfrage und Vorstellung</h2>
          <div>
            <p>
              Mit dem Absenden einer Anfrage stimmen Sie diesen Bedingungen zu.
              XPORTAL speichert Zeitpunkt, Fassung, Projekt und Profil der
              Anfrage. Nach der Prüfung stellt XPORTAL Sie dem Freelancer per
              E-Mail vor und nennt Ihnen den Weg zum Erstgespräch. Dabei erhält
              der Freelancer Ihren Namen, Ihre E-Mail-Adresse und den Titel
              Ihres Projekts. Die Vorstellung ist der Nachweis der Vermittlung.
            </p>
            <p>
              Suche, Anfrage, Vorstellung und Erstgespräch sind kostenlos. Kommt
              keine Beauftragung zustande, entsteht kein Honorar.
            </p>
          </div>
        </section>

        <section>
          <h2>3. Vermittlungshonorar</h2>
          <div>
            <p>
              Beauftragen Sie einen vorgestellten Freelancer, schulden Sie
              XPORTAL einmalig {t.feePercent} % des vereinbarten Honorars für
              die ersten {t.feeMonths} Monate der Zusammenarbeit, höchstens für{" "}
              {t.maxFeeDays} Projekttage, jeweils netto zuzüglich der
              gesetzlichen Umsatzsteuer.
            </p>
            <p>
              Beispiel: Bei einem Tagessatz von 600 € und 60 Projekttagen in den
              ersten drei Monaten beträgt das Honorar 3.600 € netto.
            </p>
          </div>
        </section>

        <section>
          <h2>4. Meldung, Rechnung, Zahlung</h2>
          <div>
            <p>
              Sie teilen XPORTAL innerhalb von 14 Tagen nach der Beauftragung
              Beginn, Tagessatz und geplanten Umfang mit. XPORTAL stellt danach
              eine Rechnung; sie ist innerhalb von {t.paymentDays} Tagen zu
              zahlen. Ändert sich der Umfang in den ersten {t.feeMonths}{" "}
              Monaten, wird die Rechnung angepasst.
            </p>
          </div>
        </section>

        <section>
          <h2>5. Beauftragung ohne XPORTAL</h2>
          <div>
            <p>
              Das Honorar fällt auch an, wenn Sie einen vorgestellten
              Freelancer innerhalb von {t.protectionMonths} Monaten nach der
              Vorstellung direkt, über Dritte oder für ein anderes Projekt
              beauftragen.
            </p>
          </div>
        </section>

        <section>
          <h2>6. Was XPORTAL nicht übernimmt</h2>
          <div>
            <p>
              XPORTAL schuldet keinen Vermittlungserfolg und keine bestimmte
              Leistung des Freelancers. Die Beurteilung der Zusammenarbeit,
              etwa zur Scheinselbständigkeit, bleibt bei Ihnen, wie in
              Abschnitt 10 der{" "}
              <Link href="/terms">Allgemeinen Geschäftsbedingungen</Link>{" "}
              beschrieben.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
