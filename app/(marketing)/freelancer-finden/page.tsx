import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import { landingStats } from "@/lib/marketing/landing-stats";
import { salesContactPhotoUrl } from "@/lib/sales/sales-contact";
import { MARKETING_PAGE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(MARKETING_PAGE.find);

// Die Zahlen zum Bestand und das Foto des Ansprechpartners dürfen eine
// Stunde alt sein; die Seite bleibt statisch.
export const revalidate = 3600;

export default async function FreelancerFindPage() {
  const [stats, contactPhotoUrl] = await Promise.all([landingStats(), salesContactPhotoUrl()]);
  return <FreelancerLanding stats={stats} contactPhotoUrl={contactPhotoUrl} />;
}
