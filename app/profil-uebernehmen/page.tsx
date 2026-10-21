import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import "@/app/styles/app-surface";

import styles from "@/app/bewerber-portal/apply/apply.module.css";
import { PublicFooter, PublicHeader } from "@/components/public/PublicChrome";
import { getCurrentUser } from "@/lib/auth/current-user";
import { claimPath, readClaimToken } from "@/lib/freelancer/claim-token";
import { profilePath } from "@/lib/profile/profile-link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { ClaimActions, type ClaimState } from "./ClaimActions";

export const metadata: Metadata = {
  title: "Profil übernehmen | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type ClaimableProfile = { id: string; display_name: string; role_title: string; owner_user_id: string | null };

async function loadProfile(profileId: string): Promise<ClaimableProfile | null> {
  const { data, error } = await createAdminSupabaseClient()
    .from("freelancer_profiles")
    .select("id,display_name,role_title,owner_user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return (data as ClaimableProfile | null) ?? null;
}

async function accountHasProfile(userId: string): Promise<boolean> {
  const { count, error } = await createAdminSupabaseClient()
    .from("freelancer_profiles")
    .select("id", { head: true, count: "exact" })
    .eq("owner_user_id", userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Ein angelegtes Profil übernehmen (lib/freelancer/claim-token.ts). Der Link
 * kommt persönlich vom Betreiber; die Seite zeigt, welches Profil es ist, und
 * führt durch Anmeldung und Übernahme.
 */
export default async function ClaimProfilePage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const params = await searchParams;
  const token = (Array.isArray(params.t) ? params.t[0] : params.t)?.trim() ?? "";
  const profileId = readClaimToken(token);
  const [profile, user] = await Promise.all([
    profileId ? loadProfile(profileId).catch(() => null) : Promise.resolve(null),
    getCurrentUser(),
  ]);
  const signedIn = Boolean(user && !user.isAnonymous);
  if (profile && signedIn && profile.owner_user_id === user?.id) redirect("/bewerber-portal/apply");

  const claimable = profile && !profile.owner_user_id ? profile : null;
  const state: ClaimState = !signedIn
    ? "signed_out"
    : (await accountHasProfile(user!.id).catch(() => false))
      ? "has_profile"
      : "ready";

  return (
    <>
      <PublicHeader context="Profil übernehmen" authenticated={signedIn} />
      <main className={styles.shell} lang="de">
        <div className={styles.inner}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Profil übernehmen</p>
            {claimable ? (
              <>
                <h1>{claimable.display_name}, Ihr Profil wartet auf Sie.</h1>
                <p>
                  XPORTAL hat für Sie ein Profil als <strong>{claimable.role_title}</strong> angelegt. Mit Ihrem eigenen Konto
                  pflegen Sie es selbst, und Anfragen von Unternehmen erreichen Sie direkt per E-Mail.
                </p>
              </>
            ) : profile ? (
              <>
                <h1>Dieses Profil wurde bereits übernommen.</h1>
                <p>Ist es Ihres und Sie kommen nicht hinein? Schreiben Sie uns über das <Link href="/contact">Kontaktformular</Link>.</p>
              </>
            ) : (
              <>
                <h1>Der Link ist ungültig oder abgelaufen.</h1>
                <p>Übernahme-Links gelten 90 Tage. Schreiben Sie uns über das <Link href="/contact">Kontaktformular</Link>, dann schicken wir einen neuen.</p>
              </>
            )}
          </header>

          {claimable ? (
            <section className={styles.portalCard} aria-label="So geht es">
              <ol className={styles.claimSteps}>
                <li>Mit Google, LinkedIn oder per E-Mail anmelden.</li>
                <li>Profil übernehmen: Es gehört dann Ihrem Konto, sonst ändert sich nichts.</li>
                <li>Verfügbarkeit, Honorar und Projekte selbst aktuell halten, pausieren oder löschen.</li>
              </ol>
              <p className={styles.hint}>
                <Link href={profilePath(claimable.id)}>So sieht Ihr Profil heute aus</Link>. Kostenlos und ohne Provision; Ihre
                Kontaktdaten sehen Unternehmen erst, wenn Sie einer Anfrage zustimmen.
              </p>
              <ClaimActions token={token} state={state} destination={claimPath(token)} />
            </section>
          ) : null}

          <p className={styles.footer}>
            Ihre Daten verarbeiten wir nach dem <Link href="/privacy">Datenschutzhinweis</Link>; es gelten die{" "}
            <Link href="/terms">AGB</Link> und das <Link href="/imprint">Impressum</Link>.
          </p>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
