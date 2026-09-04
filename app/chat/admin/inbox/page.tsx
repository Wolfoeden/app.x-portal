import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { listAdminInbox } from "@/lib/admin/inbox-data";
import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";

import { InboxPanel } from "./InboxPanel";

export const metadata: Metadata = {
  title: "Inbox | XPORTAL Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminInboxPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const snapshot = await listAdminInbox();
  const openContacts = snapshot.contacts.filter(
    (item) => item.handledAt === null,
  ).length;
  const openIntroductions = snapshot.introductions.filter(
    (item) => item.status !== "completed" && item.status !== "cancelled",
  ).length;

  await writeAuditEvent({
    actorUserId: currentUser.id,
    action: "admin_inbox_viewed",
    targetType: "admin_inbox",
    outcome: "success",
    metadata: {
      listedContacts: snapshot.contacts.length,
      listedIntroductions: snapshot.introductions.length,
      openContacts,
      openIntroductions,
      truncated:
        snapshot.truncated.contacts || snapshot.truncated.introductions,
    },
    required: true,
  });

  return <InboxPanel initialSnapshot={snapshot} />;
}
