import type { Metadata } from "next";

import { CONTACT_PAGE, pageMetadata } from "@/lib/seo";

import { ContactView } from "./ContactView";

export const metadata: Metadata = pageMetadata(CONTACT_PAGE);

export default function ContactPage() {
  return <ContactView />;
}
