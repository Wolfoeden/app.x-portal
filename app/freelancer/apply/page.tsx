import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/current-user";
import { loadFreelancerPortalState } from "@/lib/freelancer/profile-data";
import type {
  EditableFreelancerProfile,
  FreelancerMetrics,
} from "@/lib/freelancer/portal";

import { ApplyForm } from "./ApplyForm";
import {
  FreelancerApplicationStatus,
  FreelancerAuthGate,
  FreelancerDashboard,
} from "./FreelancerPortal";
import styles from "./apply.module.css";

export const metadata: Metadata = {
  title: "Freelancer-Portal | XPORTAL",
  description:
    "Bei XPORTAL bewerben, das eigene Freelancer-Profil verwalten und Profilstatistiken ansehen.",
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

const steps = [
  "Profil ausfüllen",
  "Prüfung durch XPORTAL",
  "Freischaltung und Matching",
];

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
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const preview =
    process.env.NODE_ENV === "development" && params.preview === "1";
  const user = preview ? null : await getCurrentUser();
  const portalState =
    user && !user.isAnonymous
      ? await loadFreelancerPortalState(user.id)
      : null;

  return (
    <main className={styles.shell} lang="de">
      <div className={styles.inner}>
        <nav className={styles.topbar} aria-label="Freelancer-Navigation">
          <div>
            <Link className={styles.wordmark} href="/chat">
              XPORTAL
            </Link>
            <span>/ Freelancer</span>
          </div>
          <Link className={styles.backLink} href="/chat">
            Zum Matching
          </Link>
        </nav>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Profilverwaltung</p>
          <h1>
            {portalState?.kind === "profile" || preview
              ? "Dein Freelancer-Profil."
              : "Werde Teil des geprüften Netzwerks."}
          </h1>
          <p>
            {portalState?.kind === "profile" || preview
              ? "Hier aktualisierst du deine Angaben, steuerst die Sichtbarkeit und siehst, wie Kunden mit deinem Profil interagieren."
              : "Wir schlagen Kundinnen und Kunden nur Profile vor, die wir vorher selbst gesichtet haben. Nach unserer Freigabe wird dein Profil im Portal sichtbar."}
          </p>
        </header>

        {preview ? (
          <FreelancerDashboard
            initialProfile={previewProfile}
            metrics={previewMetrics}
            preview
          />
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
                <ApplyForm accountEmail={user.email ?? ""} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <ol className={styles.steps}>
              {steps.map((step, index) => (
                <li key={step}>
                  <span>{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <ApplyForm accountEmail={user.email ?? ""} />
          </>
        )}

        <p className={styles.footer}>
          Fragen? Schreib uns über das{" "}
          <Link href="/contact">Kontaktformular</Link>. Deine Daten verarbeiten
          wir nach dem <Link href="/privacy">Datenschutzhinweis</Link>; es
          gelten die <Link href="/terms">AGB</Link> und das{" "}
          <Link href="/imprint">Impressum</Link>.
        </p>
      </div>
    </main>
  );
}
