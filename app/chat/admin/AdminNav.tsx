"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./admin-nav.module.css";

const GROUPS = [
  {
    label: "Arbeit",
    links: [
      { href: "/chat/admin/inbox", label: "Inbox" },
      { href: "/chat/admin/freelancers", label: "Bewerbungen" },
      { href: "/chat/admin/leads", label: "Leads" },
    ],
  },
  {
    label: "Analyse",
    links: [
      { href: "/chat/admin/users", label: "Nutzer" },
      { href: "/chat/admin/demand", label: "Nachfrage" },
      { href: "/chat/admin/profiles", label: "Profil-Performance" },
    ],
  },
  {
    label: "Betrieb",
    links: [
      { href: "/chat/admin/outreach", label: "Informationspflicht" },
      { href: "/chat/admin/ai-usage", label: "AI-Kosten" },
    ],
  },
] as const;

const PREVIEW_HREFS: Record<string, string> = {
  "/chat/admin/inbox": "/chat/preview/admin-inbox",
  "/chat/admin/freelancers": "/chat/preview/admin-pages?view=freelancers",
  "/chat/admin/leads": "/chat/preview/admin-pages?view=leads",
  "/chat/admin/users": "/chat/preview/admin-pages?view=users",
  "/chat/admin/demand": "/chat/preview/admin-pages?view=demand",
  "/chat/admin/profiles": "/chat/preview/admin-pages?view=profiles",
  "/chat/admin/outreach": "/chat/preview/admin-pages?view=outreach",
  "/chat/admin/ai-usage": "/chat/preview/admin-pages?view=ai-usage",
};

export function AdminNav({
  activeHref,
  disablePrefetch = false,
  previewMode = false,
}: {
  activeHref?: string;
  disablePrefetch?: boolean;
  previewMode?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const activePath = activeHref ?? pathname;

  return (
    <nav className={styles.bar} aria-label="Admin-Bereich">
      <div className={styles.inner}>
        <p className={styles.brand}>XPORTAL Admin</p>
        <ul className={styles.groups}>
          {GROUPS.map((group) => (
            <li className={styles.group} key={group.label}>
              <span className={styles.groupLabel}>{group.label}</span>
              <ul className={styles.links}>
                {group.links.map((link) => {
                  // startsWith, damit eine Detailseite die Rubrik markiert lässt.
                  const active = activePath.startsWith(link.href);
                  const href = previewMode
                    ? PREVIEW_HREFS[link.href] ?? link.href
                    : link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        className={styles.link}
                        href={href}
                        prefetch={disablePrefetch || previewMode ? false : undefined}
                        data-active={active}
                        aria-current={active ? "page" : undefined}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
