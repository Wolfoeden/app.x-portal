import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AdminNav } from "@/app/chat/admin/AdminNav";
import { AgentGridWorkspace } from "@/app/chat/agent-grid/AgentGridWorkspace";
import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "XPORTAL Agent Grid",
  description: "Interner Canvas für Prozess-Discovery und BPMN-Blueprints.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AgentGridPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  return (
    <div data-admin-surface>
      <AdminNav />
      <AgentGridWorkspace />
    </div>
  );
}
