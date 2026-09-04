import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AdminMetricStrip,
  AdminPageHeader,
  AdminSectionHeader,
} from "@/components/admin/AdminDataPrimitives";
import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  countApplicationsByStatus,
  listApplications,
  type ApplicationListItem,
} from "@/lib/freelancer/applications-data";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  AVAILABILITY_LABELS,
  type ApplicationStatus,
  type AvailabilityStatus,
} from "@/lib/freelancer/limits";

import styles from "./freelancers.module.css";

export const metadata: Metadata = {
  title: "Freelancer-Bewerbungen | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const badgeClass: Record<ApplicationStatus, string> = {
  submitted: styles.badgeSubmitted,
  in_review: styles.badgeInReview,
  approved: styles.badgeApproved,
  rejected: styles.badgeRejected,
};

function formatRate(
  minor: number | null,
  currency: string | null,
  suffix: string,
): string | null {
  if (minor === null || !currency) return null;
  return `${new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100)} ${suffix}`;
}

function rateSummary(row: ApplicationListItem): string {
  const parts = [
    formatRate(row.hourly_rate_minor, row.currency, "/ Std."),
    formatRate(row.day_rate_minor, row.currency, "/ Tag"),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "–";
}

function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export default async function FreelancerApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const params = await searchParams;
  const activeStatus =
    params.status && isApplicationStatus(params.status)
      ? params.status
      : undefined;

  const [applications, counts] = await Promise.all([
    listApplications({ status: activeStatus }),
    countApplicationsByStatus(),
  ]);

  await writeAuditEvent({
    actorUserId: currentUser.id,
    action: "freelancer_applications_admin_viewed",
    targetType: "freelancer_application",
    outcome: "success",
    metadata: { filter: activeStatus ?? "all", listed: applications.length },
    required: true,
  });

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <AdminPageHeader
          eyebrow="Admin / Arbeit"
          title="Bewerbungen"
          description={
            <p>
              Offene Entscheidungen zuerst: prüfen, vervollständigen und erst
              dann als sichtbares Profil für das Matching freigeben.
            </p>
          }
        />

        <AdminMetricStrip
          label="Bewerbungsstatus"
          items={[
            {
              label: "Neu eingegangen",
              value: counts.submitted,
              detail: "noch nicht geprüft",
              tone: counts.submitted ? "warning" : "muted",
            },
            {
              label: "In Prüfung",
              value: counts.in_review,
              detail: "aktive Entscheidungen",
              tone: counts.in_review ? "accent" : "muted",
            },
            {
              label: "Freigegeben",
              value: counts.approved,
              detail: "im Matching sichtbar",
            },
            {
              label: "Abgelehnt",
              value: counts.rejected,
              detail: "abgeschlossene Fälle",
              tone: "muted",
            },
          ]}
        />

        <nav className={styles.tabs} aria-label="Status-Filter">
          <Link
            href="/chat/admin/freelancers"
            className={`${styles.tab} ${activeStatus ? "" : styles.tabActive}`}
          >
            Alle <b>{total}</b>
          </Link>
          {APPLICATION_STATUSES.map((status) => (
            <Link
              key={status}
              href={`/chat/admin/freelancers?status=${status}`}
              className={`${styles.tab} ${
                activeStatus === status ? styles.tabActive : ""
              }`}
            >
              {APPLICATION_STATUS_LABELS[status]} <b>{counts[status]}</b>
            </Link>
          ))}
        </nav>

        <AdminSectionHeader
          title={activeStatus ? APPLICATION_STATUS_LABELS[activeStatus] : "Alle Bewerbungen"}
          description="Kandidatenprofil, Einsatzdaten und fehlende Unterlagen in einer Zeile."
          aside={`${applications.length} Treffer`}
        />

        <div className={styles.panel}>
          {applications.length ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Kandidat</th>
                    <th scope="col">Kompetenzen</th>
                    <th scope="col">Einsatz</th>
                    <th scope="col">Profilstand</th>
                    <th scope="col">Eingang &amp; Status</th>
                    <th scope="col">
                      <span className={styles.srOnly}>Aktion</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((row) => (
                    <tr key={row.id} data-status={row.status}>
                      <td data-label="Kandidat">
                        <Link href={`/chat/admin/freelancers/${row.id}`}>
                          {row.full_name}
                        </Link>
                        <div className={styles.muted}>{row.contact_email}</div>
                        <div className={styles.candidateRole}>{row.role_title}</div>
                        {row.location_text ? (
                          <div className={styles.muted}>{row.location_text}</div>
                        ) : null}
                      </td>
                      <td data-label="Kompetenzen">
                        <div className={styles.chips}>
                          {row.skills.slice(0, 3).map((skill) => (
                            <span key={skill} className={styles.chip}>
                              {skill}
                            </span>
                          ))}
                          {row.skills.length > 3 ? (
                            <span className={styles.chip}>
                              +{row.skills.length - 3}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td data-label="Einsatz">
                        <div className={styles.stack}>
                          <strong>{rateSummary(row)}</strong>
                          <span>
                            {
                              AVAILABILITY_LABELS[
                                row.availability_status as AvailabilityStatus
                              ]
                            }
                          </span>
                        </div>
                      </td>
                      <td data-label="Profilstand">
                        <div className={styles.readiness}>
                          <span data-ready={Boolean(row.cv_storage_path)}>
                            {row.cv_storage_path ? "CV vorhanden" : "CV fehlt"}
                          </span>
                          <span data-ready={Boolean(row.booking_url)}>
                            {row.booking_url ? "Terminlink" : "Terminlink fehlt"}
                          </span>
                          <span
                            data-ready={Boolean(
                              row.hourly_rate_minor || row.day_rate_minor,
                            )}
                          >
                            {row.hourly_rate_minor || row.day_rate_minor
                              ? "Honorar gesetzt"
                              : "Honorar fehlt"}
                          </span>
                        </div>
                      </td>
                      <td data-label="Eingang & Status">
                        <div className={styles.stack}>
                          <span
                            className={`${styles.badge} ${badgeClass[row.status]}`}
                          >
                            {APPLICATION_STATUS_LABELS[row.status]}
                          </span>
                          <span className={styles.muted}>
                            {dateFormat.format(new Date(row.created_at))}
                          </span>
                        </div>
                      </td>
                      <td data-label="Aktion">
                        <Link
                          href={`/chat/admin/freelancers/${row.id}`}
                          className={styles.rowAction}
                        >
                          {row.published_profile_id
                            ? "Ansehen"
                            : "Prüfen & freigeben"}
                          <span aria-hidden="true">→</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>
              <p>
                {activeStatus
                  ? "In diesem Status liegt gerade nichts."
                  : "Es liegt noch keine Bewerbung vor."}
              </p>
              <p>
                Freelancer bewerben sich über{" "}
                <Link href="/freelancer/apply">/freelancer/apply</Link>. Sobald
                eine Bewerbung eingeht, erscheint sie hier — zum
                Freigeben klickst du dann rechts in der Zeile auf{" "}
                <strong>Prüfen &amp; freigeben</strong>.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
