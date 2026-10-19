import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { cache } from "react";
import "@/app/styles/legal.css";
import "@/app/styles/app-surface";

import { previewDossiers, previewProfiles } from "@/components/chat/preview-fixtures";
import { PublicProfilePage } from "@/components/profile/PublicProfilePage";
import styles from "@/components/profile/public-profile.module.css";
import {
  PublicDocumentIntro,
  PublicFooter,
  PublicHeader,
} from "@/components/public/PublicChrome";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { refreshProfilePresentation } from "@/lib/freelancer/profile-presentation";
import { loadProfilePageView, type PublicProfileView } from "@/lib/freelancer/public-profile";
import { placementBookingAllowed } from "@/lib/placement/requests";
import {
  isProfileLinkSource,
  profilePageAction,
  profileUrl,
} from "@/lib/profile/profile-link";
import { SITE_URL } from "@/lib/seo";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

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
  const skills = dossier.skills.map((skill) => skill.value);
  const summary = `${dossier.summary ?? ""} Davor sechs Jahre in Produktteams von Handel und Logistik: Design-System aufgebaut, Frontend-Architektur auf Next.js umgestellt, Teams von vier bis acht Entwicklern fachlich geführt.`;
  return {
    profile: { ...base, id: "vorschau" },
    dossier: { ...dossier, id: "vorschau", summary },
    // Wie es mit Unterlagen und fertiger Aufbereitung aussieht.
    documents: { cv: true, links: { linkedin: true, github: true } },
    presentation: {
      stale: false,
      input: { role: dossier.role, summary, skills, industries: [], qualifications: [] },
      presentation: {
        headline: "Frontends für Banken und Versicherungen, vom Designsystem bis zur barrierefreien Formularstrecke.",
        summaryDe: null,
        focusAreas: [
          { title: "Frontend", skills: skills.slice(0, 3) },
          { title: "Qualität und Team", skills: skills.slice(3, 6) },
        ].filter((area) => area.skills.length),
        industries: ["Versicherungen", "Banken"],
        educationShort: null,
      },
    },
  };
}

/**
 * Titel und Seite brauchen dasselbe Profil. `cache` lädt es je Aufruf nur
 * einmal; vorher fragte die Seite die Datenbank für beide getrennt ab.
 */
const loadProfile = cache(async (id: string): Promise<(PublicProfileView & { shownAt: Date }) | null> => {
  const view = previewView(id) ?? (UUID.test(id) ? await loadProfilePageView(id).catch(() => null) : null);
  return view ? { ...view, shownAt: new Date() } : null;
});

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
  // Trial/Tarif und profilspezifische Freigabe gelten auch auf der Profilseite.
  const directBooking =
    isAccountUser && user ? await placementBookingAllowed(user, id).catch(() => false) : false;

  const { profile, shownAt } = view;
  const action = profilePageAction({
    profileId: profile.id,
    hasCalendar: Boolean(profile.bookingUrl),
    isAccountUser,
    projectId,
    directBooking,
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

  // Fehlt die Aufbereitung für diesen Inhaltsstand, entsteht sie nach der
  // Antwort; der nächste Aufruf zeigt sie. Die Seite wartet nie darauf.
  const presentation = view.presentation;
  if (profile.id !== "vorschau" && presentation?.stale) after(() =>
    refreshProfilePresentation(createAdminSupabaseClient(), profile.id, presentation.input).catch(() => undefined),
  );

  const bookingHref =
    action.kind === "booking"
      ? action.href
      : profile.bookingUrl
        ? `/api/freelancers/${profile.id}/book${via === "lead" ? "?via=lead" : ""}`
        : null;

  return (
    <>
      <PublicHeader context="Freelancer-Profil" />
      <main className={styles.page} lang="de">
        <PublicProfilePage
          view={view}
          action={action}
          bookingHref={bookingHref}
          shareUrl={profileUrl(SITE_URL, profile.id, "share")}
          now={shownAt}
        />
      </main>
      <PublicFooter />
    </>
  );
}
