import { startDisplay } from "@/components/home/fonts";
import { HomeLanding } from "@/components/home/HomeLanding";
import styles from "@/components/home/start.module.css";
import { PublicFooter, PublicHeader } from "@/components/public/PublicChrome";
import { activeProfileCount } from "@/lib/marketing/profile-count";
import { HOME_PAGE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(HOME_PAGE);

/** Die Profilzahl ändert sich selten; die Seite wird stündlich neu gebaut. */
export const revalidate = 3600;

/**
 * Die Startseite (Entwurf „Klarsicht“, 19.10.2026): KI-Automatisierung für den
 * Mittelstand mit Preis, dazu die Live-Demo des Talent Index als Beweis. Weiß
 * und ohne den grünen Rahmen der übrigen Seiten. Bis zum 16.10.2026 leitete
 * `/` dauerhaft auf /fuer-unternehmen; die Seite bleibt als Einstieg in den
 * Talent Index und für den Suchbegriff „Freelancer finden“.
 */
export default async function HomePage() {
  const profiles = await activeProfileCount();
  return (
    <div className={`${styles.shell} ${startDisplay.variable}`}>
      <a href="#main-content" className="skip-link">Zum Inhalt</a>
      <PublicHeader />
      <HomeLanding profiles={profiles} />
      <PublicFooter />
    </div>
  );
}
