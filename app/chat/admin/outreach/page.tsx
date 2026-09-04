import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  AdminDisclosure,
  AdminMetricStrip,
  AdminPageHeader,
  AdminSectionHeader,
} from "@/components/admin/AdminDataPrimitives";
import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  ART14_DEADLINE_DAYS,
  ART14_WARNING_DAYS,
  OUTREACH_STATE_LABELS,
  type OutreachState,
} from "@/lib/freelancer/outreach-deadline";
import { listSearchRuns } from "@/lib/freelancer/sourced-candidate-import";
import {
  listSourcedCandidates,
  summarizeOutreach,
} from "@/lib/freelancer/sourced-candidates-data";

import { SearchRunsPanel } from "./SearchRunsPanel";
import styles from "./outreach.module.css";

export const metadata: Metadata = {
  title: "Informationspflicht | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

const badgeClass: Record<OutreachState, string> = {
  overdue: styles.badgeOverdue,
  warning: styles.badgeWarning,
  open: styles.badgeOpen,
  informed: styles.badgeInformed,
};

function formatDate(value: string | Date | null): string {
  if (!value) return "–";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "–" : dateFormat.format(date);
}

function remainingLabel(state: OutreachState, remainingDays: number): string {
  if (state === "informed") return "–";
  if (remainingDays < 0) {
    const late = Math.abs(remainingDays);
    return `${late} ${late === 1 ? "Tag" : "Tage"} überfällig`;
  }
  if (remainingDays === 0) return "heute fällig";
  return `noch ${remainingDays} ${remainingDays === 1 ? "Tag" : "Tage"}`;
}

function sourceLabel(url: string, index: number): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return `Quelle ${index + 1}`;
  }
}

/**
 * Die Arbeitsliste für die Informationspflicht nach Art. 14 DSGVO.
 *
 * Recherchierte Profile stammen nicht von den betroffenen Personen selbst.
 * Diese Personen sind zu informieren, spätestens einen Monat nach der
 * Erhebung. Der Text dafür entsteht in `lib/freelancer/outreach.ts`, verschickt
 * wird er von einem Menschen — bis hierher gab es aber keine Stelle, an der zu
 * sehen war, für wen die Frist gerade läuft.
 */
export default async function OutreachDeadlinesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  // Nebenlaeufig: Zwei Listen, die nichts voneinander wissen.
  const [candidates, searchRuns] = await Promise.all([
    listSourcedCandidates(),
    // Ein Fehler beim Lesen der Suchlaeufe darf die Fristenliste
    // nicht mitnehmen — die ist die rechtlich wichtigere.
    listSearchRuns().catch(() => []),
  ]);
  const summary = summarizeOutreach(candidates);

  await writeAuditEvent({
    actorUserId: currentUser.id,
    action: "outreach_deadlines_admin_viewed",
    targetType: "freelancer_application",
    outcome: "success",
    metadata: {
      listed: summary.total,
      overdue: summary.overdue,
      warning: summary.warning,
    },
    required: true,
  });

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <AdminPageHeader
          eyebrow="Admin / Betrieb"
          title="Informationspflicht"
          description={
            <p>
              Recherchierte Personen nach Dringlichkeit. Offene Art.-14-Fristen
              stehen vor bereits informierten Fällen; fehlende Erhebungsdaten
              werden als sofortiger Prüfpunkt behandelt.
            </p>
          }
        />

        <AdminMetricStrip
          label="Fristenlage"
          items={[
            {
              label: "Überfällig",
              value: summary.overdue,
              detail: "sofort prüfen",
              tone: summary.overdue ? "danger" : "default",
            },
            {
              label: "Frist knapp",
              value: summary.warning,
              detail: `ab Tag ${ART14_WARNING_DAYS}`,
              tone: summary.warning ? "warning" : "default",
            },
            {
              label: "Frist läuft",
              value: summary.open,
              detail: "noch ohne Handlungsdruck",
            },
            {
              label: "Informiert",
              value: summary.informed,
              detail: "abgeschlossen",
              tone: "accent",
            },
          ]}
        />

        <AdminDisclosure
          title="Fristlogik und Abschluss"
          summary={`Information spätestens ${ART14_DEADLINE_DAYS} Tage nach Recherche`}
        >
          <p>
            Die Frist endet, wenn die Person informiert und der Zeitpunkt in{" "}
            <code>outreach_sent_at</code> dokumentiert wurde. Alternativ löscht{" "}
            <code>run_sourced_candidate_cleanup()</code> nicht eingewilligte
            Rechercheprofile nach {ART14_DEADLINE_DAYS} Tagen. Eine Löschung ist
            nicht mit einer erfolgten Information gleichzusetzen.
          </p>
        </AdminDisclosure>

        <AdminSectionHeader
          title="Fristenliste"
          description="Offene Fälle nach Dringlichkeit, informierte Fälle anschließend nach Fälligkeit."
          aside={`${summary.total} Personen`}
        />

        {/* Zuerst die Quelle, dann die Frist: Aus einem Suchlauf werden
            Kandidaten, und erst dadurch beginnt die Liste darunter zu laufen. */}
        <h2 className={styles.sectionTitle}>Bezahlte Suchläufe</h2>
        <div className={styles.panel}>
          <SearchRunsPanel runs={searchRuns} />
        </div>

        <h2 className={styles.sectionTitle}>Offene Fristen</h2>
        <div className={styles.panel}>
          {candidates.length ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Frist</th>
                    <th scope="col">Status</th>
                    <th scope="col">Recherchiert</th>
                    <th scope="col">Fällig</th>
                    <th scope="col">Quellen</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.id} data-state={candidate.deadline.state}>
                      <td data-label="Person">
                        <div className={styles.name}>{candidate.full_name}</div>
                        <div className={styles.role}>{candidate.role_title}</div>
                      </td>
                      <td className={styles.days} data-label="Frist">
                        {candidate.sourced_at
                          ? remainingLabel(
                              candidate.deadline.state,
                              candidate.deadline.remainingDays,
                            )
                          : "Erhebungsdatum fehlt"}
                      </td>
                      <td data-label="Status">
                        <span
                          className={`${styles.badge} ${
                            badgeClass[candidate.deadline.state]
                          }`}
                        >
                          {OUTREACH_STATE_LABELS[candidate.deadline.state]}
                        </span>
                      </td>
                      <td className={styles.days} data-label="Recherchiert">
                        {formatDate(candidate.sourced_at)}
                      </td>
                      <td className={styles.days} data-label="Fällig">
                        {formatDate(candidate.deadline.dueAt)}
                      </td>
                      <td data-label="Quellen">
                        <div className={styles.sources}>
                          {(candidate.source_urls ?? []).slice(0, 3).map((url, index) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer nofollow"
                            >
                              {sourceLabel(url, index)}
                            </a>
                          ))}
                          {!candidate.source_urls?.length ? "–" : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.empty}>
              Keine offenen Fälle. Es liegt derzeit kein recherchierter Kandidat
              ohne Einwilligung vor.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
