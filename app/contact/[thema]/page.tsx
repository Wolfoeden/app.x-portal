import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CONTACT_TOPICS, isContactTopicKey } from "@/lib/contact/topics";
import { CONTACT_PAGE, CONTACT_TOPIC_PAGE, pageMetadata } from "@/lib/seo";

import { ContactView } from "../ContactView";

/**
 * Die Kontaktseite je Thema (`/contact/schulung`, `/contact/freelancer`, …):
 * Überschrift und Vorauswahl im Formular passen zum Thema. Alle beim Build
 * fertig, unbekannte Themen gibt es nicht. Schulung und ISO 27001 sind seit
 * 19.10.2026 eigene Landingpages mit eigenem Titel und kanonischer Adresse;
 * für die übrigen Themen bleibt /contact kanonisch.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return CONTACT_TOPICS.map((topic) => ({ thema: topic.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ thema: string }> }): Promise<Metadata> {
  const { thema } = await params;
  const page = Object.hasOwn(CONTACT_TOPIC_PAGE, thema)
    ? CONTACT_TOPIC_PAGE[thema as keyof typeof CONTACT_TOPIC_PAGE]
    : CONTACT_PAGE;
  return pageMetadata(page);
}

export default async function ContactTopicPage({ params }: { params: Promise<{ thema: string }> }) {
  const { thema } = await params;
  if (!isContactTopicKey(thema)) notFound();
  return <ContactView topic={thema} />;
}
