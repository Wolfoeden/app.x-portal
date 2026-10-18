import type { Metadata } from "next";

import styles from "@/components/marketing/marketing.module.css";
import { PraxisView } from "@/components/praxis/PraxisView";
import { PublicFooter, PublicFrame, PublicHeader } from "@/components/public/PublicChrome";
import { praxisCases } from "@/lib/marketing/praxis-cases";
import { activeProfileCount } from "@/lib/marketing/profile-count";
import { nextCallSlots } from "@/lib/sales/call-slots";
import { salesCallUrl } from "@/lib/sales/sales-call";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Wie besprochen: so arbeiten andere Unternehmen schon mit KI | XPORTAL",
  description: "Drei Beispiele aus der Praxis – Vodafone, Lufthansa Industry Solutions und unser Talent Index – und ein Termin für das Erstgespräch.",
  alternates: { canonical: absoluteUrl("/praxis") },
  robots: { index: false, follow: false },
};

/** Die freien Zeiten sind ohnehin 5 Minuten gecacht (lib/sales/call-slots.ts). */
export const revalidate = 300;

/**
 * Die Seite hinter dem Link in der Mail nach dem Anruf (Entwurf 3,
 * 16.10.2026). Für alle Firmen gleich; das Kürzel `?t=` ordnet Aufruf,
 * Interesse und Kalenderklick im Admin dem CRM-Kontakt zu. Ohne Kürzel
 * zählt der Aufruf ohne Zuordnung.
 *
 * Seit 18.10.2026 statisch (alle 5 Minuten neu, mit frischen Terminen):
 * Das Kürzel liest `PraxisView` im Browser und meldet den Aufruf an
 * /api/praxis/event; dort wird es geprüft und der Betreiber ausgenommen.
 */
export default async function PraxisPage() {
  const [profiles, slots] = await Promise.all([activeProfileCount(), nextCallSlots()]);

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">Zum Inhalt</a>
      <PublicHeader framed />
      <PublicFrame>
        <main id="main-content" tabIndex={-1}>
          <PraxisView
            cases={praxisCases(profiles)}
            slots={slots}
            calendarBase={salesCallUrl()}
          />
        </main>
      </PublicFrame>
      <PublicFooter framed />
    </div>
  );
}
