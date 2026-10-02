import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import "@/app/styles/legal.css";

import { previewDossiers, previewProfiles } from "@/components/chat/preview-fixtures";
import { ProfileDossier } from "@/components/profile/ProfileDossier";
import { ProfilePageActions } from "@/components/profile/ProfilePageActions";
import styles from "@/components/profile/public-profile.module.css";
import {
  PublicDocumentIntro,
  PublicFooter,
  PublicHeader,
} from "@/components/public/PublicChrome";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadPublicProfileView, type PublicProfileView } from "@/lib/freelancer/public-profile";
import { placementRequestsEnabled } from "@/lib/placement/config";
import {
  isProfileLinkSource,
  profilePageAction,
  profileUrl,
} from "@/lib/profile/profile-link";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type Params = { params: Promise<{ id: string }> };
type SearchParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/profil/vorschau` zeigt in der Entwicklung ein Beispielprofil, damit sich
 * die Seite ohne Produktionsdaten ansehen lässt — wie `/chat/preview`.
 */
function previewView(id: string): PublicProfileView | null {
  if (process.env.NODE_ENV !== "development" || id !== "vorschau") return null;
  const base = previewProfiles[0];
  const dossier = previewDossiers[base.id]!;
  return {
    profile: { ...base, id: "vorschau" },
    dossier: {
      ...dossier,
      id: "vorschau",
      summary: `${dossier.summary ?? ""} Davor sechs Jahre in Produktteams von Handel und Logistik: Design-System aufgebaut, Frontend-Architektur auf Next.js umgestellt, Teams von vier bis acht Entwicklern fachlich geführt.`,
    },
  };
}

async function loadProfile(id: string): Promise<(PublicProfileView & { shownAt: Date }) | null> {
  const view = previewView(id) ?? (UUID.test(id) ? await loadPublicProfileView(id).catch(() => null) : null);
  return view ? { ...view, shownAt: new Date() } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const profile = (await loadProfile(id))?.profile;
  return {
    title: profile ? `${profile.displayName} · ${profile.role} | XPORTAL` : "Profil | XPORTAL",
    description: profile
      ? `${profile.role} im Freelancer-Verzeichnis von XPORTAL.`
      : "Freelancer-Profil bei XPORTAL.",
    // Der Link ist zum Teilen da, nicht für den Suchindex: Wer ein Profil
    // sieht, soll es über eine Mail, eine Suche oder einen Kollegen sehen.
    robots: { index: false, follow: false },
  };
}

/**
 * Ein Freelancer-Profil unter eigenem Link, ohne den Chat, in dem es
 * gefunden wurde. Dahin führen Links aus Mails und aus „Link kopieren“.
 *
 * `?projekt=` bindet eine Anfrage an das Projekt, aus dem der Link stammt;
 * `?via=` sagt, woher der Aufruf kam.
 */
export default async function ProfilePage({ params, searchParams }: Params & SearchParams) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const view = await loadProfile(id);

  if (!view) {
    return (
      <div className="xlegal" lang="de">
        <PublicHeader context="Freelancer-Profil" />
        <main className="xlegal-document xlegal-document-compact">
          <PublicDocumentIntro
            eyebrow="Freelancer-Profil"
            title="Dieses Profil ist gerade nicht verfügbar."
            signal={{ label: "Status", value: "Nicht aktiv" }}
          >
            <p>
              Der Freelancer ist derzeit nicht im Verzeichnis. Beschreiben Sie Ihr Projekt, und XPORTAL
              schlägt Ihnen passende Profile vor.
            </p>
          </PublicDocumentIntro>
          <p><Link className="booking-continue" href="/chat">Passende Freelancer finden</Link></p>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const viaParam = first(query.via);
  const via = isProfileLinkSource(viaParam) ? viaParam : null;
  const projectParam = first(query.projekt);
  const projectId = projectParam && UUID.test(projectParam) ? projectParam : null;
  const user = await getCurrentUser().catch(() => null);
  const isAccountUser = Boolean(user && !user.isAnonymous);

  const { profile, dossier, shownAt } = view;
  const action = profilePageAction({
    profileId: profile.id,
    placement: placementRequestsEnabled(),
    hasCalendar: Boolean(profile.bookingUrl),
    isAccountUser,
    projectId,
    via,
  });

  // Zählt, ob Links aus Mails geöffnet werden. Nach der Antwort, damit die
  // Seite nicht auf das Protokoll wartet; ein Fehler dort bleibt folgenlos.
  if (profile.id !== "vorschau") after(() =>
    writeAuditEvent({
      actorUserId: user?.id ?? null,
      action: "profile_page_viewed",
      targetType: "freelancer_profile",
      targetId: profile.id,
      outcome: "success",
      metadata: { via, account: !user ? "none" : user.isAnonymous ? "guest" : "registered" },
    }).catch(() => undefined),
  );

  return (
    <div className="xlegal" lang="de">
      <PublicHeader context="Freelancer-Profil" />
      <main className={`xlegal-document ${styles.page}`}>
        {/* „Geprüft“ versprach mehr, als XPORTAL tut: Profile werden vor der
            Freigabe gesichtet, ihre Angaben aber nicht unabhängig geprüft —
            so steht es auch in den FAQ der Startseite. */}
        <p className={styles.eyebrow}>Von XPORTAL freigegebenes Profil</p>
        <div className={styles.card}>
          <ProfileDossier dossier={dossier} now={shownAt} headingLevel={1} />
          <ProfilePageActions
            profile={profile}
            action={action}
            shareUrl={profileUrl(SITE_URL, profile.id, "share")}
          />
        </div>
        <aside className={styles.aside}>
          <div>
            <h2>Mehrere Profile vergleichen?</h2>
            <p>
              Beschreiben Sie Ihr Projekt in einem Satz. XPORTAL gleicht es mit allen Profilen ab und zeigt,
              welche Anforderungen jedes Profil belegt und was offen ist.
            </p>
          </div>
          <Link className={styles.secondary} href="/chat">Passende Freelancer finden</Link>
        </aside>
      </main>
      <PublicFooter />
    </div>
  );
}
