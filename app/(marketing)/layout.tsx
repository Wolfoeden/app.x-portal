import type { ReactNode } from "react";

import { PublicFooter, PublicFrame, PublicHeader } from "@/components/public/PublicChrome";
import styles from "@/components/marketing/marketing.module.css";

/**
 * Rahmen der Marketing-Seiten nach dem Vorbild von apollo.io: Kopf und
 * Fußzeile auf hellem Grau, der Inhalt als weiße Karte dazwischen.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">Zum Inhalt</a>
      <PublicHeader framed />
      <PublicFrame>{children}</PublicFrame>
      <PublicFooter />
    </div>
  );
}
