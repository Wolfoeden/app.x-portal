import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AdminPageHeader, AdminSurface } from "@/components/admin/AdminDataPrimitives";
import { Card, StatusBadge, cockpitStyles as styles } from "@/components/admin/Cockpit";
import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getContact } from "@/lib/crm/contacts-data";
import {
  CONTACT_STAGE_LABELS,
  EMAIL_KIND_LABELS,
  berlinToday,
  isFollowUpDue,
  type ContactEvent,
} from "@/lib/crm/contacts-model";

import { ContactEditor } from "./ContactEditor";

export const metadata: Metadata = {
  title: "Kontakt | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

function eventText(event: ContactEvent): string {
  switch (event.kind) {
    case "stage":
      return `Stufe ${event.fromStage ? CONTACT_STAGE_LABELS[event.fromStage] : "—"} → ${event.toStage ? CONTACT_STAGE_LABELS[event.toStage] : "—"}`;
    case "mail_drafted":
      return event.body ?? "Angeschrieben";
    case "imported":
      return event.body ?? "Importiert";
    default:
      return event.body ?? "Geändert";
  }
}

function Link({ href }: { href: string | null }) {
  if (!href) return <>—</>;
  return (
    <a className={styles.textLink} href={href} target="_blank" rel="noopener noreferrer">
      {href.replace(/^https?:\/\/(www\.)?/u, "").slice(0, 70)} ↗
    </a>
  );
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) redirect(`${appPath("/chat")}?admin-login=1`);
  if (!currentUser.isAdmin) notFound();

  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const found = await getContact(id);
  if (!found) notFound();
  const { contact, events } = found;
  const due = isFollowUpDue(contact, berlinToday());

  return (
    <AdminSurface label="Administration · Kontakt">
      <AdminPageHeader
        eyebrow="Admin / Kontakte"
        title={contact.contactName ?? contact.company}
        titleMeta={
          <span style={{ display: "inline-flex", gap: 6 }}>
            <StatusBadge tone={contact.stage === "do_not_contact" ? "critical" : contact.stage === "new" ? "neutral" : "good"}>
              {CONTACT_STAGE_LABELS[contact.stage]}
            </StatusBadge>
            {due ? <StatusBadge tone="warning">Wiedervorlage fällig</StatusBadge> : null}
          </span>
        }
        description={<p>{[contact.roleTitle, contact.company, contact.region].filter(Boolean).join(" · ")}</p>}
        backHref="/chat/admin/kontakte"
        backLabel="Alle Kontakte"
      />

      <div className={styles.cockpit}>
        <div className={styles.grid}>
          <Card title="Arbeit" className={styles.span7}>
            <ContactEditor contact={contact} />
          </Card>
          <Card title="Angaben" className={styles.span5}>
            <div className={styles.cardBody}>
              <dl className={styles.facts}>
                <dt>Unternehmen</dt>
                <dd>{contact.company}</dd>
                <dt>Typ</dt>
                <dd>{contact.kind ?? "—"}</dd>
                <dt>Funktion</dt>
                <dd>{contact.roleTitle ?? "—"}</dd>
                <dt>Region</dt>
                <dd>{contact.region ?? "—"}</dd>
                <dt>AI-Bezug</dt>
                <dd>{contact.focus ?? "—"}</dd>
                <dt>E-Mail</dt>
                <dd>
                  {contact.email ?? "—"}
                  <div className={styles.muted}>{EMAIL_KIND_LABELS[contact.emailKind]}</div>
                </dd>
                <dt>Quelle der Adresse</dt>
                <dd>
                  <Link href={contact.emailSourceUrl} />
                </dd>
                <dt>Projekt</dt>
                <dd>
                  <Link href={contact.projectUrl} />
                </dd>
                <dt>Hinweis</dt>
                <dd>{contact.note ?? "—"}</dd>
                <dt>Herkunft</dt>
                <dd>{contact.source}</dd>
                <dt>Zuletzt angeschrieben</dt>
                <dd>{contact.lastContactedAt ? dateTime(contact.lastContactedAt) : "—"}</dd>
              </dl>
            </div>
          </Card>
          <Card title="Verlauf" className={styles.span12}>
            {events.length ? (
              <ol className={styles.timeline}>
                {events.map((event) => (
                  <li key={event.id}>
                    <time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time>
                    <span>{eventText(event)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>Noch nichts geschehen.</p>
            )}
          </Card>
        </div>
      </div>
    </AdminSurface>
  );
}
