import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminDataPrimitives";
import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { decisionDefaultsFromApplication } from "@/lib/freelancer/application";
import { getApplication } from "@/lib/freelancer/applications-data";
import {
  APPLICATION_STATUS_LABELS,
  AVAILABILITY_LABELS,
  WORK_MODE_LABELS,
  type ApplicationStatus,
  type AvailabilityStatus,
  type WorkMode,
} from "@/lib/freelancer/limits";

import { ReviewPanel } from "../ReviewPanel";
import styles from "../freelancers.module.css";

export const metadata: Metadata = {
  title: "Bewerbung prüfen | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const badgeClass: Record<ApplicationStatus, string> = {
  submitted: styles.badgeSubmitted,
  in_review: styles.badgeInReview,
  approved: styles.badgeApproved,
  rejected: styles.badgeRejected,
};

function formatRate(minor: number | null, currency: string | null): string {
  if (minor === null || !currency) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  const megabytes = bytes / 1_048_576;
  return megabytes >= 0.1
    ? `${megabytes.toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function FreelancerApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const { id } = await params;
  const application = await getApplication(id);
  if (!application) notFound();

  await writeAuditEvent({
    actorUserId: currentUser.id,
    action: "freelancer_application_opened",
    targetType: "freelancer_application",
    targetId: application.id,
    outcome: "success",
    required: true,
  });

  const defaults = decisionDefaultsFromApplication(application);

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <AdminPageHeader
          eyebrow="Admin / Bewerbung prüfen"
          title={application.full_name}
          titleMeta={
            <span
              className={`${styles.badge} ${badgeClass[application.status]}`}
            >
              {APPLICATION_STATUS_LABELS[application.status]}
            </span>
          }
          description={
            <p>
              {application.role_title}
              {application.location_text ? ` · ${application.location_text}` : ""}
            </p>
          }
          backHref="/chat/admin/freelancers"
          backLabel="Zur Übersicht"
        />

        <div className={styles.detailGrid}>
          <section className={styles.card}>
            <p className={styles.eyebrow}>Eingereicht</p>
            <h2>Angaben der Bewerbung</h2>

            <dl className={styles.dl}>
              <div>
                <dt>E-Mail</dt>
                <dd>
                  <a href={`mailto:${application.contact_email}`}>
                    {application.contact_email}
                  </a>
                </dd>
              </div>
              {application.contact_phone ? (
                <div>
                  <dt>Telefon</dt>
                  <dd>{application.contact_phone}</dd>
                </div>
              ) : null}
              {application.website_url ? (
                <div>
                  <dt>Website</dt>
                  <dd>
                    <a
                      href={application.website_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {application.website_url}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Arbeitsform</dt>
                <dd>
                  {application.work_modes
                    .map((mode) => WORK_MODE_LABELS[mode as WorkMode])
                    .join(", ")}
                </dd>
              </div>
              <div>
                <dt>Verfügbarkeit</dt>
                <dd>
                  {
                    AVAILABILITY_LABELS[
                      application.availability_status as AvailabilityStatus
                    ]
                  }
                  {application.availability_from
                    ? ` · ab ${application.availability_from}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Honorar</dt>
                <dd>
                  {formatRate(
                    application.hourly_rate_minor,
                    application.currency,
                  )}{" "}
                  / Std. ·{" "}
                  {formatRate(application.day_rate_minor, application.currency)}{" "}
                  / Tag
                </dd>
              </div>
              <div>
                <dt>Terminlink</dt>
                <dd>
                  {application.booking_url ? (
                    <a
                      href={application.booking_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {application.booking_url}
                    </a>
                  ) : (
                    <span className={styles.muted}>nicht angegeben</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Eingegangen</dt>
                <dd>
                  {dateTimeFormat.format(new Date(application.created_at))}
                </dd>
              </div>
              <div>
                <dt>Einwilligung</dt>
                <dd>
                  {dateTimeFormat.format(new Date(application.consent_at))}
                </dd>
              </div>
              {application.reviewed_at ? (
                <div>
                  <dt>Entschieden</dt>
                  <dd>
                    {dateTimeFormat.format(new Date(application.reviewed_at))}
                  </dd>
                </div>
              ) : null}
              {application.published_profile_id ? (
                <div>
                  <dt>Veröffentlichtes Profil</dt>
                  <dd>
                    <code>{application.published_profile_id}</code>
                  </dd>
                </div>
              ) : null}
            </dl>

            <h3>Kurzprofil</h3>
            <p className={styles.summaryText}>
              {application.experience_summary}
            </p>

            {application.applicant_note ? (
              <>
                <h3>Nachricht</h3>
                <p className={styles.summaryText}>
                  {application.applicant_note}
                </p>
              </>
            ) : null}

            <h3>Lebenslauf</h3>
            {application.cv_storage_path ? (
              <a
                className={styles.cvLink}
                href={appPath(
                  `/api/admin/freelancer-applications/${application.id}/cv`,
                )}
                target="_blank"
                rel="noreferrer noopener"
              >
                {application.cv_original_filename ?? "Lebenslauf"} ·{" "}
                {formatFileSize(application.cv_size_bytes)}
              </a>
            ) : (
              <p className={styles.hint}>Kein Lebenslauf hochgeladen.</p>
            )}

            <div className={styles.callout}>
              <strong>Was die Freigabe auslöst</strong>
              <span>
                Es entsteht eine neue Zeile in <code>freelancer_profiles</code>{" "}
                mit <code>profile_status=active</code> und{" "}
                <code>demo_status=real</code>. Ab diesem Moment kann das Profil
                in Kunden-Shortlists erscheinen.
              </span>
            </div>
          </section>

          <ReviewPanel
            applicationId={application.id}
            status={application.status}
            hasCv={Boolean(application.cv_storage_path)}
            defaults={defaults}
          />
        </div>
      </div>
    </main>
  );
}
