import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getProfilePerformance } from "@/lib/admin/profile-performance";
import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";

import styles from "./profiles.module.css";

export const metadata: Metadata = {
  title: "Freelancer-Leistung | XPORTAL Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("de-DE");
const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null): string {
  if (!value) return "–";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "–" : dateTimeFormat.format(parsed);
}

function rate(part: number, base: number): string {
  if (base <= 0) return "–";
  return `${Math.round((part / base) * 100)} % davon`;
}

function Cell({ value }: { value: number }) {
  return (
    <td className={`${styles.num} ${styles.right} ${value === 0 ? styles.zero : ""}`}>
      {numberFormat.format(value)}
    </td>
  );
}

export default async function AdminProfilePerformancePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const report = await getProfilePerformance();
  const { totals } = report;

  await writeAuditEvent({
    actorUserId: currentUser.id,
    action: "admin_profile_performance_viewed",
    targetType: "freelancer_profile",
    outcome: "success",
    metadata: { profiles: totals.profiles, impressions: totals.impressions },
    required: true,
  });

  const steps = [
    {
      label: "Eingeblendet",
      value: totals.impressions,
      hint: "in einer Auswahl gezeigt",
    },
    {
      label: "Karte gesehen",
      value: totals.profileViews,
      hint: rate(totals.profileViews, totals.impressions),
    },
    {
      label: "Gemerkt",
      value: totals.saves,
      hint: rate(totals.saves, totals.impressions),
    },
    {
      label: "CV geladen",
      value: totals.cvDownloads,
      hint: rate(totals.cvDownloads, totals.impressions),
    },
    {
      label: "Termin geklickt",
      value: totals.bookingClicks,
      hint: rate(totals.bookingClicks, totals.impressions),
    },
    {
      label: "Kontakt angefragt",
      value: totals.introductions,
      hint: rate(totals.introductions, totals.impressions),
    },
  ];

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Admin / Freelancer-Leistung</p>
            <h1>Welche Profile funktionieren</h1>
            <p>
              Für jedes Profil die volle Kette von der Einblendung bis zur
              Kontaktanfrage. Einblendungen, CV-Downloads und Kontakte reichen bis
              zum Start zurück; Kartenaufrufe und Terminklicks erst ab dem Tag, an
              dem ihre Aufzeichnung eingebaut wurde.
            </p>
          </div>
          <Link href="/chat" className={styles.backLink}>
            Zurück zum Chat
          </Link>
        </header>

        {report.truncated ? (
          <p className={styles.warning}>
            Mindestens eine Quelle liefert mehr Zeilen, als in einem Durchlauf
            gelesen werden. Die Zahlen sind deshalb eine Untergrenze.
          </p>
        ) : null}

        {totals.bookingClicks === 0 && totals.impressions > 0 ? (
          <p className={styles.warning}>
            Noch kein einziger Terminklick aufgezeichnet
            {report.eventTrackingSince
              ? ` — die Aufzeichnung läuft seit ${formatDateTime(report.eventTrackingSince)}.`
              : " — die Aufzeichnung hat noch kein Ereignis gesehen."}{" "}
            Solange hier eine Null steht, ist unklar, ob niemand klickt oder die
            Erfassung nicht greift.
          </p>
        ) : null}

        <div className={styles.funnel}>
          {steps.map((step) => (
            <div
              className={`${styles.step} ${step.value === 0 ? styles.stepZero : ""}`}
              key={step.label}
            >
              <p className={styles.stepLabel}>{step.label}</p>
              <p className={styles.stepValue}>{numberFormat.format(step.value)}</p>
              <p className={styles.stepRate}>{step.hint}</p>
            </div>
          ))}
        </div>

        <h2 className={styles.sectionTitle}>
          Profile ({numberFormat.format(totals.activeProfiles)} aktiv von{" "}
          {numberFormat.format(totals.profiles)})
        </h2>
        <p className={styles.sectionNote}>
          Nach Einblendungen sortiert. Ein Profil ganz unten ohne eine einzige
          Einblendung wird vom Matching nie gefunden — das ist ein Hinweis auf die
          Profildaten, nicht auf die Person.
        </p>

        {report.rows.length === 0 ? (
          <p className={styles.empty}>Es gibt noch keine Freelancer-Profile.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Profil</th>
                  <th>Status</th>
                  <th className={styles.right}>Eingebl.</th>
                  <th className={styles.right}>Karte</th>
                  <th className={styles.right}>Gemerkt</th>
                  <th className={styles.right}>CV</th>
                  <th className={styles.right}>CV abgel.</th>
                  <th className={styles.right}>Termin</th>
                  <th className={styles.right}>Kontakt</th>
                  <th>Letzte Aktivität</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.profileId}>
                    <td>
                      <div className={styles.name}>{row.displayName}</div>
                      <div className={styles.role}>{row.roleTitle}</div>
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          row.profileStatus === "active"
                            ? styles.badgeActive
                            : styles.badgePaused
                        }`}
                      >
                        {row.profileStatus === "active" ? "aktiv" : row.profileStatus}
                      </span>
                      {row.hasBookingUrl ? null : (
                        <>
                          {" "}
                          <span className={`${styles.badge} ${styles.badgeNoLink}`}>
                            kein Terminlink
                          </span>
                        </>
                      )}
                    </td>
                    <Cell value={row.impressions} />
                    <Cell value={row.profileViews} />
                    <Cell value={row.saves} />
                    <Cell value={row.cvDownloads} />
                    <Cell value={row.cvDenied} />
                    <Cell value={row.bookingClicks} />
                    <Cell value={row.introductions} />
                    <td className={styles.num}>{formatDateTime(row.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className={styles.footNote}>
          Erhoben am {formatDateTime(report.generatedAt)}. Einblendungen aus{" "}
          <code>matches</code>, CV-Zugriffe aus <code>audit_events</code>,
          Kartenaufrufe und Terminklicks aus <code>freelancer_profile_events</code>,
          Kontakte aus <code>intro_bookings</code>.
        </p>
      </div>
    </main>
  );
}
