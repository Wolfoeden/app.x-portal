import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/current-user";
import { PublicFooter, PublicHeader } from "@/components/public/PublicChrome";
import { MatchProtocol } from "@/components/product/MatchProtocol";
import { loadFreelancerPortalState } from "@/lib/freelancer/profile-data";
import { openInvite } from "@/lib/sourcing/conversion";
import type {
  EditableFreelancerProfile,
  FreelancerMetrics,
} from "@/lib/freelancer/portal";

import { ApplyForm } from "./ApplyForm";
import { RememberReferral } from "./RememberReferral";
import { REFERRAL_PATTERN } from "@/lib/freelancer/limits";
import { referralWelcome } from "@/lib/freelancer/referrals";
import {
  FreelancerApplicationStatus,
  FreelancerAuthGate,
  FreelancerDashboard,
} from "./FreelancerPortal";
import styles from "./apply.module.css";

export const metadata: Metadata = {
  title: "Profil anlegen für Freelancer und IT-Fachkräfte | XPORTAL",
  description:
    "Kostenlos ein Profil bei XPORTAL anlegen – für Freelance-Projekte, eine feste Stelle oder den Weg in die Selbstständigkeit. Bestehende Profile hier verwalten.",
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

const previewProfile: EditableFreelancerProfile = {
  id: "a10f78f8-e6ec-47d2-aee9-7fd97b86c9d4",
  displayName: "Anna Beispiel",
  roleTitle: "Senior Product & UX Consultant",
  experienceSummary:
    "Ich begleite digitale Produktteams von der Discovery bis zum skalierbaren Designsystem und verbinde Nutzerforschung mit messbaren Geschäftszielen.",
  skills: ["Product Strategy", "UX Research", "Figma", "Design Systems"],
  languages: ["Deutsch C2", "Englisch C1"],
  qualifications: ["Certified Scrum Product Owner"],
  industries: ["SaaS", "Financial Services"],
  locationText: "Berlin",
  workModes: ["remote", "hybrid"],
  hourlyRate: 145,
  dayRate: 1120,
  currency: "EUR",
  availabilityStatus: "available",
  availabilityFrom: "2026-09-01",
  bookingUrl: "https://cal.com/anna-beispiel/30min",
  profileStatus: "active",
  verificationStatus: "operator_verified",
  avatarUrl: null,
  version: 3,
};

const previewMetrics: FreelancerMetrics = {
  profileViewsTotal: 384,
  profileViews30Days: 92,
  bookingClicksTotal: 41,
  bookingClicks30Days: 13,
};

export default async function FreelancerApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; e?: string | string[]; quelle?: string | string[] }>;
}) {
  const params = await searchParams;
  const preview =
    process.env.NODE_ENV === "development" && params.preview === "1";
  // Das Bewerbungsformular ohne Anmeldung ansehen, nur in der Entwicklung.
  const formPreview =
    process.env.NODE_ENV === "development" && params.preview === "form";

  // Das Kennzeichen aus der Einladung wird beim **Aufruf** eingelöst, nicht
  // erst beim Absenden. Sonst ließe sich bei einer Einladung ohne Anmeldung
  // nicht unterscheiden, ob die Nachricht nicht ankam oder das Formular
  // abschreckte — und das sind zwei verschiedene Probleme.
  const inviteToken = Array.isArray(params.e) ? params.e[0] : params.e;
  // `?quelle=arbeitsagentur`: woher die Bewerbung kommt, damit sich der
  // Zulauf einer Quelle zählen lässt.
  const rawReferral = (Array.isArray(params.quelle) ? params.quelle[0] : params.quelle)?.trim().toLowerCase();
  const referral = rawReferral && REFERRAL_PATTERN.test(rawReferral) ? rawReferral : null;
  const invite = preview ? null : await openInvite(inviteToken);

  const user = preview ? null : await getCurrentUser();
  const portalState =
    user && !user.isAnonymous
      ? await loadFreelancerPortalState(user.id)
      : null;
  const hasProfile = portalState?.kind === "profile" || preview;
  const welcome = referralWelcome(referral);
  const protocolStep = portalState?.kind === "application"
    ? portalState.status === "approved" ? 3 : 2
    : portalState?.kind === "profile" || preview
      ? 3
      : 1;

  return (
    <>
      <PublicHeader context="Freelancer-Portal" />
      <main className={styles.shell} lang="de">
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{hasProfile ? "Profilverwaltung" : "Für IT-Fachkräfte"}</p>
          <h1>{hasProfile ? "Ihr Freelancer-Profil." : "Zeigen Sie, was Sie können."}</h1>
          <p>
            {hasProfile
              ? "Hier aktualisieren Sie Ihre Angaben, steuern die Sichtbarkeit und sehen, wie Kunden mit Ihrem Profil interagieren."
              : "Legen Sie kostenlos ein Profil an – ob Sie als Freelancer arbeiten, eine feste Stelle suchen oder sich gerade selbstständig machen. XPORTAL sieht sich jedes Profil persönlich an und meldet sich, wenn eine Anfrage passt."}
          </p>
        </header>

        {referral ? <RememberReferral referral={referral} /> : null}
        {welcome && !hasProfile ? <p className={styles.welcome}>{welcome}</p> : null}
        {invite && !invite.alreadyConverted ? (
          <p className={styles.invited}>
            Schön, dass Sie da sind, {invite.fullName.split(/\s+/u)[0]}.
            {invite.demandLabel
              ? ` Ein Unternehmen sucht Unterstützung im Bereich ${invite.demandLabel} — dafür haben wir Ihnen geschrieben.`
              : " Wir hatten Ihnen zu einer Projektanfrage geschrieben."}{" "}
            Was Sie hier eintragen, stammt von Ihnen; unsere Notiz aus der
            Recherche wird dadurch ersetzt.
          </p>
        ) : null}

        <div className={styles.protocol}>
          <MatchProtocol
            variant="freelancer"
            activeStep={protocolStep}
            label="Vom Profil zum nachvollziehbaren Match"
          />
        </div>

        {preview ? (
          <FreelancerDashboard
            initialProfile={previewProfile}
            metrics={previewMetrics}
            preview
          />
        ) : formPreview ? (
          <ApplyForm referral={referral} />
        ) : !user || user.isAnonymous ? (
          <FreelancerAuthGate />
        ) : portalState?.kind === "profile" ? (
          <FreelancerDashboard
            initialProfile={portalState.profile}
            metrics={portalState.metrics}
          />
        ) : portalState?.kind === "application" ? (
          <>
            <FreelancerApplicationStatus
              status={portalState.status}
              updatedAt={portalState.updatedAt}
            />
            {portalState.status === "rejected" ? (
              <div className={styles.reapply}>
                <ApplyForm accountEmail={user.email ?? ""} inviteToken={invite ? inviteToken ?? null : null} referral={referral} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <ApplyForm accountEmail={user.email ?? ""} inviteToken={invite ? inviteToken ?? null : null} referral={referral} />
          </>
        )}

        <p className={styles.footer}>
          Fragen? Schreiben Sie uns über das{" "}
          <Link href="/contact">Kontaktformular</Link>. Ihre Daten verarbeiten
          wir nach dem <Link href="/privacy">Datenschutzhinweis</Link>; es
          gelten die <Link href="/terms">AGB</Link> und das{" "}
          <Link href="/imprint">Impressum</Link>.
        </p>
      </div>
      </main>
      <PublicFooter />
    </>
  );
}
