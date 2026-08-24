import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";

import styles from "./admin-nav.module.css";

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
      <nav className={styles.bar} aria-label="Admin-Bereich">
        <div className={styles.inner}>
          <p className={styles.brand}>XPORTAL Admin</p>
          <ul className={styles.links}>
            <li>
              <Link className={styles.link} href="/chat/admin/users">
                Nutzer
              </Link>
            </li>
            <li>
              <Link className={styles.link} href="/chat/admin/profiles">
                Freelancer-Leistung
              </Link>
            </li>
            <li>
              <Link className={styles.link} href="/chat/admin/freelancers">
                Bewerbungen
              </Link>
            </li>
            <li>
              <Link className={styles.link} href="/chat/admin/ai-usage">
                AI-Kosten
              </Link>
            </li>
          </ul>
        </div>
      </nav>
      {children}
    </>
  );
}
