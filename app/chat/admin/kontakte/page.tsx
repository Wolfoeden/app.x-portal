import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminDisclosure, AdminPageHeader, AdminSurface } from "@/components/admin/AdminDataPrimitives";
import { Card, StatTiles, StatusBadge, cockpitStyles as styles, type StatusTone } from "@/components/admin/Cockpit";
import { appPath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth/current-user";
import { contactSummary, listContacts, type ContactFilter } from "@/lib/crm/contacts-data";
import {
  CONTACT_STAGE_LABELS,
  EMAIL_KIND_LABELS,
  OPEN_CONTACT_STAGES,
  berlinToday,
  isContactStage,
  isFollowUpDue,
  type ContactStage,
} from "@/lib/crm/contacts-model";

import { ContactImport } from "./ContactImport";

export const metadata: Metadata = {
  title: "Kontakte | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STAGE_TONE: Readonly<Record<ContactStage, StatusTone>> = {
  new: "neutral",
  contacted: "warning",
  replied: "good",
  meeting: "good",
  customer: "good",
  not_interested: "neutral",
  do_not_contact: "critical",
};

type Params = { suche?: string; stufe?: string; typ?: string; mail?: string; faellig?: string; seite?: string };

function buildHref(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === 0) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `/chat/admin/kontakte?${query}` : "/chat/admin/kontakte";
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

/**
 * Die Kontakte für die eigene Akquise: Recruiter und Auftraggeber, die
 * immer wieder AI-Projekte besetzen.
 *
 * Standardmäßig stehen nur die offenen Kontakte da, die mit fälliger
 * Wiedervorlage zuerst. Filter laufen über die Adresszeile, damit eine
 * Ansicht teilbar bleibt und ein Neuladen dieselbe zeigt.
 */
export default async function ContactsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) redirect(`${appPath("/chat")}?admin-login=1`);
  if (!currentUser.isAdmin) notFound();

  const params = await searchParams;
  const today = berlinToday();
  const stage: ContactFilter["stage"] =
    params.stufe === "alle" ? null : isContactStage(params.stufe) ? params.stufe : "open";
  const filter: ContactFilter = {
    search: params.suche?.trim() || null,
    stage,
    kind: params.typ?.trim() || null,
    email: params.mail === "mit" ? "with" : params.mail === "ohne" ? "without" : null,
    due: params.faellig === "1",
    today,
    page: Math.max(Number.parseInt(params.seite ?? "1", 10) || 1, 1),
  };

  const [list, summary] = await Promise.all([listContacts(filter), contactSummary(today)]);
  const openCount = OPEN_CONTACT_STAGES.reduce((sum, value) => sum + summary.byStage[value], 0);
  const pageCount = Math.max(Math.ceil(list.total / list.pageSize), 1);
  const current = {
    suche: filter.search,
    stufe: params.stufe,
    typ: filter.kind,
    mail: params.mail,
    faellig: filter.due ? "1" : null,
  };

  const tabs: Array<{ value: string | undefined; label: string; count: number }> = [
    { value: undefined, label: "Offen", count: openCount },
    ...OPEN_CONTACT_STAGES.map((value) => ({ value, label: CONTACT_STAGE_LABELS[value], count: summary.byStage[value] })),
    { value: "customer", label: CONTACT_STAGE_LABELS.customer, count: summary.byStage.customer },
    { value: "not_interested", label: CONTACT_STAGE_LABELS.not_interested, count: summary.byStage.not_interested },
    { value: "do_not_contact", label: CONTACT_STAGE_LABELS.do_not_contact, count: summary.byStage.do_not_contact },
    { value: "alle", label: "Alle", count: summary.total },
  ];

  return (
    <AdminSurface label="Administration · Kontakte">
      <AdminPageHeader
        eyebrow="Admin / Arbeit"
        title="Kontakte"
        backHref={null}
        description={
          <p>
            Recruiter und Auftraggeber für die eigene Ansprache. XPORTAL bereitet die Mail vor, geschrieben wird
            sie aus dem eigenen Postfach — einzeln, nicht als Serie.
          </p>
        }
      />

      <div className={styles.cockpit}>
        <StatTiles
          label="Kontakte in Zahlen"
          tiles={[
            {
              label: "Wiedervorlage fällig",
              value: summary.due.toLocaleString("de-DE"),
              detail: "heute oder früher",
              href: buildHref({ faellig: "1" }),
            },
            {
              label: "Neu mit Adresse",
              value: summary.byStage.new.toLocaleString("de-DE"),
              detail: "noch nicht angeschrieben",
              href: buildHref({ stufe: "new", mail: "mit" }),
            },
            {
              label: "Im Gespräch",
              value: (summary.byStage.replied + summary.byStage.meeting).toLocaleString("de-DE"),
              detail: "Antwort oder Termin",
            },
            {
              label: "Kunden",
              value: summary.byStage.customer.toLocaleString("de-DE"),
              detail: `von ${summary.total.toLocaleString("de-DE")} Kontakten`,
            },
            {
              label: "Mit E-Mail-Adresse",
              value: summary.withEmail.toLocaleString("de-DE"),
              detail: `${(summary.total - summary.withEmail).toLocaleString("de-DE")} nur Formular oder Telefon`,
            },
          ]}
        />

        <AdminDisclosure title="Kontakte importieren" summary="Aus Excel einfügen oder CSV wählen">
          <ContactImport />
        </AdminDisclosure>

        <Card title={`${list.total.toLocaleString("de-DE")} Kontakte`}>
          <div className={styles.cardBody} style={{ display: "grid", gap: 12 }}>
            <nav aria-label="Stufe" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tabs.map((tab) => {
                const active = (params.stufe ?? undefined) === tab.value;
                return (
                  <Link
                    key={tab.label}
                    href={buildHref({ ...current, stufe: tab.value, seite: undefined })}
                    className={active ? styles.buttonPrimary : styles.button}
                    aria-current={active ? "page" : undefined}
                    prefetch={false}
                  >
                    {tab.label} <span style={{ opacity: 0.7 }}>{tab.count}</span>
                  </Link>
                );
              })}
            </nav>
            <form method="get" action="/chat/admin/kontakte" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
              {params.stufe ? <input type="hidden" name="stufe" value={params.stufe} /> : null}
              <label className={styles.field}>
                Suche
                <input className={styles.input} name="suche" defaultValue={filter.search ?? ""} placeholder="Firma, Person, Adresse, Thema" />
              </label>
              <label className={styles.field}>
                Typ
                <select className={styles.select} name="typ" defaultValue={filter.kind ?? ""}>
                  <option value="">Alle</option>
                  {summary.kinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                E-Mail
                <select className={styles.select} name="mail" defaultValue={params.mail ?? ""}>
                  <option value="">Alle</option>
                  <option value="mit">Mit Adresse</option>
                  <option value="ohne">Ohne Adresse</option>
                </select>
              </label>
              <label className={styles.field} style={{ flexDirection: "row", alignItems: "center", display: "flex", gap: 6, minHeight: 34 }}>
                <input type="checkbox" name="faellig" value="1" defaultChecked={filter.due} /> Nur fällige
              </label>
              <button type="submit" className={styles.button}>
                Filtern
              </button>
              {filter.search || filter.kind || params.mail || filter.due ? (
                <Link className={styles.textLink} href={buildHref({ stufe: params.stufe })} prefetch={false}>
                  Filter zurücksetzen
                </Link>
              ) : null}
            </form>
          </div>

          {list.rows.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Kontakt</th>
                    <th scope="col">Unternehmen</th>
                    <th scope="col">Bezug</th>
                    <th scope="col">E-Mail</th>
                    <th scope="col">Stufe</th>
                    <th scope="col">Wiedervorlage</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((contact) => {
                    const due = isFollowUpDue(contact, today);
                    return (
                      <tr key={contact.id}>
                        <td>
                          <Link href={`/chat/admin/kontakte/${contact.id}`} prefetch={false}>
                            {contact.contactName ?? "Ohne Namen"}
                          </Link>
                          {contact.roleTitle ? <div className={styles.muted}>{contact.roleTitle}</div> : null}
                        </td>
                        <td>
                          {contact.company}
                          <div className={styles.muted}>{[contact.kind, contact.region].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className={styles.muted} style={{ maxWidth: 260 }}>
                          {contact.focus ?? "—"}
                        </td>
                        <td>
                          {contact.email ? (
                            <>
                              <span style={{ wordBreak: "break-all" }}>{contact.email}</span>
                              <div className={styles.muted}>{EMAIL_KIND_LABELS[contact.emailKind]}</div>
                            </>
                          ) : (
                            <span className={styles.muted}>keine</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge tone={STAGE_TONE[contact.stage]}>{CONTACT_STAGE_LABELS[contact.stage]}</StatusBadge>
                        </td>
                        <td className={styles.num}>
                          {due ? <StatusBadge tone="warning">fällig {dateLabel(contact.nextFollowUpOn)}</StatusBadge> : dateLabel(contact.nextFollowUpOn)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.empty}>
              {summary.total ? "Keine Kontakte in dieser Ansicht." : "Noch keine Kontakte. Oben lassen sie sich aus einer Tabelle importieren."}
            </p>
          )}

          {pageCount > 1 ? (
            <nav aria-label="Seiten" className={styles.cardBody} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {filter.page > 1 ? (
                <Link className={styles.button} href={buildHref({ ...current, seite: filter.page - 1 })} prefetch={false}>
                  Zurück
                </Link>
              ) : null}
              <span className={styles.muted}>
                Seite {filter.page} von {pageCount}
              </span>
              {filter.page < pageCount ? (
                <Link className={styles.button} href={buildHref({ ...current, seite: filter.page + 1 })} prefetch={false}>
                  Weiter
                </Link>
              ) : null}
            </nav>
          ) : null}
        </Card>
      </div>
    </AdminSurface>
  );
}
