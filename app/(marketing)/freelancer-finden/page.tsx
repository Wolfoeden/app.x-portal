import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import { landingStats } from "@/lib/marketing/landing-stats";
import { MARKETING_PAGE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(MARKETING_PAGE.find);

// Die Zahlen zum Bestand dürfen eine Stunde alt sein; die Seite bleibt statisch.
export const revalidate = 3600;

export default async function FreelancerFindPage() {
  return <FreelancerLanding stats={await landingStats()} />;
}
