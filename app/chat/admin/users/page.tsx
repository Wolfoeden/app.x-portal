import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  AdminMetricStrip,
  AdminPageHeader,
  AdminSectionHeader,
} from "@/components/admin/AdminDataPrimitives";
import {
  getAdminUserMetrics,
  type AdminAccountRow,
} from "@/lib/admin/user-metrics";
import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";

import styles from "./users.module.css";

export const metadata: Metadata = {
  title: "Nutzer | XPORTAL Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});
const numberFormat = new Intl.NumberFormat("de-DE");

function formatDateTime(value: string | null): string {
  if (!value) return "–";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "–" : dateTimeFormat.format(parsed);
}

function formatDay(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : dateFormat.format(parsed);
}

function startOfLocalDay(value: number): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Kalendertage, nicht 24-Stunden-Blöcke. Gerechnet in 24ern hieß ein Zeitpunkt
 * von vorgestern 10:10 am Morgen darauf noch "gestern", weil erst 23 Stunden
 * vergangen waren.
 */
function relativeDays(value: string | null, now: number): string {
  if (!value) return "nie";
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return "nie";
  const days = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(parsed)) / (24 * 60 * 60 * 1000),
  );
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

function percent(part: number, total: number): string {
  if (total <= 0) return "–";
  return `${Math.round((part / total) * 100)} %`;
}

