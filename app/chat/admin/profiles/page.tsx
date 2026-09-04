import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  AdminDisclosure,
  AdminPageHeader,
  AdminSectionHeader,
} from "@/components/admin/AdminDataPrimitives";
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

function availabilityLabel(value: string): string {
  const labels: Record<string, string> = {
    available: "verfügbar",
    limited: "eingeschränkt",
    unavailable: "nicht verfügbar",
  };
  return labels[value] ?? value;
}

export default async function AdminProfilePerformancePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const report = await getProfilePerformance();
  const { totals } = report;

  // Zwei Quellen, zwei Startpunkte: Einblendungen stehen seit Beginn in
  // `matches`, Kartenaufrufe und Terminklicks erst seit dem Einbau der
  // Ereignisaufzeichnung. Solange das so ist, ist "19 % davon" keine Quote,
  // sondern der Vergleich zweier verschiedener Zeiträume.
  const eventBasisDiffers = Boolean(report.eventTrackingSince);
  const shown = report.rows.filter((row) => row.impressions > 0);
  const neverShown = report.rows.filter((row) => row.impressions === 0);

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
      hint: eventBasisDiffers
        ? "andere Zeitbasis"
        : rate(totals.profileViews, totals.impressions),
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
      hint: eventBasisDiffers
        ? "andere Zeitbasis"
        : rate(totals.bookingClicks, totals.impressions),
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
        <AdminPageHeader
          eyebrow="Admin / Analyse"
          title="Profil-Performance"
          description={
            <p>
              Reichweite, Interesse und Kontaktabsicht je Freelancer-Profil —
              verdichtet auf die Signale, die Profilqualität und Nachfrage
              tatsächlich unterscheiden.
            </p>
          }
        />

        {report.truncated ? (
          <p className={styles.warning}>
            Mindestens eine Quelle liefert mehr Zeilen, als in einem Durchlauf
            gelesen werden. Die Zahlen sind deshalb eine Untergrenze.
          </p>
        ) : null}

        {eventBasisDiffers ? (
          <AdminDisclosure
            title="Messzeiträume unterscheiden sich"
            summary={`Karten- und Terminsignale seit ${formatDateTime(report.eventTrackingSince)}`}
          >
            <p>
              Kartenaufrufe und Terminklicks werden erst seit{" "}
              {formatDateTime(report.eventTrackingSince)} aufgezeichnet,
              Einblendungen dagegen seit Beginn. Deshalb werden diese Werte als
              Signale nebeneinander gezeigt, nicht als vermeintlich exakte
              Conversion-Quote.
            </p>
          </AdminDisclosure>
        ) : null}

        {report.excludedAccounts > 0 ? (
          <AdminDisclosure
            title="Interne Nutzung ausgeschlossen"
            summary={`${numberFormat.format(report.excludedAccounts)} Konto · soweit technisch zuordenbar`}
          >
            <p>
              Einblendungen, gespeicherte Profile, CV-Zugriffe und Kontakte des
              internen Kontos zählen hier nicht. Kartenaufrufe und Terminklicks
              besitzen im aktuellen Ereignisschema noch keine Nutzer-ID und
              lassen sich deshalb rückwirkend nicht sicher zuordnen.
            </p>
          </AdminDisclosure>
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

        <div className={styles.signalBoard} aria-label="Performance-Signalweg">
          {[
            { label: "Reichweite", items: steps.slice(0, 2) },
            { label: "Interesse", items: steps.slice(2, 4) },
            { label: "Konversion", items: steps.slice(4, 6) },
          ].map((group) => (
            <section className={styles.signalGroup} key={group.label}>
              <h2>{group.label}</h2>
              <div>
                {group.items.map((step) => (
                  <dl className={step.value === 0 ? styles.stepZero : undefined} key={step.label}>
                    <dt>{step.label}</dt>
                    <dd>{numberFormat.format(step.value)}</dd>
                    <small>{step.hint}</small>
                  </dl>
                ))}
              </div>
            </section>
          ))}
        </div>

        {neverShown.length > 0 ? (
          <>
            <AdminSectionHeader
              title={`Aufmerksamkeit: nie eingeblendet (${numberFormat.format(neverShown.length)})`}
              description="Skills, Rollenbezeichnung oder Verfügbarkeit passen zu keiner bisherigen Anfrage — ein Hinweis auf die Profildaten, nicht auf die Person."
              aside={`${numberFormat.format(neverShown.length)} von ${numberFormat.format(totals.profiles)} Profilen`}
            />
            <ul className={styles.neverShown}>
              {neverShown.map((row) => (
                <li key={row.profileId}>
                  <span className={styles.name}>{row.displayName}</span>
                  <span className={styles.role}>{row.roleTitle}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <AdminSectionHeader
          title={`Profilvergleich (${numberFormat.format(shown.length)})`}
          description="Nach Einblendungen sortiert; fachlich verwandte Signale stehen zusammen."
          aside={`${numberFormat.format(totals.activeProfiles)} von ${numberFormat.format(totals.profiles)} aktiv`}
        />

        {shown.length === 0 ? (
          <p className={styles.empty}>Es gibt noch keine Freelancer-Profile.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Profil</th>
                  <th>Bereitschaft</th>
                  <th>Reichweite</th>
                  <th>Interesse</th>
                  <th>Konversion</th>
                  <th>Letzte Aktivität</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.profileId} data-status={row.profileStatus}>
                    <td data-label="Profil">
                      <div className={styles.name}>{row.displayName}</div>
                      <div className={styles.role}>{row.roleTitle}</div>
                    </td>
                    <td data-label="Bereitschaft">
                      <div className={styles.readiness}>
                        <span
                          className={`${styles.badge} ${
                            row.profileStatus === "active"
                              ? styles.badgeActive
                              : styles.badgePaused
                          }`}
                        >
                          {row.profileStatus === "active" ? "aktiv" : row.profileStatus}
                        </span>
                        <span className={styles.availability}>
                          {availabilityLabel(row.availabilityStatus)}
                        </span>
                        {row.hasBookingUrl ? null : (
                          <span className={`${styles.badge} ${styles.badgeNoLink}`}>
                            Terminlink fehlt
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={styles.metricCell} data-label="Reichweite">
                      <strong>{numberFormat.format(row.impressions)}</strong>
                      <span>Einblendungen</span>
                      <small>{numberFormat.format(row.profileViews)} Kartenaufrufe</small>
                    </td>
                    <td className={styles.metricCell} data-label="Interesse">
                      <strong>{numberFormat.format(row.saves)}</strong>
                      <span>gemerkt</span>
                      <small>
                        {numberFormat.format(row.cvDownloads)} CV geladen ·{" "}
                        {numberFormat.format(row.cvDenied)} abgelehnt
                      </small>
                    </td>
                    <td className={styles.metricCell} data-label="Konversion">
                      <strong>{numberFormat.format(row.introductions)}</strong>
                      <span>Kontakte</span>
                      <small>{numberFormat.format(row.bookingClicks)} Terminklicks</small>
                    </td>
                    <td className={styles.num} data-label="Letzte Aktivität">
                      {formatDateTime(row.lastActivityAt)}
                    </td>
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
