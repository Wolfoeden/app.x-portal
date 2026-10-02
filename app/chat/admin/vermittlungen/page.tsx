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
import { PLACEMENT_OUTCOME_LABELS } from "@/lib/placement/follow-up-rules";
import { placementInvoicingReady } from "@/lib/placement/invoices";
import {
  MANDATE_STATUS_LABELS,
  OPEN_MANDATE_STATUSES,
  mandateAge,
  mandateMailDraft,
} from "@/lib/placement/mandate-model";
import { listMandates, type MandateWithWork, type ProfileOption } from "@/lib/placement/mandates";
import { listPlacementRequests, type PlacementRequestRow } from "@/lib/placement/requests";

import { EngagementPanel, FollowUpsButton } from "./EngagementPanel";
import { MandatePanel } from "./MandatePanel";
import { RequestActions } from "./RequestActions";
import styles from "./vermittlungen.module.css";

export const metadata: Metadata = {
  title: "Vermittlungen | XPORTAL Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

const INTRODUCED = new Set(["ready_to_book", "booked", "completed"]);

const STATUS_LABELS: Record<PlacementRequestRow["status"], string> = {
  requested: "Angefragt",
  manual_review: "Wartet auf Vorstellung",
  ready_to_book: "Vorgestellt",
  booked: "Termin gebucht",
  completed: "Gespräch geführt",
  cancelled: "Abgelehnt",
};

/**
 * Beide Seiten werden getrennt gefragt. Sagt eine „beauftragt“ und die andere
 * „nein“, ist das der Fall, in dem ein Honorar verloren gehen kann.
 */
function answersConflict(row: PlacementRequestRow): boolean {
  const answers = [row.clientAnswer, row.freelancerAnswer];
  return answers.includes("engaged") && answers.includes("no_engagement");
}

function RequestCard({ row, invoicingReady }: { row: PlacementRequestRow; invoicingReady: boolean }) {
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
        <div>
          <dt>Kunde</dt>
          <dd className={row.clientIsGuest ? styles.missing : undefined}>
            {row.clientCompany ? `${row.clientCompany}, ` : ""}
            {row.clientName ? `${row.clientName}, ` : ""}
            {row.clientEmail ?? "ohne E-Mail"}
            {row.clientIsGuest ? " · ohne Konto, E-Mail unbestätigt" : ""}
          </dd>
        </div>
        <div><dt>Angefragt</dt><dd>{dateTime.format(new Date(row.requestedAt))}</dd></div>
        <div>
          <dt>Freelancer erreichbar</dt>
          <dd className={row.freelancerReachable ? undefined : styles.missing}>
            {row.freelancerReachable ? "E-Mail vorhanden" : "Keine E-Mail im System"}
          </dd>
        </div>
        <div><dt>Kalender</dt><dd>{row.hasCalendar ? "Link hinterlegt" : "kein Link"}</dd></div>
        {row.confirmedAt ? <div><dt>Vorgestellt</dt><dd>{dateTime.format(new Date(row.confirmedAt))}</dd></div> : null}
        {INTRODUCED.has(row.status) ? (
          <div>
            <dt>Rückmeldung</dt>
            <dd className={answersConflict(row) ? styles.missing : undefined}>
              Kunde: {row.clientAnswer ? PLACEMENT_OUTCOME_LABELS[row.clientAnswer] : "noch keine"}
              {" · "}Freelancer: {row.freelancerAnswer ? PLACEMENT_OUTCOME_LABELS[row.freelancerAnswer] : "noch keine"}
              {row.outcomeSource === "operator" && row.outcome ? ` · Betreiber: ${PLACEMENT_OUTCOME_LABELS[row.outcome]}` : ""}
              {answersConflict(row) ? " · Widerspruch, bitte klären" : ""}
            </dd>
          </div>
        ) : null}
        {INTRODUCED.has(row.status) ? (
          <div>
            <dt>Nachfragen</dt>
            <dd className={row.followUpDue ? styles.missing : undefined}>
              {row.followUpCount} von 2
              {row.lastFollowUpAt ? `, zuletzt ${dateTime.format(new Date(row.lastFollowUpAt))}` : ""}
              {row.followUpDue ? " · fällig" : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      {open ? (
        <RequestActions
          requestId={row.id}
          freelancerName={row.freelancerName}
          freelancerReachable={row.freelancerReachable}
        />
      ) : null}
      {INTRODUCED.has(row.status) ? <EngagementPanel row={row} invoicingReady={invoicingReady} /> : null}
    </article>
  );
}

function MandateCard({
  mandate,
  profileOptions,
  now,
}: {
  mandate: MandateWithWork;
  profileOptions: ProfileOption[];
  now: Date;
}) {
  const open = (OPEN_MANDATE_STATUSES as readonly string[]).includes(mandate.status);
  return (
    <article className={styles.card} data-open={open}>
      <header className={styles.cardHead}>
        <div>
          <h3>{mandate.projectTitle ?? "Projekt ohne Titel"}</h3>
          <p>{mandate.briefSummary ?? "Keine strukturierten Anforderungen gespeichert."}</p>
        </div>
        <span className={styles.status} data-status={open ? "manual_review" : "ready_to_book"}>
          {MANDATE_STATUS_LABELS[mandate.status]}
        </span>
      </header>
      <dl className={styles.facts}>
        <div>
          <dt>Kunde</dt>
          <dd className={mandate.guest ? styles.missing : undefined}>
            {mandate.contactCompany ? `${mandate.contactCompany}, ` : ""}
            {mandate.contactName ? `${mandate.contactName}, ` : ""}
            {mandate.contactEmail}
            {mandate.contactPhone ? `, ${mandate.contactPhone}` : ""}
            {mandate.guest ? " · ohne Konto, E-Mail unbestätigt" : ""}
          </dd>
        </div>
        <div><dt>Eingegangen</dt><dd>{dateTime.format(new Date(mandate.createdAt))} ({mandateAge(mandate.createdAt, now)})</dd></div>
        {mandate.note ? <div><dt>Notiz</dt><dd>{mandate.note}</dd></div> : null}
        <div>
          <dt>Anfragen daraus</dt>
          <dd>
            {mandate.requests.length
              ? mandate.requests.map((request) => `${request.freelancerName} (${STATUS_LABELS[request.status as PlacementRequestRow["status"]] ?? request.status})`).join(", ")
              : "noch keine"}
          </dd>
        </div>
      </dl>
      <MandatePanel
        mandateId={mandate.id}
        status={mandate.status}
        candidates={mandate.candidates}
        profileOptions={profileOptions}
        contactEmail={mandate.contactEmail}
        draft={mandateMailDraft(mandate)}
      />
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

  const now = new Date();
  // Suchaufträge brauchen die Migration 20261003090000_suchauftraege. Fehlt
  // sie noch, soll die Seite trotzdem die Anfragen zeigen.
  const [rows, mandateResult] = await Promise.all([
    listPlacementRequests(),
    listMandates().then(
      (value) => ({ ok: true as const, ...value }),
      (error: unknown) => {
        console.error("search mandates unavailable", error);
        return { ok: false as const, mandates: [] as MandateWithWork[], profileOptions: [] as ProfileOption[] };
      },
    ),
  ]);
  const openMandates = mandateResult.mandates.filter((mandate) => (OPEN_MANDATE_STATUSES as readonly string[]).includes(mandate.status));
  const doneMandates = mandateResult.mandates.filter((mandate) => !(OPEN_MANDATE_STATUSES as readonly string[]).includes(mandate.status));
  const invoicingReady = placementInvoicingReady();
  const open = rows.filter((row) => row.status === "manual_review");
  const done = rows.filter((row) => row.status !== "manual_review");
  const due = rows.filter((row) => row.followUpDue).length;

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

      <FollowUpsButton due={due} />

      <AdminSectionHeader
        title={`Suchaufträge offen (${openMandates.length})`}
        description="„XPORTAL sucht für Sie“: Der Kunde hat den Vermittlungsbedingungen zugestimmt. Freelancer zuordnen, dann unten wie jede Anfrage vorstellen."
      />
      {!mandateResult.ok ? (
        <p className={styles.empty}>Suchaufträge sind noch nicht lesbar. Ist die Migration 20261003090000_suchauftraege eingespielt?</p>
      ) : openMandates.length ? (
        <div className={styles.list}>
          {openMandates.map((mandate) => (
            <MandateCard key={mandate.id} mandate={mandate} profileOptions={mandateResult.profileOptions} now={now} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Kein offener Suchauftrag.</p>
      )}

      <AdminSectionHeader title={`Wartet auf Vorstellung (${open.length})`} />
      {open.length ? (
        <div className={styles.list}>{open.map((row) => <RequestCard key={row.id} row={row} invoicingReady={invoicingReady} />)}</div>
      ) : (
        <p className={styles.empty}>Keine offene Anfrage.</p>
      )}

      <AdminSectionHeader
        title={`Bearbeitet (${done.length})`}
        description="Die letzten 100 Anfragen. Nach der Vorstellung hier Beauftragung, Rechnung und Zahlung festhalten."
      />
      {done.length ? (
        <div className={styles.list}>{done.map((row) => <RequestCard key={row.id} row={row} invoicingReady={invoicingReady} />)}</div>
      ) : (
        <p className={styles.empty}>Noch nichts bearbeitet.</p>
      )}

      {doneMandates.length ? (
        <>
          <AdminSectionHeader title={`Suchaufträge erledigt (${doneMandates.length})`} />
          <div className={styles.list}>
            {doneMandates.map((mandate) => (
              <MandateCard key={mandate.id} mandate={mandate} profileOptions={mandateResult.profileOptions} now={now} />
            ))}
          </div>
        </>
      ) : null}
    </AdminSurface>
  );
}
