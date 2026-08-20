import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Admin / Freelancer</p>
            <h1>Bewerbungen prüfen</h1>
            <p>
              Jede Bewerbung liegt hier, bis Sie sie freigeben. Erst mit der
              Freigabe entsteht ein Profil in <code>freelancer_profiles</code>{" "}
              und wird im Matching gefunden.
            </p>
          </div>
          <Link href="/chat" className={styles.backLink}>
            Zurück zum Chat
          </Link>
        </header>

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

        <div className={styles.panel}>
          {applications.length ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Rolle</th>
                    <th scope="col">Skills</th>
                    <th scope="col">Honorar</th>
                    <th scope="col">Verfügbarkeit</th>
                    <th scope="col">Unterlagen</th>
                    <th scope="col">Eingegangen</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className={styles.srOnly}>Aktion</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/chat/admin/freelancers/${row.id}`}>
                          {row.full_name}
                        </Link>
                        <div className={styles.muted}>{row.contact_email}</div>
                      </td>
                      <td>
                        {row.role_title}
                        {row.location_text ? (
                          <div className={styles.muted}>{row.location_text}</div>
                        ) : null}
                      </td>
                      <td>
                        <div className={styles.chips}>
                          {row.skills.slice(0, 6).map((skill) => (
                            <span key={skill} className={styles.chip}>
                              {skill}
                            </span>
                          ))}
                          {row.skills.length > 6 ? (
                            <span className={styles.chip}>
                              +{row.skills.length - 6}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>{rateSummary(row)}</td>
                      <td>
                        {
                          AVAILABILITY_LABELS[
                            row.availability_status as AvailabilityStatus
                          ]
                        }
                      </td>
                      <td>
                        <div>{row.cv_storage_path ? "Lebenslauf" : "–"}</div>
                        <div className={styles.muted}>
                          {row.booking_url ? "Terminlink" : "kein Terminlink"}
                        </div>
                      </td>
                      <td className={styles.muted}>
                        {dateFormat.format(new Date(row.created_at))}
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${badgeClass[row.status]}`}
                        >
                          {APPLICATION_STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td>
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
