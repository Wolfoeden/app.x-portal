import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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

function relativeDays(value: string | null, now: number): string {
  if (!value) return "nie";
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return "nie";
  const days = Math.floor((now - parsed) / (24 * 60 * 60 * 1000));
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
            <th>Art</th>
            <th>Registriert</th>
            <th>Zuletzt aktiv</th>
            <th className={styles.num}>Chats</th>
            <th className={styles.num}>Nachrichten</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId}>
              <td>
                {row.email ?? "ohne E-Mail"}
                <div className={styles.mono}>{row.userId.slice(0, 8)}…</div>
              </td>
              <td>
                <span
                  className={`${styles.badge} ${
                    row.kind === "registered"
                      ? styles.badgeRegistered
                      : styles.badgeGuest
                  }`}
                >
                  {row.kind === "registered" ? "angemeldet" : "Gast"}
                </span>
              </td>
              <td className={styles.num}>{formatDateTime(row.createdAt)}</td>
              <td className={styles.num}>
                {relativeDays(row.lastActiveAt, now)}
                <div className={styles.mono}>
                  {formatDateTime(row.lastActiveAt)}
                </div>
              </td>
              <td className={styles.num}>{numberFormat.format(row.projects)}</td>
              <td className={styles.num}>{numberFormat.format(row.messages)}</td>
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
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Admin / Nutzer</p>
            <h1>Wer nutzt XPORTAL</h1>
            <p>
              Jedes Konto aus Supabase Auth, aufgeteilt in angemeldete Nutzer und
              Gastsitzungen. <strong>„Aktiv“ heißt: hat in diesem Zeitraum selbst
              eine Nachricht geschrieben.</strong> Eine bloße Anmeldung zählt nicht.
            </p>
          </div>
          <Link href="/chat" className={styles.backLink}>
            Zurück zum Chat
          </Link>
        </header>

        {metrics.truncated ? (
          <p className={styles.warning}>
            Es wurden mehr Konten gefunden, als in einem Durchlauf gelesen werden.
            Die Zahlen unten sind deshalb eine Untergrenze.
          </p>
        ) : null}

        <div className={styles.statGrid}>
          <div className={`${styles.stat} ${styles.statAccent}`}>
            <p className={styles.statLabel}>Angemeldet</p>
            <p className={styles.statValue}>
              {numberFormat.format(metrics.totals.registered)}
            </p>
            <p className={styles.statHint}>
              dauerhafte Konten mit E-Mail oder Anbieter-Login
            </p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statLabel}>Konten gesamt</p>
            <p className={styles.statValue}>
              {numberFormat.format(metrics.totals.accounts)}
            </p>
            <p className={styles.statHint}>
              {percent(metrics.totals.registered, metrics.totals.accounts)} davon
              angemeldet
            </p>
          </div>
          <div className={`${styles.stat} ${styles.statMuted}`}>
            <p className={styles.statLabel}>Gastsitzungen</p>
            <p className={styles.statValue}>
              {numberFormat.format(metrics.totals.guests)}
            </p>
            <p className={styles.statHint}>
              anonyme Konten — das Umwandlungspotenzial
            </p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statLabel}>Nie zurückgekehrt</p>
            <p className={styles.statValue}>
              {numberFormat.format(metrics.totals.registeredNeverReturned)}
            </p>
            <p className={styles.statHint}>
              angemeldet, aber seit der Registrierung nie erneut eingeloggt
            </p>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>Aktive Nutzer</h2>
        <p className={styles.sectionNote}>
          Gezählt wird jedes Konto, das im Zeitraum mindestens eine eigene
          Nachricht geschrieben hat — Antworten des Assistenten zählen nicht.
          Gelesen wird ein Fenster von {metrics.activityWindowDays} Tagen; alles
          Ältere zählt als inaktiv.
        </p>
        <div className={styles.windowGrid}>
          {[
            { label: "Letzte 24 Stunden", data: metrics.activity.day },
            { label: "Letzte 7 Tage", data: metrics.activity.week },
            {
              label: `Letzte ${metrics.activityWindowDays} Tage`,
              data: metrics.activity.month,
            },
          ].map((entry) => (
            <div className={styles.window} key={entry.label}>
              <p className={styles.statLabel}>{entry.label}</p>
              <p className={styles.statValue}>
                {numberFormat.format(entry.data.active)}
              </p>
              <ul className={styles.windowSplit}>
                <li>
                  <span>{numberFormat.format(entry.data.registeredActive)}</span>{" "}
                  angemeldet
                </li>
                <li>
                  <span>{numberFormat.format(entry.data.guestActive)}</span> Gäste
                </li>
              </ul>
            </div>
          ))}
        </div>

        <h2 className={styles.sectionTitle}>Neue Konten pro Tag</h2>
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

        <h2 className={styles.sectionTitle}>
          Angemeldete Konten ({numberFormat.format(metrics.registeredAccounts.length)})
        </h2>
        <AccountTable
          rows={metrics.registeredAccounts}
          now={now}
          emptyLabel="Noch hat sich niemand dauerhaft angemeldet."
        />

        <h2 className={styles.sectionTitle}>
          Gäste mit Aktivität ({numberFormat.format(metrics.activeGuests.length)})
        </h2>
        <p className={styles.sectionNote}>
          Gastsitzungen, die tatsächlich selbst geschrieben haben. Genau diese
          Nutzer lohnt es zur Anmeldung zu führen — sie sind höchstens 50 Einträge
          lang und nach letzter Aktivität sortiert.
        </p>
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
