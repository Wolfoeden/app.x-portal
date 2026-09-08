import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AdminDisclosure,
  AdminMetricStrip,
  AdminPageHeader,
  AdminSectionHeader,
} from "@/components/admin/AdminDataPrimitives";
import type {
  DemandPeriod,
  DemandPriority,
} from "@/lib/admin/search-demand-analysis";
import { getSearchDemandReport } from "@/lib/admin/search-demand";
import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  isPaused as isSourcingPaused,
  readSourcingAutomation,
} from "@/lib/sourcing/automation";
import {
  listSourcingOutreach,
  listSourcingRuns,
  type SourcingOutreachRow,
} from "@/lib/sourcing/run";

import { AutomationStrip } from "./AutomationStrip";
import { MessageView } from "./MessageView";
import { SourcingButton } from "./SourcingButton";
import styles from "./demand.module.css";

export const metadata: Metadata = {
  title: "Nachfrageprofile | XPORTAL Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PERIODS: readonly { value: DemandPeriod; label: string }[] = [
  { value: 30, label: "30 Tage" },
  { value: 90, label: "90 Tage" },
  { value: 365, label: "12 Monate" },
  { value: "all", label: "Gesamt" },
];

const numberFormat = new Intl.NumberFormat("de-DE");
const oneDecimal = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
});
const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const SEND_STATE_LABELS: Record<SourcingOutreachRow["status"], string> = {
  sent: "Zugestellt",
  failed: "Gescheitert",
  suppressed: "Widerspruch",
  manual: "Von Hand",
};

function channelLabel(value: string): string {
  const labels: Record<string, string> = {
    email: "E-Mail",
    linkedin: "LinkedIn",
    website: "Website",
    other: "Anderer",
  };
  return labels[value] ?? value;
}

/**
 * Die häufigste Arbeitsform des Profils.
 *
 * Sie geht in die Einladung ein („remote", „vor Ort in Hamburg"). Gibt es
 * keine Mehrheit oder keine Angabe, bleibt es bei `unknown` — dann steht in
 * der Nachricht nichts dazu, statt einer Behauptung.
 */
function dominantWorkMode(
  facets: readonly { label: string; count: number }[],
): "remote" | "on_site" | "hybrid" | "unknown" {
  const oben = facets[0]?.label;
  return oben === "remote" || oben === "on_site" || oben === "hybrid"
    ? oben
    : "unknown";
}

/** Der Host der Quelle. Die volle Adresse sprengt die Spalte. */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "Quelle";
  }
}

function parsePeriod(value: string | undefined): DemandPeriod {
  if (value === "30") return 30;
  if (value === "365") return 365;
  if (value === "all") return "all";
  return 90;
}

