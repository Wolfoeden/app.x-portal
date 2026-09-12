import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/BrandMark";
import { LegalFooter } from "@/components/LegalFooter";
import { ProjectLink } from "@/components/marketing/MarketingPage";
import { MARKETING_PAGE } from "@/lib/seo";
import styles from "@/components/marketing/marketing.module.css";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">Zum Inhalt</a>
      <header className={styles.siteHeader}>
        <Link href={MARKETING_PAGE.find.path} className={styles.brand} aria-label="XPORTAL – Freelancer finden">
          <BrandMark height={27} /><span>XPORTAL</span>
        </Link>
        <nav className={styles.navigation} aria-label="Hauptnavigation">
          <Link href={MARKETING_PAGE.find.path}>Freelancer finden</Link>
          <Link href={MARKETING_PAGE.it.path}>IT-Projekte</Link>
          <Link href={MARKETING_PAGE.matching.path}>KI-Matching</Link>
          <Link href={MARKETING_PAGE.how.path}>So funktioniert’s</Link>
        </nav>
        <ProjectLink />
      </header>
      {children}
      <div className={styles.footer}>
        <div className={styles.footerIntro}>
          <strong>XPORTAL</strong>
          <p>Passende Freelancer finden.<br />Die Gründe nachvollziehen. Selbst entscheiden.</p>
          <Link href="/freelancer/apply">Als Freelancer bewerben ↗</Link>
        </div>
        <LegalFooter />
      </div>
    </div>
  );
}
