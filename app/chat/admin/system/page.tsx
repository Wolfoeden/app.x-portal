import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AdminPageHeader, AdminSurface } from "@/components/admin/AdminDataPrimitives";
import { Card, StatusBadge, cockpitStyles as styles, type StatusTone } from "@/components/admin/Cockpit";
import { LiveRefresh } from "@/components/admin/CockpitClient";
import { loadSystemHealth } from "@/lib/admin/overview";
import { CRON_JOB_LABELS, explainHttpFailure, jobTone, relativeTime } from "@/lib/admin/overview-model";
import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";
import { promotionalDeliveryConfigured } from "@/lib/email/deliver";
import { leadAutomationSummary, readLeadAutomation } from "@/lib/leadgen/automation";
import { LEAD_BULK_SEND_LIMIT } from "@/lib/leadgen/limits";
import { placementRequestsEnabled } from "@/lib/placement/config";

export const metadata: Metadata = {
  title: "System | XPORTAL Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function secretSet(name: string, minLength = 1): boolean {
  return (process.env[name]?.trim().length ?? 0) >= minLength;
}

const JOB_STATUS_TEXT: Readonly<Record<StatusTone, string>> = {
  good: "ok",
  warning: "teilweise Fehler",
  critical: "Fehler",
  neutral: "aus",
};

/**
 * Was im Hintergrund läuft und ob es klappt: die Zeitgeber der Datenbank,
 * ihre Aufrufe an die Anwendung und die Einrichtung, ohne die sie nichts
 * tun. Bisher sah das nur, wer SQL schreibt.
 *
 * Ein Zeitgeber meldet „erfolgreich“, sobald er seinen Aufruf abgeschickt
 * hat — ob die Anwendung ihn angenommen hat, steht erst in den
 * HTTP-Antworten darunter. Beides gehört deshalb auf eine Seite.
 */
