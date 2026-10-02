import Link from "next/link";

import { AdminPageHeader, AdminSurface } from "@/components/admin/AdminDataPrimitives";
import { Card, StatTiles, StatusBadge, cockpitStyles as styles, type Tile } from "@/components/admin/Cockpit";
import { DailyColumns, LiveRefresh } from "@/components/admin/CockpitClient";
import { LeadAutomationPanel } from "@/components/admin/LeadAutomationPanel";
import type { MetricWithTrend, Overview } from "@/lib/admin/overview";
import {
  OVERVIEW_RANGES,
  OVERVIEW_RANGE_LABELS,
  deltaLabel,
  jobTone,
  leadSearchTone,
  relativeTime,
  shortDay,
  type OverviewRange,
} from "@/lib/admin/overview-model";
import { isLeadAutomationPaused, leadAutomationSummary } from "@/lib/leadgen/automation-model";
import { LEAD_BULK_SEND_LIMIT } from "@/lib/leadgen/limits";

const RANGE_TEXT: Readonly<Record<OverviewRange, string>> = {
  1: "seit Mitternacht",
  7: "letzte 7 Tage",
  30: "letzte 30 Tage",
};

function number(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("de-DE");
}

function tile(label: string, metric: MetricWithTrend, range: OverviewRange, extra: Partial<Tile> = {}): Tile {
  return {
    label,
    value: number(metric?.current),
    delta: metric ? deltaLabel(metric.current, metric.previous) : undefined,
    detail: metric ? undefined : "nicht verfügbar",
    trend: metric?.trend,
    ...extra,
    ...(extra.detail === undefined && metric ? { detail: RANGE_TEXT[range] } : {}),
  };
}

function TaskRow({ href, title, meta, count }: { href: string; title: string; meta: string; count: number | null }) {
  return (
    <li>
      <Link className={styles.listItem} href={href} prefetch={false} data-empty={!count}>
        <span>
          <span className={styles.listTitle}>{title}</span>
          <br />
          <span className={styles.listMeta}>{meta}</span>
        </span>
        <span className={styles.listCount}>{number(count)}</span>
      </Link>
    </li>
  );
}

function clock(value: string | null, now: Date): string {
  return value ? relativeTime(value, now) : "noch nie";
}

/**
 * Das Cockpit: was heute zu tun ist, wie die Plattform läuft, ob die
 * Akquise läuft und ob die Technik dahinter gesund ist — auf einer Seite,
 * alle 30 Sekunden neu.
 *
 * Reine Darstellung; die Seite lädt die Zahlen, die Vorschau bringt
 * Beispielwerte mit. Von hier aus führt jede Zahl auf die Seite, auf der man
 * an ihr arbeitet.
 */