function AccountTable({
  rows,
  now,
  emptyLabel,
}: {
  rows: readonly AdminAccountRow[];
  now: number;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className={styles.empty}>{emptyLabel}</p>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Konto</th>
            <th>Registriert</th>
            <th>Zuletzt aktiv</th>
            <th className={styles.num}>Chats</th>
            <th className={styles.num}>Nachrichten</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} data-idle={row.messages === 0}>
              <td data-label="Konto">
                {row.email ?? "ohne E-Mail"}
                <div className={styles.mono}>{row.userId.slice(0, 8)}…</div>
              </td>
              <td className={styles.num} data-label="Registriert">
                {formatDateTime(row.createdAt)}
              </td>
              <td className={styles.num} data-label="Zuletzt aktiv">
                {relativeDays(row.lastActiveAt, now)}
                <div className={styles.mono}>
                  {formatDateTime(row.lastActiveAt)}
                </div>
              </td>
              <td className={styles.num} data-label="Chats">
                {numberFormat.format(row.projects)}
              </td>
              <td className={styles.num} data-label="Nachrichten">
                {numberFormat.format(row.messages)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminUsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const metrics = await getAdminUserMetrics();
  const now = Date.parse(metrics.generatedAt);

  await writeAuditEvent({
    actorUserId: currentUser.id,
    action: "admin_users_viewed",
    targetType: "user_account",
    outcome: "success",
    metadata: {
      accounts: metrics.totals.accounts,
      registered: metrics.totals.registered,
    },
    required: true,
  });

  const maxDay = metrics.registrationsByDay.reduce(
    (max, day) => Math.max(max, day.registered + day.guests),
    0,
  );

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <AdminPageHeader
          eyebrow="Admin / Nutzer"
          title="Nutzeraktivität"
          description={
            <p>
              Konten, Aktivierung und Nutzung auf einen Blick. Aktiv bedeutet:
              Das Konto hat selbst eine Nachricht geschrieben — eine Anmeldung
              allein zählt nicht.
            </p>
          }
        />

        {metrics.truncated ? (
          <p className={styles.warning}>
            Es wurden mehr Konten gefunden, als in einem Durchlauf gelesen werden.
            Die Zahlen unten sind deshalb eine Untergrenze.
          </p>
        ) : null}

        {metrics.excludedAccounts > 0 ? (
          <p className={styles.measurementNote}>
            Externe Plattformnutzung · {numberFormat.format(metrics.excludedAccounts)}
            {" "}internes Konto vor allen Kennzahlen ausgeschlossen.
          </p>
        ) : null}

        <AdminMetricStrip
          label="Kontenübersicht"
          items={[
            {
              label: "Angemeldet",
              value: numberFormat.format(metrics.totals.registered),
              detail: "dauerhafte Konten",
              tone: "accent",
            },
            {
              label: "Konten gesamt",
              value: numberFormat.format(metrics.totals.accounts),
              detail: `${percent(metrics.totals.registered, metrics.totals.accounts)} angemeldet`,
            },
            {
              label: "Gastsitzungen",
              value: numberFormat.format(metrics.totals.guests),
              detail: "Potenzial zur Registrierung",
              tone: "muted",
            },
            {
              label: "Nie geschrieben",
              value: numberFormat.format(metrics.totals.registeredNeverWrote),
              detail: "registriert, aber nicht aktiviert",
              tone:
                metrics.totals.registeredNeverWrote > 0 ? "warning" : "default",
            },
          ]}
        />

        <AdminSectionHeader
          title="Aktive Nutzer"
          description={`Konten mit mindestens einer eigenen Nachricht; Messfenster ${metrics.activityWindowDays} Tage.`}
        />
        <AdminMetricStrip
          label="Aktive Nutzer nach Zeitraum"
          items={[
            { label: "Letzte 24 Stunden", data: metrics.activity.day },
            { label: "Letzte 7 Tage", data: metrics.activity.week },
            {
              label: `Letzte ${metrics.activityWindowDays} Tage`,
              data: metrics.activity.month,
            },
          ].map((entry) => ({
            label: entry.label,
            value: numberFormat.format(entry.data.active),
            detail: `${numberFormat.format(entry.data.registeredActive)} angemeldet · ${numberFormat.format(entry.data.guestActive)} Gäste`,
          }))}
        />

        <AdminSectionHeader
          title="Neue Konten pro Tag"
          description="Angemeldete Konten im Verhältnis zu allen neu angelegten Sitzungen."
        />
        {metrics.registrationsByDay.length === 0 ? (
          <p className={styles.empty}>Noch keine Konten angelegt.</p>
        ) : (
          <div className={styles.days}>
            {metrics.registrationsByDay.map((day) => {
              const total = day.registered + day.guests;
              const registeredWidth = maxDay
                ? (day.registered / maxDay) * 100
                : 0;
              const guestWidth = maxDay ? (day.guests / maxDay) * 100 : 0;
              return (
                <div className={styles.day} key={day.date}>
                  <span className={styles.dayDate}>{formatDay(day.date)}</span>
                  <span className={styles.dayTrack}>
                    <span
                      className={styles.dayBarRegistered}
                      style={{ left: 0, width: `${registeredWidth}%` }}
                    />
                    <span
                      className={styles.dayBarGuests}
                      style={{
                        left: `${registeredWidth}%`,
                        width: `${guestWidth}%`,
                      }}
                    />
                  </span>
                  <span className={styles.dayCount}>
                    {numberFormat.format(day.registered)} / {numberFormat.format(total)}
                  </span>
                </div>
              );
            })}
            <p className={styles.legend}>
              <span className={styles.legendKey}>
                <span
                  className={styles.legendSwatch}
                  style={{ background: "#1d6b5f" }}
                />
                angemeldet
              </span>
              <span className={styles.legendKey}>
                <span
                  className={styles.legendSwatch}
                  style={{ background: "#d5d5cc" }}
                />
                Gastsitzungen
              </span>
              <span>Zahl rechts: angemeldet / gesamt</span>
            </p>
          </div>
        )}

        <AdminSectionHeader
          title={`Angemeldete Konten (${numberFormat.format(metrics.registeredAccounts.length)})`}
          description="Nach letzter Aktivität sortiert; Konten ohne Nutzung bleiben sichtbar."
        />
        <AccountTable
          rows={metrics.registeredAccounts}
          now={now}
          emptyLabel="Noch hat sich niemand dauerhaft angemeldet."
        />

        <AdminSectionHeader
          title={`Gäste mit Aktivität (${numberFormat.format(metrics.activeGuests.length)})`}
          description="Aktive Gastsitzungen mit Conversion-Potenzial; maximal 50, nach letzter Aktivität sortiert."
        />
        <AccountTable
          rows={metrics.activeGuests}
          now={now}
          emptyLabel="Keine Gastsitzung hat bisher einen Chat geführt."
        />

        <p className={styles.footNote}>
          Erhoben am {formatDateTime(metrics.generatedAt)}. Aktivität aus eigenen
          Nachrichten der letzten {metrics.activityWindowDays} Tage.
        </p>
      </div>
    </main>
  );
}
