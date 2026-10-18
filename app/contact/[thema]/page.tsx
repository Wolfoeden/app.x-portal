import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CONTACT_TOPICS, isContactTopicKey } from "@/lib/contact/topics";
import { CONTACT_PAGE, pageMetadata } from "@/lib/seo";

import { ContactView } from "../ContactView";

/**
 * Die Kontaktseite je Thema (`/contact/schulung`, `/contact/freelancer`, …):
 * Überschrift und Vorauswahl im Formular passen zum Thema. Alle beim Build
 * fertig, unbekannte Themen gibt es nicht. Kanonisch bleibt /contact.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return CONTACT_TOPICS.map((topic) => ({ thema: topic.key }));
}

export const metadata: Metadata = pageMetadata(CONTACT_PAGE);

export default async function ContactTopicPage({ params }: { params: Promise<{ thema: string }> }) {
  const { thema } = await params;
  if (!isContactTopicKey(thema)) notFound();
  return <ContactView topic={thema} />;
}
