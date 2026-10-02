import { AdminPageHeader, AdminSurface } from "@/components/admin/AdminDataPrimitives";
import { Card, StatusBadge, cockpitStyles as styles } from "@/components/admin/Cockpit";
import { ProfileDossier } from "@/components/profile/ProfileDossier";
import type { AdminProfileDetail } from "@/lib/admin/profile-admin";

import { ProfileEditor } from "./ProfileEditor";

/**
 * Die Pflegeseite eines Profils: links, was Kunden sehen, rechts die Arbeit
 * daran — Profilstärke, Projekte samt Vorschlägen aus der Recherche, Links,
 * Referenznotiz und Sichtbarkeit.
 */
export function ProfileDetailView({
  detail,
  shownAt,
  referencesPublic,
}: {
  detail: AdminProfileDetail;
  shownAt: Date;
  referencesPublic: boolean;
}) {
  return (
    <AdminSurface label="Administration · Profil pflegen">
      <AdminPageHeader
        eyebrow="Admin / Profile"
        title={detail.dossier.displayName}
        titleMeta={
          <StatusBadge tone={detail.status === "active" ? "good" : "warning"}>
            {detail.status === "active" ? "aktiv" : detail.status === "paused" ? "pausiert" : detail.status}
          </StatusBadge>
        }
        backHref="/chat/admin/profile"
        backLabel="Zur Profilliste"
        description={
          <p>
            Profilstärke {detail.strength.done} von {detail.strength.total}
            {detail.strength.next ? ` · nächster Schritt: ${detail.strength.next.label}` : " · vollständig"}
            {detail.selfRegistered ? " · selbst angemeldet" : " · vom Betreiber angelegt"}
          </p>
        }
      />
      <div className={styles.grid} style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "start" }}>
        <Card title="So sehen Kunden das Profil">
          <div style={{ overflow: "hidden", borderTop: "1px solid var(--border)" }}>
            <ProfileDossier dossier={detail.dossier} now={shownAt} />
          </div>
        </Card>
        <div style={{ display: "grid", gap: 16 }}>
          <Card title="Profilstärke">
            <ul className={styles.list}>
              {detail.strength.steps.map((step) => (
                <li className={styles.listItem} key={step.key}>
                  <span>
                    <span className={styles.listTitle}>{step.done ? "✓ " : "○ "}{step.label}</span>
                    {step.done ? null : (
                      <>
                        <br />
                        <span className={styles.listMeta}>{step.hint}</span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <ProfileEditor
            profileId={detail.id}
            initialProjects={detail.projects}
            initialLinks={detail.links}
            initialReferences={detail.referencesSummary}
            status={detail.status}
            projectsAvailable={detail.projectsAvailable}
            referencesPublic={referencesPublic}
            hasPhoto={Boolean(detail.dossier.avatarUrl)}
          />
        </div>
      </div>
    </AdminSurface>
  );
}
