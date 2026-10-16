import { HomeLanding } from "@/components/home/HomeLanding";
import styles from "@/components/marketing/marketing.module.css";
import { PublicFooter, PublicFrame, PublicHeader } from "@/components/public/PublicChrome";
import { activeProfileCount } from "@/lib/marketing/profile-count";
import { salesContactPhotoUrl } from "@/lib/sales/sales-contact";
import { HOME_PAGE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(HOME_PAGE);

/** Profilzahl und Foto ändern sich selten; die Seite wird stündlich neu gebaut. */
export const revalidate = 3600;

/**
 * Die Startseite (Entwurf 3, 16.10.2026): KI für den Mittelstand, mit der
 * Live-Demo des Talent Index als Beweis. Bis zum 16.10.2026 leitete `/`
 * dauerhaft auf /fuer-unternehmen; die Seite bleibt als Einstieg in den
 * Talent Index und für den Suchbegriff „Freelancer finden“.
 */
export default async function HomePage() {
  const [profiles, photoUrl] = await Promise.all([activeProfileCount(), salesContactPhotoUrl()]);
  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">Zum Inhalt</a>
      <PublicHeader framed />
      <PublicFrame>
        <HomeLanding profiles={profiles} photoUrl={photoUrl} />
      </PublicFrame>
      <PublicFooter framed />
    </div>
  );
}
