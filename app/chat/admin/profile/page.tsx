import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminPageHeader, AdminSurface } from "@/components/admin/AdminDataPrimitives";
import { Card, StatTiles, StatusBadge, cockpitStyles as styles } from "@/components/admin/Cockpit";
import { listAdminProfiles, type AdminProfileStatus } from "@/lib/admin/profile-admin";
import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Profile | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Die Pflegeliste der veröffentlichten Profile: Was Kunden auf Karte und
 * Profil sehen, und was fehlt. Die schwächsten Profile stehen oben — dort
 * bringt ein Projekt, ein Link oder ein Foto am meisten.
 */
export default async function AdminProfilesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) redirect(`${appPath("/chat")}?admin-login=1`);
  if (!currentUser.isAdmin) notFound();

  const params = await searchParams;
  const status: AdminProfileStatus = params.status === "pausiert" ? "paused" : "active";
  const { rows, counts, projectsAvailable } = await listAdminProfiles(status);
  const withProject = rows.filter((row) => row.projects > 0).length;
  const withPhoto = rows.filter((row) => row.hasPhoto).length;
  const proposals = rows.reduce((sum, row) => sum + row.proposals, 0);

  return (
    <AdminSurface label="Administration · Profile">
      <AdminPageHeader
        eyebrow="Admin / Arbeit"
        title="Profile"
        backHref={null}
        description={
          <p>
            Veröffentlichte Profile pflegen: Referenzprojekte, Links und Referenznotiz. Die schwächsten stehen oben;
            ein Klick öffnet Vorschau und Editor.
          </p>
        }
      />
      <div className={styles.cockpit}>
        {projectsAvailable ? null : (
          <p className={styles.error} role="alert">
            Die Migration 20261006090000_referenzprojekte ist noch nicht eingespielt. Bis dahin lassen sich keine Projekte
            und Links speichern.
          </p>
        )}
        <StatTiles
          label="Profile in Zahlen"
          tiles={[
            { label: "Aktiv", value: counts.active.toLocaleString("de-DE"), detail: "für Kunden sichtbar", href: "/chat/admin/profile" },
            { label: "Pausiert", value: counts.paused.toLocaleString("de-DE"), detail: "nicht in der Suche", href: "/chat/admin/profile?status=pausiert" },
            { label: "Mit Projekt", value: withProject.toLocaleString("de-DE"), detail: `von ${rows.length.toLocaleString("de-DE")} in dieser Ansicht` },
            { label: "Mit Foto", value: withPhoto.toLocaleString("de-DE"), detail: `von ${rows.length.toLocaleString("de-DE")}` },
            { label: "Vorschläge offen", value: proposals.toLocaleString("de-DE"), detail: "aus der Recherche, noch unsichtbar" },
          ]}
        />
        <Card title={status === "active" ? "Aktive Profile" : "Pausierte Profile"}>
          {rows.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Profil</th>
                    <th scope="col">Profilstärke</th>
                    <th scope="col">Nächster Schritt</th>
                    <th scope="col">Projekte</th>
                    <th scope="col">Links</th>
                    <th scope="col">Foto</th>
                    <th scope="col">Notiz</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/chat/admin/profile/${row.id}`} prefetch={false}>
                          {row.displayName}
                        </Link>
                        <div className={styles.muted}>
                          {row.role}
                          {row.selfRegistered ? " · selbst angemeldet" : ""}
                        </div>
                      </td>
                      <td className={styles.num}>
                        <meter min={0} max={row.strength.total} value={row.strength.done} aria-label="Profilstärke" />{" "}
                        {row.strength.done} von {row.strength.total}
                      </td>
                      <td className={styles.muted}>{row.strength.next?.label ?? "—"}</td>
                      <td className={styles.num}>
                        {row.projects}
                        {row.verifiedProjects ? <div className={styles.muted}>{row.verifiedProjects} geprüft</div> : null}
                        {row.proposals ? <StatusBadge tone="warning">{row.proposals} Vorschlag</StatusBadge> : null}
                      </td>
                      <td className={styles.num}>{row.links || "—"}</td>
                      <td>{row.hasPhoto ? "✓" : "—"}</td>
                      <td>{row.hasReferences ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.empty}>Keine Profile in dieser Ansicht.</p>
          )}
        </Card>
      </div>
    </AdminSurface>
  );
}
