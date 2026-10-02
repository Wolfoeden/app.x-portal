"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/BrandMark";
import { placementRequestsEnabled } from "@/lib/placement/config";

import styles from "./admin-nav.module.css";

/**
 * Die Navigation des Adminbereichs als Seitenleiste.
 *
 * Mit Übersicht, Kontakten und Systemstatus kamen drei Ziele dazu; in einer
 * Kopfzeile brach die Liste schon vorher bei 1120 px um. Eine Leiste links
 * trägt die Rubriken untereinander, lässt der Arbeitsfläche die volle Höhe
 * und ist das, was man aus jedem Betriebswerkzeug kennt. Unter 900 px wird
 * sie wieder zur Kopfzeile, die seitlich scrollt.
 */
type NavLink = { href: string; label: string; exact?: boolean };

const GROUPS: ReadonlyArray<{ label: string | null; links: readonly NavLink[] }> = [
  {
    label: null,
    links: [{ href: "/chat/admin", label: "Übersicht", exact: true }],
  },
  {
    label: "Arbeit",
    links: [
      // Nur mit eingeschaltetem Vermittlungsmodell; vorher gibt es dort nichts.
      ...(placementRequestsEnabled()
        ? [{ href: "/chat/admin/vermittlungen", label: "Vermittlungen" }]
        : []),
      { href: "/chat/admin/freelancers", label: "Bewerbungen" },
      { href: "/chat/admin/profile", label: "Profile" },
      { href: "/chat/admin/leads", label: "Leads" },
      { href: "/chat/admin/kontakte", label: "Kontakte" },
      { href: "/chat/admin/demand", label: "Nachfrage" },
    ],
  },
  {
    label: "Betrieb",
    links: [
      { href: "/chat/admin/users", label: "Nutzer" },
      { href: "/chat/admin/ai-usage", label: "KI-Kosten" },
      { href: "/chat/admin/system", label: "System" },
    ],
  },
];

const PREVIEW_HREFS: Record<string, string> = {
  "/chat/admin/freelancers": "/chat/preview/admin-pages?view=freelancers",
  "/chat/admin/leads": "/chat/preview/admin-pages?view=leads",
  "/chat/admin/users": "/chat/preview/admin-pages?view=users",
  "/chat/admin/demand": "/chat/preview/admin-pages?view=demand",
  "/chat/admin/ai-usage": "/chat/preview/admin-pages?view=ai-usage",
};

function isActive(link: NavLink, activePath: string): boolean {
  if (link.exact) return activePath === link.href || activePath === `${link.href}/`;
  // startsWith, damit eine Detailseite die Rubrik markiert lässt.
  return activePath === link.href || activePath.startsWith(`${link.href}/`);
}

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
      <div className={styles.identity}>
        <Link
          href={previewMode ? "/chat/preview" : "/chat"}
          prefetch={false}
          className={styles.brand}
          aria-label="Zur XPORTAL App"
        >
          <BrandMark height={22} />
          <span>XPORTAL</span>
        </Link>
        <span className={styles.context}>Admin</span>
      </div>
      <ul className={styles.groups}>
        {GROUPS.map((group) => (
          <li className={styles.group} key={group.label ?? "start"}>
            {group.label ? <span className={styles.groupLabel}>{group.label}</span> : null}
            <ul className={styles.links}>
              {group.links.map((link) => {
                const active = isActive(link, activePath);
                const href = previewMode ? PREVIEW_HREFS[link.href] ?? link.href : link.href;
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
      <Link
        className={styles.appLink}
        href={previewMode ? "/chat/preview" : "/chat"}
        prefetch={false}
      >
        Zur App <span aria-hidden="true">↗</span>
      </Link>
    </nav>
  );
}

/** Seitenleiste und Arbeitsfläche nebeneinander. */
export function AdminShell({
  children,
  nav,
}: {
  children: ReactNode;
  nav?: ReactNode;
}) {
  return (
    <div className={styles.shell} data-admin-surface>
      {nav ?? <AdminNav />}
      <div className={styles.main}>{children}</div>
    </div>
  );
}
