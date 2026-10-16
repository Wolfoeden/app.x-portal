import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminPageHeader, AdminSurface } from "@/components/admin/AdminDataPrimitives";
import { Card, StatTiles, StatusBadge, cockpitStyles as styles } from "@/components/admin/Cockpit";
import { getPraxisActivity, PRAXIS_WINDOW_DAYS } from "@/lib/admin/praxis-activity";
import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Praxisseite | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function dateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

/**
 * Admin › Praxisseite: wer nach dem Anruf die Mail mit dem Link geöffnet hat,
 * was als „Das will ich auch“ markiert ist und wer den Kalender geöffnet hat.
 * Ein Kontakt erscheint hier, sobald er die Seite über seinen Link aufruft;
 * den Link samt Mail gibt es auf seiner Kontaktseite.
 *
 * „Kalender geöffnet“ heißt noch nicht „gebucht“ — gebucht wird im Kalender
 * selbst. Wer geöffnet, aber keinen Termin hat, ist der Anruf von morgen.
 */
export default async function PraxisAdminPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) redirect(`${appPath("/chat")}?admin-login=1`);
  if (!currentUser.isAdmin) notFound();

  const activity = await getPraxisActivity();
  const ids = activity.contacts.map((row) => row.contactId);
  const names = new Map<string, { company: string; contactName: string | null }>();
  if (ids.length) {
    const { data } = await createAdminSupabaseClient().from("crm_contacts").select("id,company,contact_name").in("id", ids);
    for (const row of (data ?? []) as { id: string; company: string; contact_name: string | null }[]) {
      names.set(row.id, { company: row.company, contactName: row.contact_name });
    }
  }
  const withCalendar = activity.contacts.filter((row) => row.calendarOpenedAt).length;
  const withInterest = activity.contacts.filter((row) => row.interests.length).length;

  return (
    <AdminSurface label="Administration · Praxisseite">
      <AdminPageHeader
        eyebrow="Admin / Arbeit"
        title="Praxisseite"
        backHref={null}
        description={
          <p>
            Nach dem Anruf geht die Mail mit dem Link auf /praxis raus — Link und Mail stehen auf der Seite des Kontakts.
            Hier steht, wer geöffnet hat, was interessiert und wer den Kalender geöffnet hat (letzte {PRAXIS_WINDOW_DAYS} Tage).
          </p>
        }
      />
      <div className={styles.cockpit}>
        <StatTiles
          label="Praxisseite in Zahlen"
          tiles={[
            { label: "Über ihren Link geöffnet", value: activity.contacts.length.toLocaleString("de-DE"), detail: "Kontakte" },
            { label: "Etwas markiert", value: withInterest.toLocaleString("de-DE"), detail: "„Das will ich auch“" },
            { label: "Kalender geöffnet", value: withCalendar.toLocaleString("de-DE"), detail: "über ihren Link" },
            { label: "Ohne Link", value: activity.anonymousViews.toLocaleString("de-DE"), detail: `Aufrufe, ${activity.anonymousCalendar.toLocaleString("de-DE")}× Kalender` },
          ]}
        />
        <Card title="Kontakte">
          <div className={styles.cardBody}>
            {activity.contacts.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Firma</th>
                      <th scope="col">Seite geöffnet</th>
                      <th scope="col">Interesse</th>
                      <th scope="col">Kalender</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.contacts.map((row) => {
                      const name = names.get(row.contactId);
                      return (
                        <tr key={row.contactId}>
                          <td>
                            <Link className={styles.textLink} href={`/chat/admin/kontakte/${row.contactId}`} prefetch={false}>
                              {name?.company ?? "Gelöschter Kontakt"}
                            </Link>
                            {name?.contactName ? <div className={styles.muted}>{name.contactName}</div> : null}
                          </td>
                          <td>
                            {dateTime(row.lastViewedAt)}
                            {row.views > 1 ? <div className={styles.muted}>{row.views}× geöffnet</div> : null}
                          </td>
                          <td>{row.interests.length ? row.interests.join(", ") : <span className={styles.muted}>—</span>}</td>
                          <td>
                            {row.calendarOpenedAt ? (
                              <StatusBadge tone="good">{dateTime(row.calendarOpenedAt)}</StatusBadge>
                            ) : (
                              <StatusBadge tone="warning">nachfassen</StatusBadge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.empty}>Noch hat niemand die Seite über seinen Link geöffnet.</p>
            )}
          </div>
        </Card>
      </div>
    </AdminSurface>
  );
}