export default async function SystemPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) redirect(`${appPath("/chat")}?admin-login=1`);
  if (!currentUser.isAdmin) notFound();

  const now = new Date();
  const [health, automation] = await Promise.all([loadSystemHealth(), readLeadAutomation()]);
  const failures = health?.http.filter((entry) => entry.status < 200 || entry.status >= 300) ?? [];

  const checks: Array<{ label: string; ok: boolean; detail: string }> = [
    { label: "Mailversand (Werbung)", ok: promotionalDeliveryConfigured(), detail: "SMTP-Zugang und EMAIL_UNSUBSCRIBE_SECRET" },
    { label: "Lead-Lauf aus der Datenbank", ok: secretSet("LEADGEN_RUN_SECRET", 32), detail: "LEADGEN_RUN_SECRET (mind. 32 Zeichen), passend zum Vault-Eintrag leadgen_run_token" },
    { label: "Nachfassen der Vermittlungen", ok: secretSet("PLACEMENT_RUN_SECRET", 32), detail: "PLACEMENT_RUN_SECRET, passend zum Vault-Eintrag" },
    { label: "KI-Analyse", ok: secretSet("OPENAI_API_KEY"), detail: "OPENAI_API_KEY" },
    { label: "Zahlungen", ok: secretSet("STRIPE_SECRET_KEY"), detail: "STRIPE_SECRET_KEY" },
    { label: "Datenbank-Dienstzugang", ok: secretSet("SUPABASE_SERVICE_ROLE_KEY"), detail: "SUPABASE_SERVICE_ROLE_KEY" },
    { label: "Vermittlungsmodell", ok: placementRequestsEnabled(), detail: "NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED" },
  ];

  return (
    <AdminSurface label="Administration · System">
      <AdminPageHeader
        eyebrow="Admin / Betrieb"
        title="System"
        backHref={null}
        description={<p>Zeitgeber, ihre Aufrufe an die Anwendung und die Einrichtung. Nur Ja/Nein, keine Geheimnisse.</p>}
        actions={<LiveRefresh renderedAt={now.toISOString()} />}
      />

      <div className={styles.cockpit}>
        <div className={styles.grid}>
          <Card title="Fehlgeschlagene Aufrufe (letzte 6 Std.)" className={styles.span12}>
            {!health ? (
              <p className={styles.empty}>Der Systemstatus ist nicht lesbar. Ist die Migration admin_cockpit eingespielt?</p>
            ) : failures.length ? (
              <ul className={styles.list}>
                {failures.map((entry) => {
                  const explained = explainHttpFailure(entry);
                  return (
                    <li className={styles.listItem} key={entry.status}>
                      <span>
                        <span className={styles.listTitle}>
                          {explained.title} · HTTP {entry.status || "–"}
                        </span>
                        <br />
                        <span className={styles.listMeta}>{explained.hint}</span>
                        {entry.lastAt ? (
                          <>
                            <br />
                            <span className={styles.listMeta}>zuletzt {relativeTime(entry.lastAt, now)}</span>
                          </>
                        ) : null}
                      </span>
                      <StatusBadge tone="warning">{entry.count.toLocaleString("de-DE")}×</StatusBadge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.empty}>Keine fehlgeschlagenen Aufrufe.</p>
            )}
          </Card>

          <Card title="Zeitgeber (pg_cron, letzte 24 Std.)" className={styles.span8}>
            {health?.jobs.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Aufgabe</th>
                      <th scope="col">Takt (UTC)</th>
                      <th scope="col">Zuletzt</th>
                      <th scope="col" className={styles.num}>Läufe</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.jobs.map((job) => {
                      const tone = jobTone(job);
                      return (
                        <tr key={job.name}>
                          <td>
                            {CRON_JOB_LABELS[job.name] ?? job.name}
                            <div className={styles.muted}>{job.name}</div>
                            {tone === "critical" || tone === "warning" ? <div className={styles.muted}>{job.lastMessage}</div> : null}
                          </td>
                          <td className={styles.muted}>
                            <code>{job.schedule}</code>
                          </td>
                          <td className={styles.muted}>{job.lastRunAt ? relativeTime(job.lastRunAt, now) : "—"}</td>
                          <td className={styles.num}>
                            {job.runs24h.toLocaleString("de-DE")}
                            {job.failures24h ? ` (${job.failures24h} Fehler)` : ""}
                          </td>
                          <td>
                            <StatusBadge tone={tone}>{JOB_STATUS_TEXT[tone]}</StatusBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.empty}>Keine Zeitgeber gefunden.</p>
            )}
          </Card>

          <Card title="Einrichtung" className={styles.span4}>
            <ul className={styles.list}>
              {checks.map((check) => (
                <li className={styles.listItem} key={check.label}>
                  <span>
                    <span className={styles.listTitle}>{check.label}</span>
                    <br />
                    <span className={styles.listMeta}>{check.detail}</span>
                  </span>
                  <StatusBadge tone={check.ok ? "good" : "critical"}>{check.ok ? "ja" : "nein"}</StatusBadge>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Lead-Suche und Automatik" action={{ href: "/chat/admin/leads", label: "Leads" }} className={styles.span12}>
            <div className={styles.cardBody} style={{ display: "grid", gap: 8 }}>
              <p className={styles.cardNote}>
                <strong>Lead-Suche:</strong> läuft außerhalb der Anwendung als geplante Claude-Routine „X-Portal Lead Gen –
                freelancermap.de AI“ (Mo–Fr 06:20 und 14:20 Uhr). Sie schreibt neue Leads in die Warteschlange und jede
                geprüfte Ausschreibung in die Merkliste; ihr Lebenszeichen steht in der Übersicht.
              </p>
              <p className={styles.cardNote}>
                <strong>Automatik:</strong> {leadAutomationSummary(automation, LEAD_BULK_SEND_LIMIT, now)}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </AdminSurface>
  );
}
