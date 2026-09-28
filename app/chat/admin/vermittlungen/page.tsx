import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  AdminPageHeader,
  AdminSectionHeader,
  AdminSurface,
} from "@/components/admin/AdminDataPrimitives";
import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PLACEMENT_TERMS, placementRequestsEnabled } from "@/lib/placement/config";
import { listPlacementRequests, type PlacementRequestRow } from "@/lib/placement/requests";

import { RequestActions } from "./RequestActions";
import styles from "./vermittlungen.module.css";

export const metadata: Metadata = {
  title: "Vermittlungen | XPORTAL Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

const STATUS_LABELS: Record<PlacementRequestRow["status"], string> = {
  requested: "Angefragt",
  manual_review: "Wartet auf Vorstellung",
  ready_to_book: "Vorgestellt",
  booked: "Termin gebucht",
  completed: "Gespräch geführt",
  cancelled: "Abgelehnt",
};

function RequestCard({ row }: { row: PlacementRequestRow }) {
  const open = row.status === "manual_review";
  return (
    <article className={styles.card} data-open={open}>
      <header className={styles.cardHead}>
        <div>
          <h3>{row.freelancerName}</h3>
          <p>{row.freelancerRole}</p>
        </div>
        <span className={styles.status} data-status={row.status}>{STATUS_LABELS[row.status]}</span>
      </header>
      <dl className={styles.facts}>
        <div><dt>Projekt</dt><dd>{row.projectTitle ?? "ohne Titel"}</dd></div>
        <div><dt>Kunde</dt><dd>{row.clientName ? `${row.clientName}, ` : ""}{row.clientEmail ?? "ohne E-Mail"}</dd></div>
        <div><dt>Angefragt</dt><dd>{dateTime.format(new Date(row.requestedAt))}</dd></div>
        <div>
          <dt>Freelancer erreichbar</dt>
          <dd className={row.freelancerReachable ? undefined : styles.missing}>
            {row.freelancerReachable ? "E-Mail vorhanden" : "Keine E-Mail im System"}
          </dd>
        </div>
        <div><dt>Kalender</dt><dd>{row.hasCalendar ? "Link hinterlegt" : "kein Link"}</dd></div>
        {row.confirmedAt ? <div><dt>Vorgestellt</dt><dd>{dateTime.format(new Date(row.confirmedAt))}</dd></div> : null}
      </dl>
      {open ? (
        <RequestActions
          requestId={row.id}
          freelancerName={row.freelancerName}
          freelancerReachable={row.freelancerReachable}
        />
      ) : null}
    </article>
  );
}

/**
 * Die Anfragen aus dem Vermittlungsmodell.
 *
 * Jede Anfrage hat der Kunde mit Zustimmung zu den Vermittlungsbedingungen
 * gestellt. Erst „Vorstellen“ gibt den Kalender frei und schreibt beiden
 * Seiten; das ist der Nachweis, auf dem ein späteres Honorar beruht.
 */
export default async function PlacementRequestsPage() {
  if (!placementRequestsEnabled()) notFound();
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const rows = await listPlacementRequests();
  const open = rows.filter((row) => row.status === "manual_review");
  const done = rows.filter((row) => row.status !== "manual_review");

  return (
    <AdminSurface label="Administration · Vermittlungen">
      <AdminPageHeader
        eyebrow="Admin / Vermittlungen"
        title="Vermittlungen"
        description={
          <p>
            Anfragen, denen der Kunde mit den Vermittlungsbedingungen ({PLACEMENT_TERMS.version})
            zugestimmt hat. „Vorstellen“ schickt beiden Seiten eine Mail und gibt den Kalender frei.
          </p>
        }
      />
      {PLACEMENT_TERMS.status !== "approved" ? (
        <p className={styles.draft}>
          Die Vermittlungsbedingungen sind ein Entwurf. Vor dem Einschalten für Kunden rechtlich prüfen lassen.
        </p>
      ) : null}

      <AdminSectionHeader title={`Wartet auf Vorstellung (${open.length})`} />
      {open.length ? (
        <div className={styles.list}>{open.map((row) => <RequestCard key={row.id} row={row} />)}</div>
      ) : (
        <p className={styles.empty}>Keine offene Anfrage.</p>
      )}

      <AdminSectionHeader title={`Bearbeitet (${done.length})`} description="Die letzten 100 Anfragen." />
      {done.length ? (
        <div className={styles.list}>{done.map((row) => <RequestCard key={row.id} row={row} />)}</div>
      ) : (
        <p className={styles.empty}>Noch nichts bearbeitet.</p>
      )}
    </AdminSurface>
  );
}
