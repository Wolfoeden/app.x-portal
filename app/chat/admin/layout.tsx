import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";

import { AdminNav } from "./AdminNav";

// Every admin page still guards itself. This layout adds the shared entry
// point so a new page is reachable, and fails closed before any of them run.
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
