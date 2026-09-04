import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AdminMetricStrip,
  AdminPageHeader,
  AdminSectionHeader,
} from "@/components/admin/AdminDataPrimitives";
import { LEADGEN_OUTREACH_CREDITS } from "@/lib/ai/credit-policy";
import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { emailDeliveryConfigured } from "@/lib/email/deliver";
import { leadSummary, listLeads } from "@/lib/leadgen/leads-data";
import {
  LEAD_SCOPES,
  LEAD_SCOPE_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  isLeadScope,
  isLeadStatus,
  type LeadScope,
  type LeadStatus,
} from "@/lib/leadgen/limits";

import { LeadsPanel } from "./LeadsPanel";
import styles from "./leads.module.css";

export const metadata: Metadata = {
  title: "Leads | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Die Arbeitsliste der Akquise.
 *
 * Standardmäßig stehen hier nur die offenen Fälle. Ein Lead, der
 * angeschrieben oder verworfen wurde, ist bearbeitet und damit archiviert —
 * er verschwindet aus dieser Ansicht und ist über den Reiter „Archiv" wieder
 * zu finden. Eine Liste, in der Erledigtes stehen bleibt, wird mit jedem
 * Import unbrauchbarer.
 *
 * Filter, Suche und Blätterei laufen über die Adresszeile, damit ein Zustand
 * teilbar bleibt und ein Neuladen nach einer Aktion dieselbe Ansicht zeigt.
 */
function buildHref(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === 0) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `/chat/admin/leads?${query}` : "/chat/admin/leads";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    suche?: string;
    status?: string;
    kategorie?: string;
    ansicht?: string;
    seite?: string;
  }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const params = await searchParams;
  const scope: LeadScope = isLeadScope(params.ansicht) ? params.ansicht : "open";
  const status: LeadStatus | null = isLeadStatus(params.status)
    ? params.status
    : null;
  const category = params.kategorie?.trim() || null;
  const search = params.suche?.trim() || null;
  const page = Math.max(Number.parseInt(params.seite ?? "1", 10) || 1, 1);

  const [list, summary] = await Promise.all([
    listLeads({ search, status, category, scope, page }),
    leadSummary(),
  ]);

  await writeAuditEvent({
    actorUserId: currentUser.id,
    action: "leadgen_leads_admin_viewed",
    targetType: "leadgen_queue",
    outcome: "success",
    metadata: {
      scope,
      status: status ?? "all",
      listed: list.rows.length,
      searched: Boolean(search),
    },
    required: true,
  });

  const pageCount = Math.max(Math.ceil(list.total / list.pageSize), 1);
  const mailReady = emailDeliveryConfigured();

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <AdminPageHeader
          eyebrow="Admin / Arbeit"
          title="Sales-Pipeline"
          description={
            <p>
              Leads nach Bearbeitungsstand und nächstem Schritt. Einzelne Mails
              werden im Detail geprüft; die Stapelaktion erzeugt fehlende
              Entwürfe automatisch und verschickt sie direkt.
            </p>
          }
        />

        <AdminMetricStrip
          label="Lead-Pipeline"
          items={[
            {
              label: "Offen",
              value: summary.open,
              detail: "in Bearbeitung",
              tone: summary.open ? "accent" : "default",
            },
            {
              label: "Neu",
              value: summary.byStatus.new ?? 0,
              detail: "noch nicht kontaktiert",
              tone: (summary.byStatus.new ?? 0) ? "warning" : "default",
            },
            {
              label: "Angeschrieben",
              value: summary.byStatus.contacted ?? 0,
              detail: "wartet auf Reaktion",
            },
            {
              label: "Archiv",
              value: summary.archived,
              detail: `${summary.total} insgesamt`,
              tone: "muted",
            },
          ]}
        />

        {mailReady ? null : (
          <p className={styles.warning}>
            Der Mailversand ist nicht eingerichtet — ohne <code>SMTP_*</code>{" "}
            und <code>EMAIL_FROM</code> lassen sich Entwürfe erzeugen, aber
            nichts verschicken.
          </p>
        )}

        <section className={styles.filterDeck} aria-label="Lead-Filter">
          <form className={styles.filters} action="/chat/admin/leads">
            <input type="hidden" name="ansicht" value={scope} />
            <input
              className={styles.search}
              type="search"
              name="suche"
              defaultValue={search ?? ""}
              placeholder="Firma, Name, Adresse oder Ausschreibung"
              aria-label="Leads durchsuchen"
            />
            <button className={styles.searchButton} type="submit">
              Suchen
            </button>
            {search ? (
              <Link
                className={styles.clearSearch}
                href={buildHref({ ansicht: scope, status: status ?? undefined })}
              >
                Zurücksetzen
              </Link>
            ) : null}
          </form>

          <nav className={styles.tabs} aria-label="Ansicht">
            <span className={styles.filterLabel}>Ansicht</span>
          {LEAD_SCOPES.map((value) => (
            <Link
              key={value}
              href={buildHref({ ansicht: value, suche: search ?? undefined })}
              className={`${styles.tab} ${scope === value ? styles.tabActive : ""}`}
            >
              {LEAD_SCOPE_LABELS[value]}{" "}
              <b>
                {value === "open"
                  ? summary.open
                  : value === "archived"
                    ? summary.archived
                    : summary.total}
              </b>
            </Link>
          ))}
          </nav>

          <nav className={styles.tabs} aria-label="Status-Filter">
            <span className={styles.filterLabel}>Status</span>
          <Link
            href={buildHref({
              ansicht: scope,
              suche: search ?? undefined,
              kategorie: category ?? undefined,
            })}
            className={`${styles.tabSmall} ${status ? "" : styles.tabActive}`}
          >
            Alle Status
          </Link>
          {LEAD_STATUSES.map((value) => (
            <Link
              key={value}
              href={buildHref({
                ansicht: scope,
                status: value,
                suche: search ?? undefined,
                kategorie: category ?? undefined,
              })}
              className={`${styles.tabSmall} ${status === value ? styles.tabActive : ""}`}
            >
              {LEAD_STATUS_LABELS[value]}{" "}
              <b>{summary.byStatus[value] ?? 0}</b>
            </Link>
          ))}
          </nav>

        {summary.categories.length ? (
          <nav className={styles.tabs} aria-label="Kategorie-Filter">
            <span className={styles.filterLabel}>Kategorie</span>
            <Link
              href={buildHref({
                ansicht: scope,
                status: status ?? undefined,
                suche: search ?? undefined,
              })}
              className={`${styles.tabSmall} ${category ? "" : styles.tabActive}`}
            >
              Alle Kategorien
            </Link>
            {summary.categories.map((entry) => (
              <Link
                key={entry.category}
                href={buildHref({
                  ansicht: scope,
                  status: status ?? undefined,
                  kategorie: entry.category,
                  suche: search ?? undefined,
                })}
                className={`${styles.tabSmall} ${category === entry.category ? styles.tabActive : ""}`}
              >
                {entry.category} <b>{entry.count}</b>
              </Link>
            ))}
          </nav>
        ) : null}
        </section>

        <AdminSectionHeader
          title={scope === "open" ? "Offene Leads" : scope === "archived" ? "Archivierte Leads" : "Alle Leads"}
          description="Primärdaten und Status bleiben in der Zeile; Ausschreibung, Notizen und Mailentwurf öffnen sich darunter."
          aside={`${list.total} Treffer · Seite ${page}/${pageCount}`}
        />

        <LeadsPanel
          rows={list.rows}
          categories={summary.categories.map((entry) => entry.category)}
          mailReady={mailReady}
          creditsPerDraft={LEADGEN_OUTREACH_CREDITS}
        />

        {pageCount > 1 ? (
          <nav className={styles.pagination} aria-label="Seiten">
            {page > 1 ? (
              <Link
                href={buildHref({
                  ansicht: scope,
                  status: status ?? undefined,
                  kategorie: category ?? undefined,
                  suche: search ?? undefined,
                  seite: page - 1,
                })}
              >
                ← Zurück
              </Link>
            ) : (
              <span className={styles.muted}>← Zurück</span>
            )}
            <span className={styles.muted}>
              Seite {page} von {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                href={buildHref({
                  ansicht: scope,
                  status: status ?? undefined,
                  kategorie: category ?? undefined,
                  suche: search ?? undefined,
                  seite: page + 1,
                })}
              >
                Weiter →
              </Link>
            ) : (
              <span className={styles.muted}>Weiter →</span>
            )}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
