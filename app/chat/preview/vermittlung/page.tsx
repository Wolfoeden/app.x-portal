import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EngagementPanel } from "@/app/chat/admin/vermittlungen/EngagementPanel";
import styles from "@/app/chat/admin/vermittlungen/vermittlungen.module.css";
import type { PlacementRequestRow } from "@/lib/placement/requests";

export const metadata: Metadata = {
  title: "Vermittlung Vorschau | XPORTAL",
  robots: { index: false, follow: false },
};

const base: PlacementRequestRow = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "ready_to_book",
  requestedAt: "2026-09-30T08:00:00.000Z",
  confirmedAt: "2026-09-30T09:00:00.000Z",
  cancelledAt: null,
  projectTitle: "KI-Automatisierung für den Einkauf",
  clientEmail: "recruiting@beispiel-gmbh.de",
  clientName: "Alex Muster",
  freelancerId: "22222222-2222-4222-8222-222222222222",
  freelancerName: "Kim Beispiel",
  freelancerRole: "KI / Full Stack / Cloud",
  freelancerReachable: true,
  hasCalendar: false,
  outcome: "engaged",
  outcomeSource: "client",
  followUpCount: 1,
  lastFollowUpAt: "2026-10-14T08:00:00.000Z",
  followUpDue: null,
  engagement: {
    dayRateMinor: 60_000,
    projectDays: 60,
    startsOn: "2026-11-02",
    feeMinor: 360_000,
    feeStatus: "open",
    invoiceReference: null,
    termsVersion: "vermittlung-2026-09-1",
    invoiceUrl: null,
    invoicePdfUrl: null,
    invoiceDueOn: null,
    viaStripe: false,
    billingCompany: null,
    billingEmail: null,
  },
};

/**
 * Das echte Panel „Beauftragung und Rechnung“ mit Testdaten, nur in der
 * Entwicklung: offen (Rechnungsformular) und über Stripe gestellt.
 */
export default function PlacementPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const invoiced: PlacementRequestRow = {
    ...base,
    id: "33333333-3333-4333-8333-333333333333",
    engagement: {
      ...base.engagement!,
      feeStatus: "invoiced",
      invoiceReference: "XP-2026-0001",
      invoiceUrl: "https://invoice.stripe.com/i/beispiel",
      invoicePdfUrl: "https://pay.stripe.com/invoice/beispiel/pdf",
      invoiceDueOn: "2026-11-16",
      viaStripe: true,
      billingCompany: "Beispiel GmbH",
      billingEmail: "buchhaltung@beispiel-gmbh.de",
    },
  };
  return (
    <main data-admin-surface style={{ maxWidth: 880, margin: "32px auto", padding: "0 20px", display: "grid", gap: 20 }}>
      {[base, invoiced].map((row) => (
        <article key={row.id} className={styles.card}>
          <header className={styles.cardHead}>
            <div>
              <h3>{row.freelancerName}</h3>
              <p>{row.freelancerRole} · {row.projectTitle}</p>
            </div>
            <span className={styles.status} data-status={row.status}>Vorgestellt</span>
          </header>
          <EngagementPanel row={row} invoicingReady />
        </article>
      ))}
    </main>
  );
}
