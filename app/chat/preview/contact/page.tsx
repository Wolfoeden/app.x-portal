import { notFound } from "next/navigation";
import { RecruitingContactDetails } from "@/components/chat/recruiting-contact-details";

export const metadata = { title: "Lokale Kontaktprüfung", robots: { index: false, follow: false } };
export default function ContactPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main style={{ maxWidth: 720, margin: "40px auto", padding: 20 }}>
    <h1>Kontaktstatus · lokale Testdaten</h1>
    <RecruitingContactDetails projectId="22222222-2222-4222-8222-222222222222" profileId="33333333-3333-4333-8333-333333333333" introductionsPath="/api/introductions" />
  </main>;
}
