import type { Metadata } from "next";
import { after } from "next/server";

import styles from "@/components/marketing/marketing.module.css";
import { PraxisView } from "@/components/praxis/PraxisView";
import { PublicFooter, PublicFrame, PublicHeader } from "@/components/public/PublicChrome";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { praxisCases } from "@/lib/marketing/praxis-cases";
import { activeProfileCount } from "@/lib/marketing/profile-count";
import { nextCallSlots } from "@/lib/sales/call-slots";
import { readPraxisToken } from "@/lib/sales/praxis";
import { salesCallUrl } from "@/lib/sales/sales-call";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Wie besprochen: so arbeiten andere Unternehmen schon mit KI | XPORTAL",
  description: "Drei Beispiele aus der Praxis – Vodafone, Lufthansa Industry Solutions und unser Talent Index – und ein Termin für das Erstgespräch.",
  alternates: { canonical: absoluteUrl("/praxis") },
  robots: { index: false, follow: false },
};

type Query = Record<string, string | string[] | undefined>;

/**
 * Die Seite hinter dem Link in der Mail nach dem Anruf (Entwurf 3,
 * 16.10.2026). Für alle Firmen gleich; das Kürzel `?t=` ordnet Aufruf,
 * Interesse und Kalenderklick im Admin dem CRM-Kontakt zu. Ohne Kürzel
 * zählt der Aufruf ohne Zuordnung.
 */
export default async function PraxisPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const raw = Array.isArray(params.t) ? params.t[0] : params.t;
  const contactId = readPraxisToken(raw);
  const token = contactId ? raw!.trim() : null;
  const [profiles, slots, user] = await Promise.all([
    activeProfileCount(),
    nextCallSlots(),
    getCurrentUser().catch(() => null),
  ]);

  // Der Betreiber, der seinen eigenen Link prüft, zählt nicht als Aufruf.
  if (!user?.isAdmin) after(() =>
    writeAuditEvent({
      actorUserId: null,
      action: "praxis_viewed",
      targetType: "crm_contacts",
      targetId: contactId,
      outcome: "success",
      metadata: { linked: Boolean(contactId), slots: slots.length },
    }).catch(() => undefined),
  );

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
            token={token}
          />
        </main>
      </PublicFrame>
      <PublicFooter framed />
    </div>
  );
}
