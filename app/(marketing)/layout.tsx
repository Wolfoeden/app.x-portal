import type { ReactNode } from "react";

import { PublicFooter, PublicHeader } from "@/components/public/PublicChrome";
import styles from "@/components/marketing/marketing.module.css";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">Zum Inhalt</a>
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
