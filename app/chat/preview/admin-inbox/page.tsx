import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InboxPanel } from "@/app/chat/admin/inbox/InboxPanel";
import { AdminNav } from "@/app/chat/admin/AdminNav";
import { adminInboxPreview } from "@/components/admin/inbox-preview-fixtures";

export const metadata: Metadata = {
  title: "Admin-Inbox Vorschau | XPORTAL",
  robots: { index: false, follow: false },
};

export default async function AdminInboxPreviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.XPORTAL_LOCAL_PREVIEW !== "1"
  ) {
    notFound();
  }
  const params = (await searchParams) ?? {};
  const state = Array.isArray(params.state) ? params.state[0] : params.state;
  const snapshot =
    state === "empty"
      ? { ...adminInboxPreview, contacts: [], introductions: [] }
      : adminInboxPreview;

  return (
    <div data-admin-surface>
      <AdminNav activeHref="/chat/admin/inbox" disablePrefetch previewMode />
      <InboxPanel initialSnapshot={snapshot} previewMode />
    </div>
  );
}
