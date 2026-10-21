import { AdminPageHeader, AdminSurface } from "@/components/admin/AdminDataPrimitives";
import { Card, StatusBadge, cockpitStyles as styles } from "@/components/admin/Cockpit";
import { ProfileDossier } from "@/components/profile/ProfileDossier";
import type { AdminProfileDetail } from "@/lib/admin/profile-admin";
import { CLAIM_LINK_MAX_AGE_DAYS } from "@/lib/freelancer/claim-token";

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
  claimUrl = null,
}: {
  detail: AdminProfileDetail;
  shownAt: Date;
  referencesPublic: boolean;
  /** Nur bei angelegten Profilen; `null`, wenn kein Geheimnis eingerichtet ist. */
  claimUrl?: string | null;
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
          {detail.selfRegistered ? null : (
            <Card title="Übernahme-Link">
              {claimUrl ? (
                <>
                  <p className={styles.listMeta}>
                    Persönlich an die Person schicken (LinkedIn, Mail an eine bekannte Adresse, Telefon). Wer den Link öffnet,
                    meldet sich an und übernimmt das Profil mit dem eigenen Konto. Gültig {CLAIM_LINK_MAX_AGE_DAYS} Tage, einmal nutzbar.
                  </p>
                  <code style={{ display: "block", overflowWrap: "anywhere", userSelect: "all", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>{claimUrl}</code>
                </>
              ) : (
                <p className={styles.listMeta}>Kein Link möglich: EMAIL_UNSUBSCRIBE_SECRET ist nicht eingerichtet.</p>
              )}
            </Card>
          )}
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
