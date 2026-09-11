import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminNav } from "@/app/chat/admin/AdminNav";
import { AgentGridWorkspace } from "@/app/chat/agent-grid/AgentGridWorkspace";

export const metadata: Metadata = {
  title: "Agent Grid Vorschau | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AgentGridPreviewPage() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.XPORTAL_LOCAL_PREVIEW !== "1"
  ) {
    notFound();
  }

  return (
    <div data-admin-surface>
      <AdminNav
        activeHref="/chat/agent-grid"
        disablePrefetch
        previewMode
      />
      <AgentGridWorkspace initialDemo />
    </div>
  );
}
