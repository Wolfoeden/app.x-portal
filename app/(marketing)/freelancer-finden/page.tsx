import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import { salesContactPhotoUrl } from "@/lib/sales/sales-contact";
import { MARKETING_PAGE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(MARKETING_PAGE.find);

export default async function FreelancerFindPage() {
  const contactPhotoUrl = await salesContactPhotoUrl();
  return <FreelancerLanding contactPhotoUrl={contactPhotoUrl} />;
}