export function OverviewView({
  overview,
  now,
  firstName,
}: {
  overview: Overview;
  now: Date;
  firstName: string | null;
}) {
  const range = overview.range;
  const { usage, tasks, leads, system } = overview;

  const failingJobs = system?.jobs.filter((job) => job.active && jobTone(job) !== "good") ?? [];
  const httpFailures = system?.http.filter((entry) => entry.status < 200 || entry.status >= 300) ?? [];
  const httpFailureCount = httpFailures.reduce((sum, entry) => sum + entry.count, 0);
  const searchTone = leadSearchTone(leads.lastSeenAt, now);

  return (
    <AdminSurface label="Administration · Übersicht">
      <AdminPageHeader
        eyebrow="Admin"
        title="Übersicht"
        backHref={null}
        description={<p>{firstName ? `Hallo ${firstName}. ` : ""}Was zu tun ist, wie die Plattform läuft und ob die Akquise arbeitet.</p>}
        actions={<LiveRefresh renderedAt={overview.generatedAt} />}
      />

      <div className={styles.cockpit}>
        <nav aria-label="Zeitraum" className={styles.toolbar}>
          <div className={styles.segmented}>
            {OVERVIEW_RANGES.map((value) => (
              <Link
                key={value}
                href={value === 7 ? "/chat/admin" : `/chat/admin?zeitraum=${value}`}
                prefetch={false}
                aria-current={value === range ? "page" : undefined}
              >
                {OVERVIEW_RANGE_LABELS[value]}
              </Link>
            ))}
          </div>
          <span className={styles.muted} style={{ fontSize: 12.5 }}>
            Vergleich jeweils mit dem gleich langen Zeitraum davor. Interne Konten zählen nicht mit.
          </span>
        </nav>

        <StatTiles
          label="Nutzung"
          tiles={[
            tile("Projektsuchen", usage.searches, range, {
              href: "/chat/admin/demand",
              detail:
                usage.reliableShare === null
                  ? RANGE_TEXT[range]
                  : `${usage.reliableShare} % mit verlässlichem Treffer`,
            }),
            tile("Neue Konten", usage.registrations, range, { href: "/chat/admin/users" }),
            tile("Gastzugänge", usage.guests, range, { href: "/chat/admin/users" }),
            tile("Anfragen an Freelancer", usage.requests, range, { href: "/chat/admin/vermittlungen" }),
            {
              label: "Lead-Mails verschickt",
              value: number(leads.sent),
              detail: RANGE_TEXT[range],
              href: "/chat/admin/leads?ansicht=sent",
            },
          ]}
        />

        <div className={styles.grid}>
          <Card title="Zu erledigen" className={styles.span5}>
            <ul className={styles.list}>
              <TaskRow href="/chat/admin/vermittlungen" title="Suchaufträge bearbeiten" meta="„XPORTAL sucht für Sie“, Freelancer zuordnen" count={tasks.mandates} />
              <TaskRow href="/chat/admin/vermittlungen" title="Vermittlungsanfragen prüfen" meta="Verfügbarkeit klären, vorstellen" count={tasks.placementReview} />
              <TaskRow href="/chat/admin/freelancers" title="Freelancer-Bewerbungen" meta="neu oder in Prüfung" count={tasks.applications} />
              <TaskRow href="/chat/admin/leads?ansicht=prepared" title="Lead-Mails freigeben" meta="Entwurf liegt bereit" count={tasks.leadDrafts} />
              <TaskRow href="/chat/admin/kontakte?faellig=1" title="Wiedervorlagen fällig" meta="Kontakte, heute oder früher" count={tasks.contactsDue} />
              <TaskRow href="/chat/admin/kontakte?stufe=new&mail=mit" title="Kontakte noch nicht angeschrieben" meta="mit E-Mail-Adresse" count={tasks.contactsNew} />
            </ul>
          </Card>

          <Card title="Projektsuchen pro Tag" action={{ href: "/chat/admin/demand", label: "Nachfrage" }} className={styles.span7}>
            <div className={styles.cardBody}>
              <DailyColumns
                label={`Projektsuchen pro Tag, letzte ${usage.searchesByDay.length} Tage`}
                unit="Suchen"
                points={usage.searchesByDay.map((entry) => ({
                  label: shortDay(entry.day),
                  title: shortDay(entry.day),
                  value: entry.count,
                }))}
              />
            </div>
          </Card>

          <Card title="Akquise" action={{ href: "/chat/admin/leads", label: "Leads" }} className={styles.span7}>
            <div className={styles.cardBody} style={{ display: "grid", gap: 12 }}>
              <p className={styles.cardNote}>
                {leadAutomationSummary(overview.automation, LEAD_BULK_SEND_LIMIT, now)}
                {overview.mailReady ? "" : " Der Mailversand ist nicht eingerichtet."}
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className={styles.sr}>Lead-Pipeline, {RANGE_TEXT[range]}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Schritt ({RANGE_TEXT[range]})</th>
                      <th scope="col" className={styles.num}>Anzahl</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Ausschreibungen geprüft (Lead-Suche)</td>
                      <td className={styles.num}>{number(leads.found)}</td>
                    </tr>
                    <tr>
                      <td className={styles.muted}>davon ohne E-Mail · Bestand passt nicht</td>
                      <td className={styles.num}>
                        {number(leads.noEmail)} · {number(leads.poolMismatch)}
                      </td>
                    </tr>
                    <tr>
                      <td>Leads angelegt</td>
                      <td className={styles.num}>{number(leads.created)}</td>
                    </tr>
                    <tr>
                      <td>Abgleich mit passendem Freelancer</td>
                      <td className={styles.num}>
                        {number(leads.matched)} von {number(leads.matched + leads.unmatched)}
                      </td>
                    </tr>
                    <tr>
                      <td>Lead-Mails verschickt</td>
                      <td className={styles.num}>{number(leads.sent)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card title="Lead-Automatik" className={styles.span5}>
            <LeadAutomationPanel
              key={overview.automation.updatedAt ?? "vorgabe"}
              automation={overview.automation}
              paused={isLeadAutomationPaused(overview.automation, now)}
              defaultDailyLimit={LEAD_BULK_SEND_LIMIT}
            />
          </Card>

          <Card title="Systemstatus" action={{ href: "/chat/admin/system", label: "Details" }} className={styles.span6}>
            <ul className={styles.list}>
              <li className={styles.listItem}>
                <span>
                  <span className={styles.listTitle}>Lead-Suche (Claude-Routine)</span>
                  <br />
                  <span className={styles.listMeta}>Mo–Fr 06:20 und 14:20 Uhr · zuletzt {clock(leads.lastSeenAt, now)}</span>
                </span>
                <StatusBadge tone={searchTone}>{searchTone === "good" ? "läuft" : searchTone === "warning" ? "ruhig" : "steht"}</StatusBadge>
              </li>
              <li className={styles.listItem}>
                <span>
                  <span className={styles.listTitle}>Lead-Abgleich</span>
                  <br />
                  <span className={styles.listMeta}>zuletzt {clock(leads.lastPrepareAt, now)}</span>
                </span>
                <StatusBadge tone={overview.automation.prepareMode === "manual" ? "neutral" : "good"}>
                  {overview.automation.prepareMode === "manual" ? "manuell" : "automatisch"}
                </StatusBadge>
              </li>
              <li className={styles.listItem}>
                <span>
                  <span className={styles.listTitle}>Mailversand</span>
                  <br />
                  <span className={styles.listMeta}>SMTP und Abmeldelink</span>
                </span>
                <StatusBadge tone={overview.mailReady ? "good" : "critical"}>{overview.mailReady ? "eingerichtet" : "fehlt"}</StatusBadge>
              </li>
              <li className={styles.listItem}>
                <span>
                  <span className={styles.listTitle}>Zeitgeber (pg_cron)</span>
                  <br />
                  <span className={styles.listMeta}>
                    {system
                      ? failingJobs.length
                        ? `Fehler: ${failingJobs.map((job) => job.name).join(", ")}`
                        : `${system.jobs.filter((job) => job.active).length} aktiv, keine Fehler in 24 Std.`
                      : "Status nicht lesbar"}
                  </span>
                </span>
                <StatusBadge tone={!system ? "neutral" : failingJobs.length ? "critical" : "good"}>
                  {!system ? "unbekannt" : failingJobs.length ? `${failingJobs.length} Fehler` : "ok"}
                </StatusBadge>
              </li>
              <li className={styles.listItem}>
                <span>
                  <span className={styles.listTitle}>Aufrufe aus der Datenbank</span>
                  <br />
                  <span className={styles.listMeta}>pg_net, letzte 6 Std.</span>
                </span>
                <StatusBadge tone={!system ? "neutral" : httpFailureCount ? "warning" : "good"}>
                  {!system ? "unbekannt" : httpFailureCount ? `${httpFailureCount} fehlgeschlagen` : "ok"}
                </StatusBadge>
              </li>
            </ul>
          </Card>

          <Card title="Aktivität" className={styles.span6}>
            {overview.activity.length ? (
              <ol className={styles.timeline}>
                {overview.activity.map((entry) => (
                  <li key={entry.id}>
                    <time dateTime={entry.at}>{relativeTime(entry.at, now)}</time>
                    <span>{entry.label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>Noch keine Aktivität.</p>
            )}
          </Card>
        </div>
      </div>
    </AdminSurface>
  );
}
