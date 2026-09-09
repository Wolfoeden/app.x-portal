import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AdminDisclosure,
  AdminMetricStrip,
  AdminPageHeader,
  AdminSectionHeader,
} from "@/components/admin/AdminDataPrimitives";
import { LEADGEN_OUTREACH_CREDITS } from "@/lib/ai/credit-policy";
import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { promotionalDeliveryConfigured } from "@/lib/email/deliver";
import {
  herkunftsHinweis,
  naechsterSchritt,
  versandDetail,
} from "@/lib/leadgen/dashboard";
import {
  leadSummary,
  listLeadRuns,
  listLeads,
  listOutreach,
  type LeadPipeline,
  type LeadRun,
} from "@/lib/leadgen/leads-data";
import {
  LEAD_BULK_SEND_LIMIT,
  LEAD_MATCH_FILTERS,
  LEAD_MATCH_FILTER_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_VIEWS,
  LEAD_VIEW_LABELS,
  isLeadMatchFilter,
  isLeadStatus,
  isLeadView,
  viewShowsMessages,
  viewToScope,
  type LeadMatchFilter,
  type LeadScope,
  type LeadStatus,
  type LeadView,
} from "@/lib/leadgen/limits";

import { LeadsPanel } from "./LeadsPanel";
import { OutreachPanel } from "./OutreachPanel";
import { PrepareAllButton } from "./PrepareAllButton";
import { RematchButton } from "./RematchButton";
import { SendNowButton } from "./SendNowButton";
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

/**
 * Wie oft ein Abgleich jemanden gefunden hat.
 *
 * Bezogen auf das Abgeglichene und nicht auf die ganze Warteschlange: Solange
 * zweihundert Leads unbearbeitet liegen, sagt eine Quote über alle nur, wie
 * weit der Lauf gekommen ist.
 */
function trefferquote(pipeline: LeadPipeline): string {
  if (!pipeline.abgeglichen) return "noch kein Abgleich";
  const anteil = Math.round((pipeline.treffer / pipeline.abgeglichen) * 100);
  return `${anteil} % der Abgleiche`;
}

const ABSCHNITT_TITEL: Readonly<Record<LeadView, string>> = {
  open: "Offene Leads",
  prepared: "Wartet auf Versand",
  sent: "Versandte Nachrichten",
  archived: "Archivierte Leads",
  all: "Alle Leads",
};

const ABSCHNITT_BESCHREIBUNG: Readonly<Record<LeadView, string>> = {
  open:
    "Primärdaten und Status bleiben in der Zeile; Ausschreibung, Notizen und Mailentwurf öffnen sich darunter.",
  prepared:
    "Die fertigen Entwürfe in der Reihenfolge, in der sie rausgehen — der älteste zuerst.",
  sent:
    "Was tatsächlich rausging, mit Wortlaut. Bleibt auch stehen, wenn der Lead aus der Warteschlange verschwunden ist.",
  archived: "Bearbeitete Leads: angeschrieben, beantwortet oder verworfen.",
  all: "Die ganze Warteschlange, unabhängig vom Bearbeitungsstand.",
};

/** Die Zahl am Reiter — je nach Ansicht aus einem anderen Bestand. */
function ansichtZahl(
  value: LeadView,
  summary: { open: number; archived: number; total: number; pipeline: LeadPipeline },
): number {
  switch (value) {
    case "open":
      return summary.open;
    case "prepared":
      return summary.pipeline.vorbereitet;
    case "sent":
      return summary.pipeline.verschickt;
    case "archived":
      return summary.archived;
    default:
      return summary.total;
  }
}

const STOP_LABELS: Readonly<Record<LeadRun["stopped_by"], string>> = {
  queue_empty: "Warteschlange leer",
  time: "Zeit alle",
  examined: "Stapel voll",
  daily_limit: "Tagesmenge erreicht",
  outside_window: "außerhalb des Fensters",
  nothing_prepared: "nichts vorbereitet",
};

