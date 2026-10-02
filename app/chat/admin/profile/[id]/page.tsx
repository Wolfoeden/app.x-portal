import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { loadAdminProfile } from "@/lib/admin/profile-admin";
import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";
import { referencesVisible } from "@/lib/data/profile-extras";

import { ProfileDetailView } from "./ProfileDetailView";

export const metadata: Metadata = {
  title: "Profil pflegen | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function load(id: string) {
  const detail = await loadAdminProfile(id);
  return detail ? { detail, shownAt: new Date() } : null;
}

/**
 * Ein Profil pflegen: links, was Kunden sehen, rechts die Arbeit daran —
 * Projekte (auch Vorschläge aus der Recherche), Links, Referenznotiz und
 * ob das Profil sichtbar ist.
 */
export default async function AdminProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) redirect(`${appPath("/chat")}?admin-login=1`);
  if (!currentUser.isAdmin) notFound();

  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const loaded = await load(id);
  if (!loaded) notFound();
  const { detail, shownAt } = loaded;

  return (
    <ProfileDetailView detail={detail} shownAt={shownAt} referencesPublic={referencesVisible()} />
  );
}
