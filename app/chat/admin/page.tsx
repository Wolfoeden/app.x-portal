import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { OverviewView } from "@/components/admin/OverviewView";
import { loadOverview } from "@/lib/admin/overview";
import { parseOverviewRange } from "@/lib/admin/overview-model";
import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Übersicht | XPORTAL Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Die Startseite des Adminbereichs (components/admin/OverviewView.tsx). */
export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ zeitraum?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) redirect(`${appPath("/chat")}?admin-login=1`);
  if (!currentUser.isAdmin) notFound();

  const range = parseOverviewRange((await searchParams).zeitraum);
  const now = new Date();
  const overview = await loadOverview(range, now);
  return <OverviewView overview={overview} now={now} firstName={currentUser.displayName?.split(/\s+/u)[0] ?? null} />;
}