const runTime = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function laufZeit(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "–" : runTime.format(parsed);
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    suche?: string;
    status?: string;
    kategorie?: string;
    ansicht?: string;
    abgleich?: string;
    seite?: string;
  }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const params = await searchParams;
  const view: LeadView = isLeadView(params.ansicht) ? params.ansicht : "open";
  const scope: LeadScope = viewToScope(view);
  const zeigtNachrichten = viewShowsMessages(view);
  const status: LeadStatus | null = isLeadStatus(params.status)
    ? params.status
    : null;
  const category = params.kategorie?.trim() || null;
  const search = params.suche?.trim() || null;
  const match: LeadMatchFilter | null = isLeadMatchFilter(params.abgleich)
    ? params.abgleich
    : null;
  const page = Math.max(Number.parseInt(params.seite ?? "1", 10) || 1, 1);

  // Nur die Liste holen, die gezeigt wird. Der Trichter und die Läufe gelten
  // für beide Ansichten.
  const [list, messages, summary, runs] = await Promise.all([
    zeigtNachrichten
      ? Promise.resolve(null)
      : listLeads({ search, status, category, scope, match, page }),
    zeigtNachrichten
      ? listOutreach({
          state: view === "prepared" ? "draft" : "sent",
          search,
          page,
        })
      : Promise.resolve(null),
    leadSummary(),
    listLeadRuns(4),
  ]);

  const gezeigt = list?.rows.length ?? messages?.rows.length ?? 0;
  const gesamtTreffer = list?.total ?? messages?.total ?? 0;
  const seitengroesse = list?.pageSize ?? messages?.pageSize ?? 50;

  await writeAuditEvent({
    actorUserId: currentUser.id,
    action: "leadgen_leads_admin_viewed",
    targetType: "leadgen_queue",
    outcome: "success",
    metadata: {
      view,
      scope,
      status: status ?? "all",
      match: match ?? "all",
      listed: gezeigt,
      searched: Boolean(search),
    },
    required: true,
  });

  const pageCount = Math.max(Math.ceil(gesamtTreffer / seitengroesse), 1);
  const mailReady = promotionalDeliveryConfigured();
  // Die Filterzahlen gelten je Ansicht: „Kein Treffer" öffnet unter „Offen"
  // eine andere Menge als unter „Archiv".
  const abgleichZahlen = summary.byMatch?.[scope] ?? null;

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <AdminPageHeader
          eyebrow="Admin / Arbeit"
          title="Sales-Pipeline"
          description={
            <p>
              Der Abgleich hält jeden offenen Lead gegen den Katalog und legt
              bei einem Treffer einen Entwurf an. Verschickt wird daraus
              werktags zwischen 8 und 12 Uhr, höchstens{" "}
              {LEAD_BULK_SEND_LIMIT} am Tag.
            </p>
          }
        />

        {/* Oben steht nur, was Arbeit ist. Zehn Kacheln nebeneinander, von
            denen sieben Vergangenheit sind, lassen die drei, auf die es
            ankommt, verschwinden — und die Vergangenheit zählt Vorgänge,
            während die Arbeit Leads zählt. Der Rest steht unten im Verlauf,
            zugeklappt. */}
        <AdminMetricStrip
          label="Zu tun"
          items={[
            {
              label: "Abzugleichen",
              value: summary.pipeline.abzugleichen,
              detail: "ohne Entwurf, noch offen",
              tone: summary.pipeline.abzugleichen ? "warning" : "muted",
            },
            {
              label: "Wartet auf Versand",
              value: summary.pipeline.vorbereitet,
              detail: "Entwurf liegt bereit",
              tone: summary.pipeline.vorbereitet ? "accent" : "muted",
            },
            {
              label: "Heute verschickt",
              value: summary.pipeline.verschicktHeute,
              ...versandDetail(
                summary.pipeline.verschicktHeute,
                LEAD_BULK_SEND_LIMIT,
              ),
            },
          ]}
        />

        <p className={styles.runs}>
          <span className={styles.filterLabel}>Nächster Schritt</span>
          <span className={styles.run}>
            {naechsterSchritt({
              abzugleichen: summary.pipeline.abzugleichen,
              vorbereitet: summary.pipeline.vorbereitet,
              verschicktHeute: summary.pipeline.verschicktHeute,
              tagesmenge: LEAD_BULK_SEND_LIMIT,
              mailReady,
            })}
          </span>
        </p>

        <PrepareAllButton offen={summary.pipeline.abzugleichen} />

        <SendNowButton
          wartend={summary.pipeline.vorbereitet}
          heuteVerschickt={summary.pipeline.verschicktHeute}
          tagesmenge={LEAD_BULK_SEND_LIMIT}
          mailReady={mailReady}
        />
        <RematchButton archiviert={summary.archived} />


        {runs.length ? (
          <p className={styles.runs}>
            <span className={styles.filterLabel}>Letzte Läufe</span>
            {runs.map((run) => (
              <span className={styles.run} key={run.id}>
                {laufZeit(run.started_at)}
                {run.dry_run ? " (Probe)" : ""}:{" "}
                {run.kind === "prepare" ? "Abgleich" : "Versand"}{", "}
                <b>{run.examined}</b> geprüft,{" "}
                <b>{run.sent}</b>{" "}
                {run.kind === "prepare" ? "vorbereitet" : "verschickt"}
                {run.archived ? (
                  <>
                    {", "}
                    <b>{run.archived}</b> archiviert
                  </>
                ) : null}
                {run.remaining ? `, ${run.remaining} offen` : ""}
                <span className={styles.runStopped}>
                  {" · "}
                  {STOP_LABELS[run.stopped_by]}
                </span>
              </span>
            ))}
          </p>
        ) : null}

        {/* Der Verlauf zählt Vorgänge und nicht Leads, und die meisten seiner
            Zeilen hängen an Leads, die es nicht mehr gibt. Beides steht
            ausgeschrieben dabei — aufgeklappt neben der Arbeitsliste hat es
            nur Fragen erzeugt. */}
        <AdminDisclosure
          title="Verlauf"
          summary={`${summary.pipeline.abgeglichen} Abgleiche · ${summary.pipeline.verschickt} verschickt · ${summary.pipeline.beantwortet} Antworten`}
        >
          <AdminMetricStrip
            label="Ergebnis insgesamt"
            items={[
              {
                label: "Abgeglichen",
                value: summary.pipeline.abgeglichen,
                detail: herkunftsHinweis(
                  summary.pipeline.abgleichOhneLead,
                  summary.pipeline.abgeglichen,
                ),
              },
              {
                label: "Treffer",
                value: summary.pipeline.treffer,
                detail: trefferquote(summary.pipeline),
                tone: summary.pipeline.treffer ? "accent" : "default",
              },
              {
                label: "Ohne Treffer",
                value: summary.pipeline.ohneTreffer,
                detail: "als Nachfrage vermerkt",
                tone: "muted",
              },
              {
                label: "Verschickt",
                value: summary.pipeline.verschickt,
                detail: herkunftsHinweis(
                  summary.pipeline.belegOhneLead,
                  summary.pipeline.verschickt,
                ),
              },
              {
                label: "Gescheitert",
                value: summary.pipeline.gescheitert,
                detail: "nicht zugestellt",
                tone: summary.pipeline.gescheitert ? "warning" : "muted",
              },
              {
                label: "Antwort da",
                value: summary.pipeline.beantwortet,
                detail: "hat reagiert",
                tone: summary.pipeline.beantwortet ? "accent" : "muted",
              },
            ]}
          />
          <p className={styles.hint}>
            Ein Vorgang überlebt den Lead, an dem er hing: Abgleich und
            Versandbeleg bleiben stehen, wenn der Lead aus der Warteschlange
            verschwindet. Deshalb sind diese Zahlen größer als die
            Warteschlange — und deshalb lässt sich der größere Teil davon
            nicht mehr in der Liste öffnen.
          </p>
        </AdminDisclosure>

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
            {LEAD_VIEWS.map((value) => (
              <Link
                key={value}
                href={buildHref({
                  ansicht: value,
                  suche: search ?? undefined,
                  // Der Abgleich-Filter gilt nur für die Warteschlange. Ihn in
                  // eine Nachrichtenliste mitzunehmen ergäbe einen aktiven
                  // Filter, der dort nichts tut.
                  abgleich: viewShowsMessages(value)
                    ? undefined
                    : (match ?? undefined),
                })}
                className={`${styles.tab} ${view === value ? styles.tabActive : ""}`}
              >
                {LEAD_VIEW_LABELS[value]}{" "}
                <b>{ansichtZahl(value, summary)}</b>
              </Link>
            ))}
          </nav>

          {zeigtNachrichten ? null : (
          <>
          <nav className={styles.tabs} aria-label="Status-Filter">
            <span className={styles.filterLabel}>Status</span>
          <Link
            href={buildHref({
              ansicht: scope,
              suche: search ?? undefined,
              kategorie: category ?? undefined,
              abgleich: match ?? undefined,
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
                abgleich: match ?? undefined,
              })}
              className={`${styles.tabSmall} ${status === value ? styles.tabActive : ""}`}
            >
              {LEAD_STATUS_LABELS[value]}{" "}
              <b>{summary.byStatus[value] ?? 0}</b>
            </Link>
          ))}
          </nav>

          <nav className={styles.tabs} aria-label="Abgleich-Filter">
            <span className={styles.filterLabel}>Abgleich</span>
            <Link
              href={buildHref({
                ansicht: scope,
                status: status ?? undefined,
                kategorie: category ?? undefined,
                abgleich: match ?? undefined,
                suche: search ?? undefined,
              })}
              className={`${styles.tabSmall} ${match ? "" : styles.tabActive}`}
            >
              Alle
            </Link>
            {LEAD_MATCH_FILTERS.map((value) => (
              <Link
                key={value}
                href={buildHref({
                  ansicht: scope,
                  status: status ?? undefined,
                  kategorie: category ?? undefined,
                  abgleich: value,
                  suche: search ?? undefined,
                })}
                className={`${styles.tabSmall} ${match === value ? styles.tabActive : ""}`}
              >
                {LEAD_MATCH_FILTER_LABELS[value]}
                {/* Die Zahl zählt die Leads dieser Ansicht — dieselbe Menge,
                    die der Filter öffnet. Vorher standen hier die Vorgänge
                    aus `shortlists`, und „Kein Treffer 244" führte auf sieben
                    Zeilen. Fehlt die Zählung, steht hier gar keine Zahl. */}
                {abgleichZahlen ? <> <b>{abgleichZahlen[value]}</b></> : null}
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
          </>
          )}
        </section>

        <AdminSectionHeader
          title={ABSCHNITT_TITEL[view]}
          description={ABSCHNITT_BESCHREIBUNG[view]}
          aside={`${gesamtTreffer} Treffer · Seite ${page}/${pageCount}`}
        />

        {messages ? (
          <OutreachPanel
            rows={messages.rows}
            view={view === "prepared" ? "prepared" : "sent"}
            mailReady={mailReady}
          />
        ) : list ? (
          <LeadsPanel
            rows={list.rows}
            categories={summary.categories.map((entry) => entry.category)}
            mailReady={mailReady}
            creditsPerDraft={LEADGEN_OUTREACH_CREDITS}
          />
        ) : null}

        {pageCount > 1 ? (
          <nav className={styles.pagination} aria-label="Seiten">
            {page > 1 ? (
              <Link
                href={buildHref({
                  ansicht: scope,
                  status: status ?? undefined,
                  kategorie: category ?? undefined,
                  abgleich: match ?? undefined,
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
                  abgleich: match ?? undefined,
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
