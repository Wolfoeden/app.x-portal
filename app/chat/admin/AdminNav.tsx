"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./admin-nav.module.css";

const LINKS = [
  { href: "/chat/admin/users", label: "Nutzer" },
  { href: "/chat/admin/profiles", label: "Freelancer-Leistung" },
  { href: "/chat/admin/freelancers", label: "Bewerbungen" },
  { href: "/chat/admin/outreach", label: "Informationspflicht" },
  { href: "/chat/admin/ai-usage", label: "AI-Kosten" },
] as const;

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className={styles.bar} aria-label="Admin-Bereich">
      <div className={styles.inner}>
        <p className={styles.brand}>XPORTAL Admin</p>
        <ul className={styles.links}>
          {LINKS.map((link) => {
            // startsWith, damit eine Detailseite die Rubrik markiert lässt.
            const active = pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  className={styles.link}
                  href={link.href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