function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)} %`;
}

function periodLabel(period: DemandPeriod): string {
  return PERIODS.find((option) => option.value === period)?.label ?? "90 Tage";
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "–" : dateFormat.format(parsed);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "–" : dateTimeFormat.format(parsed);
}

function priorityLabel(priority: DemandPriority): string {
  const labels: Record<DemandPriority, string> = {
    high: "Beschaffen",
    review: "Lücke prüfen",
    covered: "Abgedeckt",
    insufficient: "Daten prüfen",
  };
  return labels[priority];
}

function workModeLabel(value: string): string {
  const labels: Record<string, string> = {
    remote: "Remote",
    hybrid: "Hybrid",
    on_site: "Vor Ort",
  };
  return labels[value] ?? value;
}

function languageLabel(value: string): string {
  const labels: Record<string, string> = {
    German: "Deutsch",
    English: "Englisch",
  };
  return labels[value] ?? value;
}

function trendLabel(input: {
  period: DemandPeriod;
  previous: number;
  percent: number | null;
  isNew: boolean;
}): { value: string; detail: string } {
  if (input.period === "all") {
    return { value: "–", detail: "kein Vorzeitraum" };
  }
  if (input.isNew) return { value: "Neu", detail: "zuvor kein Bedarf" };
  const sign = (input.percent ?? 0) > 0 ? "+" : "";
  return {
    value: `${sign}${input.percent ?? 0} %`,
    detail: `${numberFormat.format(input.previous)} zuvor`,
  };
}

export default async function AdminDemandPage({
  searchParams,
}: {
  searchParams: Promise<{ zeitraum?: string | string[] }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const params = await searchParams;
  const requestedPeriod = Array.isArray(params.zeitraum)
    ? params.zeitraum[0]
    : params.zeitraum;
  const period = parsePeriod(requestedPeriod);
  // Nebeneinander: Die drei Abfragen hängen nicht voneinander ab, und die
  // Nachfrageauswertung ist von den dreien die langsamste.
  const [report, outreach, runs, automation] = await Promise.all([
    getSearchDemandReport({ period }),
    listSourcingOutreach(50),
    listSourcingRuns(5),
    readSourcingAutomation(),
  ]);

  await writeAuditEvent({
    actorUserId: currentUser.id,
    action: "admin_search_demand_viewed",
    targetType: "search_demand",
    outcome: "success",
    metadata: {
      period,
      searches: report.totals.searches,
      priorityProfiles: report.totals.priorityProfiles,
    },
    required: true,
  });

  const maxSearches = Math.max(
    1,
    ...report.profiles.slice(0, 6).map((profile) => profile.searches),
  );

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <AdminPageHeader
          eyebrow="Admin / Analyse"
          title="Nachfrageprofile"
          description={
            <p>
              Wiederkehrende Freelancer-Bedarfe, echte Kataloglücken und die
              nächste Beschaffungspriorität — aus ausgeführten Matchings statt
              aus einzelnen Chatnachrichten.
            </p>
          }
        />

        <div className={styles.contextBar}>
          <span>
            {periodLabel(period)} · externe Plattformnutzung ·{" "}
            {numberFormat.format(report.totals.excludedAccounts)} internes Konto
            ausgeschlossen
          </span>
          <nav aria-label="Analysezeitraum">
            {PERIODS.map((option) => (
              <Link
                href={{
                  pathname: "/chat/admin/demand",
                  query: { zeitraum: String(option.value) },
                }}
                aria-current={option.value === period ? "page" : undefined}
                data-active={option.value === period}
                key={String(option.value)}
              >
                {option.label}
              </Link>
            ))}
          </nav>
        </div>

        {report.truncated ? (
          <p className={styles.warning}>
            Das Leselimit wurde erreicht. Die angezeigten Werte sind eine
            Untergrenze; wählen Sie einen kürzeren Zeitraum.
          </p>
        ) : null}

        <AdminMetricStrip
          label="Nachfragesignale"
          items={[
            {
              label: "Analysierte Bedarfe",
              value: numberFormat.format(report.totals.searches),
              detail: "je Projekt nur der jüngste Matching-Lauf",
              tone: "accent",
            },
            {
              label: "Externe Nachfrager",
              value: numberFormat.format(report.totals.uniqueUsers),
              detail: "eindeutige Konten und Gäste",
            },
            {
              label: "Ohne verlässliches Match",
              value: percent(report.totals.noReliableMatchRate),
              detail: `${numberFormat.format(report.totals.noReliableMatch)} von ${numberFormat.format(report.totals.measurableOutcomes)} messbaren Ergebnissen`,
              tone:
                (report.totals.noReliableMatchRate ?? 0) >= 0.25
                  ? "warning"
                  : "default",
            },
            {
              label: "Beschaffungsprioritäten",
              value: numberFormat.format(report.totals.priorityProfiles),
              detail: "wiederholt nachgefragt und schlecht abgedeckt",
              tone:
                report.totals.priorityProfiles > 0 ? "warning" : "muted",
            },
          ]}
        />

        <AdminDisclosure
          title="So entstehen die Nachfrageprofile"
          summary="Deterministisch, ohne zusätzliche KI-Kosten und ohne Rohtexte"
        >
          <p>
            Ein Bedarf zählt einmal: der jüngste gespeicherte Matching-Lauf je
            Projekt im Zeitraum. Die zwei führenden, normalisierten
            Pflichtkompetenzen bilden das Nachfrageprofil. Ein echtes{" "}
            <code>no_reliable_match</code> zählt als Kataloglücke; notwendige
            Rückfragen und historische Ergebnisse ohne Status werden separat
            behandelt. XPORTAL speichert daraus keine erfundene Person in den
            Freelancer-Profilen. Rollen und Branchen sind im heutigen Briefing
            noch keine eigenen strukturierten Felder und werden deshalb nicht
            behauptet.
          </p>
        </AdminDisclosure>

        <AdminSectionHeader
          title="Bedarf × Abdeckung"
          description="Die stärksten wiederkehrenden Kompetenzprofile; Balken zeigt relative Nachfrage, Status zeigt die belegte Versorgungslücke."
          aside={`${numberFormat.format(report.profiles.length)} Profile`}
        />

        {report.profiles.length === 0 ? (
          <p className={styles.empty}>
            Für diesen Zeitraum liegen noch keine klassifizierbaren Matchings
            vor.
          </p>
        ) : (
          <ol className={styles.gapList}>
            {report.profiles.slice(0, 6).map((profile, index) => (
              <li data-priority={profile.priority} key={profile.key}>
                <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
                <div className={styles.gapIdentity}>
                  <strong>{profile.label}</strong>
                  <span>
                    {profile.requiredSkills
                      .slice(0, 3)
                      .map((skill) => skill.label)
                      .join(" · ")}
                  </span>
                </div>
                <div className={styles.demandBar}>
                  <span style={{ width: `${(profile.searches / maxSearches) * 100}%` }} />
                </div>
                <strong className={styles.gapCount}>
                  {numberFormat.format(profile.searches)}
                </strong>
                <span className={styles.gapCoverage}>
                  Ø {oneDecimal.format(profile.averageResults)} Vorschläge
                </span>
                <span className={styles.priority} data-priority={profile.priority}>
                  {priorityLabel(profile.priority)}
                </span>
              </li>
            ))}
          </ol>
        )}

        <AdminSectionHeader
          title="Nachfrageprofile im Detail"
          description="Nach belegter Beschaffungsrelevanz sortiert; unklare Ergebnisse erhöhen nicht die Lückenquote."
          aside={`${periodLabel(period)} · Stand ${formatDate(report.generatedAt)}`}
        />

        {report.profiles.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nachfrageprofil</th>
                  <th>Nachfrage</th>
                  <th>Trend</th>
                  <th>Abdeckung</th>
                  <th>Kontext</th>
                  <th>Empfehlung</th>
                </tr>
              </thead>
              <tbody>
                {report.profiles.map((profile) => {
                  const trend = trendLabel({
                    period,
                    previous: profile.previousSearches,
                    percent: profile.trendPercent,
                    isNew: profile.isNewDemand,
                  });
                  return (
                    <tr data-priority={profile.priority} key={profile.key}>
                      <td data-label="Nachfrageprofil">
                        <strong className={styles.profileName}>{profile.label}</strong>
                        <span className={styles.tags}>
                          {profile.requiredSkills.slice(0, 4).map((skill) => (
                            <span key={skill.label}>{skill.label}</span>
                          ))}
                        </span>
                        {profile.openSupplyGaps.length > 0 ? (
                          <small>
                            Häufig offen: {profile.openSupplyGaps
                              .map((gap) => gap.label)
                              .join(", ")}
                          </small>
                        ) : null}
                      </td>
                      <td data-label="Nachfrage" className={styles.metricCell}>
                        <strong>{numberFormat.format(profile.searches)}</strong>
                        <span>{percent(profile.share)} aller Bedarfe</span>
                        <small>
                          {numberFormat.format(profile.uniqueUsers)} Nachfrager · zuletzt{" "}
                          {formatDate(profile.lastSearchedAt)}
                        </small>
                      </td>
                      <td data-label="Trend" className={styles.metricCell}>
                        <strong>{trend.value}</strong>
                        <span>{trend.detail}</span>
                      </td>
                      <td data-label="Abdeckung" className={styles.coverageCell}>
                        <strong>Ø {oneDecimal.format(profile.averageResults)} Vorschläge</strong>
                        <span>
                          {percent(profile.noReliableMatchRate)} ohne Match ·{" "}
                          {numberFormat.format(profile.ranked)} erfolgreich
                        </span>
                        {profile.needsClarification > 0 || profile.unknownOutcome > 0 ? (
                          <small>
                            {numberFormat.format(profile.needsClarification)} Klärung ·{" "}
                            {numberFormat.format(profile.unknownOutcome)} Status unbekannt
                          </small>
                        ) : null}
                      </td>
                      <td data-label="Kontext">
                        <span className={styles.contextStack}>
                          <strong>
                            {profile.workModes.length
                              ? profile.workModes.map((item) => workModeLabel(item.label)).join(" / ")
                              : "Arbeitsform offen"}
                          </strong>
                          <span>
                            {profile.locations.length
                              ? profile.locations.map((item) => item.label).join(" · ")
                              : "Ort offen"}
                          </span>
                          <small>
                            {profile.languages.length
                              ? profile.languages.map((item) => languageLabel(item.label)).join(" · ")
                              : "Sprache offen"}
                          </small>
                        </span>
                      </td>
                      <td data-label="Empfehlung">
                        <span className={styles.priority} data-priority={profile.priority}>
                          {priorityLabel(profile.priority)}
                        </span>
                        <small className={styles.recommendation}>
                          {profile.priority === "high"
                            ? "Kandidatenbeschaffung priorisieren"
                            : profile.priority === "review"
                              ? "Katalog und Pflichtskills prüfen"
                              : profile.priority === "covered"
                                ? "Bestand beobachten"
                                : "Mehr messbare Suchen abwarten"}
                        </small>
                        <SourcingButton
                          location={profile.locations[0]?.label ?? null}
                          profileKey={profile.key}
                          profileLabel={profile.label}
                          skills={profile.requiredSkills.map((skill) => skill.label)}
                          workMode={dominantWorkMode(profile.workModes)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className={styles.lowerGrid}>
          <section>
            <p className={styles.kicker}>HÄUFIGSTE PFLICHTKOMPETENZEN</p>
            <ol className={styles.skillList}>
              {report.topRequiredSkills.map((skill) => (
                <li key={skill.label}>
                  <span>{skill.label}</span>
                  <strong>{numberFormat.format(skill.count)}</strong>
                </li>
              ))}
              {report.topRequiredSkills.length === 0 ? (
                <li><span>Noch keine verwertbaren Kompetenzen.</span></li>
              ) : null}
            </ol>
          </section>
          <section>
            <p className={styles.kicker}>DATENQUALITÄT</p>
            <dl className={styles.qualityList}>
              <div>
                <dt>Nicht klassifiziert</dt>
                <dd>{numberFormat.format(report.totals.unclassifiedSearches)}</dd>
              </div>
              <div>
                <dt>Ungültige Brief-Snapshots</dt>
                <dd>{numberFormat.format(report.totals.invalidBriefs)}</dd>
              </div>
              <div>
                <dt>Historischer Status unbekannt</dt>
                <dd>{numberFormat.format(report.totals.unknownOutcome)}</dd>
              </div>
              <div>
                <dt>Interne Bedarfe entfernt</dt>
                <dd>{numberFormat.format(report.totals.excludedSearches)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <AdminSectionHeader
          title="Beschaffung und Einladungen"
          description="Wer aus einem Beschaffungslauf welche Nachricht bekommen hat — auch die, die nicht ankam."
          aside={
            outreach.length > 0
              ? `${numberFormat.format(outreach.length)} Einladungen`
              : "noch keine"
          }
        />

        <AutomationStrip
          automation={automation}
          paused={isSourcingPaused(automation)}
        />

        {runs.length > 0 ? (
          <p className={styles.runLine}>
            Letzter Lauf: <strong>{runs[0]!.demandProfileLabel}</strong> am{" "}
            {formatDate(runs[0]!.createdAt)} · {numberFormat.format(runs[0]!.foundCount)}{" "}
            gefunden, {numberFormat.format(runs[0]!.addressableCount)} ansprechbar,{" "}
            {numberFormat.format(runs[0]!.importedCount)} übernommen
            {runs[0]!.skippedSkills.length > 0
              ? ` · ohne Quelle: ${runs[0]!.skippedSkills.join(", ")}`
              : ""}
          </p>
        ) : null}

        {outreach.length === 0 ? (
          <p className={styles.empty}>
            Noch wurde niemand eingeladen. Ein Beschaffungslauf legt Kandidaten
            an; die Einladung ist ein eigener Schritt, weil sie die Frist aus
            Art. 14 DSGVO auslöst.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.outreachTable}>
              <thead>
                <tr>
                  <th>Empfänger</th>
                  <th>Bedarf</th>
                  <th>Kanal</th>
                  <th>Betreff</th>
                  <th>Nachricht</th>
                  <th>Zeitpunkt</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {outreach.map((eintrag) => (
                  <tr key={eintrag.id}>
                    <td data-label="Empfänger">
                      <span className={styles.recipient}>
                        <strong>{eintrag.recipientName ?? "ohne Namen"}</strong>
                        <span>{eintrag.recipientEmail}</span>
                        {eintrag.profileUrl ? (
                          <a
                            href={eintrag.profileUrl}
                            rel="noreferrer nofollow noopener"
                            target="_blank"
                          >
                            {sourceHost(eintrag.profileUrl)}
                          </a>
                        ) : null}
                      </span>
                    </td>
                    <td data-label="Bedarf">{eintrag.demandProfileLabel ?? "–"}</td>
                    <td data-label="Kanal">{channelLabel(eintrag.channel)}</td>
                    <td data-label="Betreff">{eintrag.subject ?? "–"}</td>
                    <td data-label="Nachricht">
                      {/* Der Text entsteht erst nach der Zustellung — bei
                          allem anderen gibt es keinen zu zeigen. */}
                      <MessageView
                        hasBody={eintrag.status === "sent"}
                        id={eintrag.id}
                      />
                    </td>
                    <td data-label="Zeitpunkt">{formatDateTime(eintrag.createdAt)}</td>
                    <td data-label="Status">
                      <span className={styles.sendState} data-status={eintrag.status}>
                        {SEND_STATE_LABELS[eintrag.status]}
                      </span>
                      {eintrag.error ? <small> {eintrag.error}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className={styles.footNote}>
          Berechnete Analyseansicht aus <code>shortlists.brief_snapshot</code>,{" "}
          <code>result_status</code> und <code>decision_snapshot</code>. Es werden
          keine Suchrohtexte ausgegeben und keine Freelancer-Datensätze erzeugt.
          Der Versandbeleg stammt aus <code>sourcing_outreach</code> und überlebt
          den Kandidaten, damit die Informationspflicht belegbar bleibt.
        </p>
      </div>
    </main>
  );
}
