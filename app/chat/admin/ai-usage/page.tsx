import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { writeAuditEvent } from "@/lib/audit/write";
import {
  getAdminUsageDashboard,
  getAdminUserUsageInteractions,
} from "@/lib/ai/admin-usage";
import { getCurrentUser } from "@/lib/auth/current-user";
import { appPath } from "@/lib/app-path";
import {
  ACCOUNT_MONTHLY_CREDITS,
  BRIEF_ANALYSIS_CREDITS,
  creditPlan,
  GUEST_MONTHLY_CREDITS,
} from "@/lib/ai/credit-policy";
import { EXTERNAL_SEARCH_CREDITS } from "@/lib/ai/credit-policy";
import { resolveOpenAiConnection } from "@/lib/openai/provider";
import { DEFAULT_OPENAI_DIAGNOSTIC_MODEL } from "@/lib/openai/diagnostics";
import { ProviderDiagnosticPanel } from "./ProviderDiagnosticPanel";
import styles from "./usage.module.css";

export const metadata: Metadata = {
  title: "AI Usage | XPORTAL",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("de-DE");
const usdFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

function formatUsd(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? usdFormat.format(numeric) : "–";
}

function formatUsageCost(value: {
  costUsd: string;
  requests: number;
  unknownCostRequests: number;
}): string {
  if (value.requests > 0 && value.unknownCostRequests === value.requests) {
    return "Unbekannt";
  }
  const known = formatUsd(value.costUsd);
  return value.unknownCostRequests > 0 ? `${known} + unbekannt` : known;
}

function dateRange(value: string | undefined, end = false): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  return `${value}${end ? "T23:59:59.999Z" : "T00:00:00.000Z"}`;
}

function when(value: string | null): string {
  if (!value) return "Noch keine Nutzung";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function period(value: string | null): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function outcomeClass(outcome: string): string {
  if (outcome === "succeeded") return styles.statusSuccess;
  if (outcome === "timeout" || outcome === "cancelled") {
    return styles.statusWarning;
  }
  return styles.statusError;
}

type UserSort = "kosten" | "tokens" | "zuletzt" | "credits";

const USER_SORTS: readonly UserSort[] = [
  "kosten",
  "tokens",
  "zuletzt",
  "credits",
];

function isUserSort(value: string | undefined): value is UserSort {
  return Boolean(value && (USER_SORTS as readonly string[]).includes(value));
}

function totalCostNanoUsd(user: {
  confirmedProvider: { costNanoUsd: string };
  estimatedOrReconciled: { costNanoUsd: string };
}): bigint {
  return BigInt(user.confirmedProvider.costNanoUsd) +
    BigInt(user.estimatedOrReconciled.costNanoUsd);
}

function hasUsage(user: {
  settlements: number;
  failedAttempts: number;
  searchRuns: number;
}): boolean {
  return (
    user.settlements > 0 || user.failedAttempts > 0 || user.searchRuns > 0
  );
}

/**
 * Ohne Sortierung steht die teuerste Zeile irgendwo. Die Reihenfolge ist der
 * eigentliche Bericht: wer oben steht, kostet Geld.
 */
function sortUsers<
  T extends {
    confirmedProvider: { costNanoUsd: string; totalTokens: number };
    estimatedOrReconciled: { costNanoUsd: string; totalTokens: number };
    freeMonthlyUsage: { used: number } | null;
    lastUsedAt: string | null;
  },
>(users: readonly T[], sort: UserSort): T[] {
  const rows = [...users];
  if (sort === "tokens") {
    return rows.sort(
      (a, b) =>
        b.confirmedProvider.totalTokens +
        b.estimatedOrReconciled.totalTokens -
        (a.confirmedProvider.totalTokens + a.estimatedOrReconciled.totalTokens),
    );
  }
  if (sort === "zuletzt") {
    return rows.sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
  }
  if (sort === "credits") {
    return rows.sort(
      (a, b) => (b.freeMonthlyUsage?.used ?? 0) - (a.freeMonthlyUsage?.used ?? 0),
    );
  }
  return rows.sort((a, b) => {
    const diff = totalCostNanoUsd(b) - totalCostNanoUsd(a);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });
}

function percentOf(part: number, total: number): string {
  if (total <= 0) return "–";
  return `${Math.round((part / total) * 100)} %`;
}

function usageBasisLabel(
  usageBasis: "confirmed_provider" | "estimated_or_reconciled",
): string {
  return usageBasis === "confirmed_provider"
    ? "Provider bestätigt"
    : "Schätzung / Abgleich";
}

export default async function AiUsageAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    user?: string;
    sortierung?: string;
    zeige?: string;
  }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const params = await searchParams;
  const providerConnection = resolveOpenAiConnection();
  const requestedModel = DEFAULT_OPENAI_DIAGNOSTIC_MODEL;
  const dashboard = await getAdminUsageDashboard({
    from: dateRange(params.from),
    to: dateRange(params.to, true),
  });
  const selectedUser = params.user
    ? dashboard.users.find((user) => user.userId === params.user) ?? null
    : null;
  const selectedInteractions = selectedUser
    ? await getAdminUserUsageInteractions({
        userId: selectedUser.userId,
        email: selectedUser.email,
        from: dateRange(params.from),
        to: dateRange(params.to, true),
      })
    : dashboard.recentInteractions;
  const sort: UserSort = isUserSort(params.sortierung)
    ? params.sortierung
    : "kosten";
  const showAllUsers = params.zeige === "alle";
  const usersWithUsage = dashboard.users.filter(hasUsage);
  const hiddenUsers = dashboard.users.length - usersWithUsage.length;
  const visibleUsers = sortUsers(
    showAllUsers ? dashboard.users : usersWithUsage,
    sort,
  );

  // Der Zeitraumfilter muss in jedem Link erhalten bleiben, sonst springt die
  // Seite bei jedem Sortierklick auf "alles seit Start" zurück.
  const carry = { from: params.from, to: params.to, user: params.user };
  const tableQuery = (next: { sortierung?: UserSort; zeige?: string }) => ({
    ...carry,
    sortierung: next.sortierung ?? sort,
    zeige: next.zeige ?? (showAllUsers ? "alle" : undefined),
  });
  const exportQuery = new URLSearchParams();
  if (params.from) exportQuery.set("von", params.from);
  if (params.to) exportQuery.set("bis", params.to);
  const exportSuffix = exportQuery.toString()
    ? `&${exportQuery.toString()}`
    : "";

  const attempts = dashboard.totals.settlements;
  const unknownModel = dashboard.byModel.find((model) => model.key === "unknown");
  const confirmedShare = percentOf(
    dashboard.totals.confirmedProvider.requests,
    dashboard.totals.confirmedProvider.requests +
      dashboard.totals.estimatedOrReconciled.requests,
  );

  await writeAuditEvent({
    actorUserId: currentUser.id,
    action: "ai_usage_admin_viewed",
    targetType: "ai_usage",
    outcome: "success",
    metadata: { filtered: Boolean(params.from || params.to) },
    required: true,
  });

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>XPORTAL · ADMIN</p>
          <h1>AI Usage, Kontingente & Credits</h1>
          <p>
            Provider-Nutzung, wirksame Monats-Credits, stillgelegte Restbestände
            und das stillgelegte Freikontingent werden getrennt ausgewiesen.
          </p>
        </div>
        <Link className={styles.backLink} href="/chat">
          Zurück zum Chat
        </Link>
      </header>

      <form className={styles.filters} method="get">
        <label>
          Von
          <input type="date" name="from" defaultValue={params.from} />
        </label>
        <label>
          Bis
          <input type="date" name="to" defaultValue={params.to} />
        </label>
        <button type="submit">Zeitraum anwenden</button>
        <Link href="/chat/admin/ai-usage">Zurücksetzen</Link>
      </form>

      {dashboard.truncated ? (
        <p className={styles.notice}>
          Die Ansicht ist auf jeweils 20.000 Usage- und Kontodatensätze
          begrenzt. Engen Sie den Zeitraum ein oder nutzen Sie einen
          serverseitigen Export für eine vollständige Auswertung.
        </p>
      ) : null}

      <p className={styles.basisNotice}>
        <strong>Messgrundlage:</strong> „Provider bestätigt“ erfordert eine
        Provider-Response-ID, das tatsächliche Modell sowie konsistente
        Tokenfelder. Die ausgewiesenen Text-Token-Kosten wurden beim jeweiligen
        Request mit dem damals gespeicherten Preisregister errechnet;
        Tool-Gebühren sind darin nicht enthalten und die Werte sind keine
        Provider-Rechnung.
        Unvollständige und abgeglichene Datensätze bleiben ausdrücklich
        Schätzungen. Die <strong>Gesamtkosten</strong> oben enthalten zusätzlich
        die Websuchen, die nicht über Tokens abgerechnet werden.{" "}
Bei den Konten stehen zwei
        Bestände nebeneinander. <strong>Monats-Credits (wirksam)</strong> ist
        das Guthaben aus <code>user_ai_credit_accounts</code>: der Chat zeigt
        es an, <code>consume_ai_quota</code> sperrt daran jede Anfrage.
        {" "}<strong>Stillgelegtes Freikontingent</strong> ist{" "}
        <code>ai_free_usage_accounts</code> — es wird nur von dieser Seite und
        vom DSGVO-Export gelesen, kein Request-Pfad schreibt darauf. Solange
        beide existieren, ist nur die erste Zahl eine Aussage über das, was ein
        Nutzer tatsächlich noch tun kann. Der Zeitraumfilter gilt für
        Provider-Requests; Konto- und Kontingentwerte zeigen immer den
        aktuellen Stand.
      </p>

      <section className={styles.headline} aria-label="Kosten im Zeitraum">
        <article className={styles.primary}>
          <span>Gesamtkosten im Zeitraum</span>
          <strong>{formatUsd(dashboard.combinedCostUsd)}</strong>
          <small>
            Token und Websuchen zusammen · {confirmedShare} der Antworten
            provider-bestätigt
          </small>
        </article>
        <article>
          <span>davon Websuchen</span>
          <strong>{formatUsd(dashboard.searchUsage.costUsd)}</strong>
          <small>
            {numberFormat.format(dashboard.searchUsage.runs)} Recherchen ·{" "}
            {numberFormat.format(dashboard.searchUsage.toolCalls)} Suchaufrufe ·{" "}
            {numberFormat.format(dashboard.searchUsage.candidates)} Profile
          </small>
        </article>
        <article>
          <span>davon Text-Tokens</span>
          <strong>
            {formatUsd(
              (
                Number(dashboard.totals.confirmedProvider.costUsd) +
                Number(dashboard.totals.estimatedOrReconciled.costUsd)
              ).toFixed(6),
            )}
          </strong>
          <small>
            {numberFormat.format(
              dashboard.totals.confirmedProvider.totalTokens +
                dashboard.totals.estimatedOrReconciled.totalTokens,
            )}{" "}
            Tokens abgerechnet
          </small>
        </article>
      </section>

      <div className={styles.health} aria-label="Betriebszustand">
        <span
          className={
            attempts > 0 && dashboard.totals.failedAttempts / attempts > 0.1
              ? styles.alarm
              : undefined
          }
        >
          Fehlversuche{" "}
          <b>
            {numberFormat.format(dashboard.totals.failedAttempts)} /{" "}
            {numberFormat.format(attempts)}
          </b>{" "}
          ({percentOf(dashboard.totals.failedAttempts, attempts)})
        </span>
        {unknownModel && unknownModel.settlements > 0 ? (
          <span className={styles.alarm}>
            Ohne Modellzuordnung{" "}
            <b>{numberFormat.format(unknownModel.settlements)}</b> — diese
            Kosten lassen sich keinem Modell zurechnen
          </span>
        ) : null}
        <span
          className={
            dashboard.totals.estimatedOrReconciled.requests >
            dashboard.totals.confirmedProvider.requests
              ? styles.warn
              : undefined
          }
        >
          Provider-bestätigt <b>{confirmedShare}</b> der Antworten
        </span>
        <span>
          Reserviert{" "}
          <b>
            {numberFormat.format(dashboard.accountTotals.freeMonthly.reserved)}
          </b>{" "}
          Credits · {numberFormat.format(dashboard.accountTotals.product.reserved)}{" "}
          Produkt-Credits
        </span>
      </div>

      <section className={styles.kpis} aria-label="Gesamtnutzung">
        <article>
          <span>Errechnete Text-Token-Kosten</span>
          <strong>{formatUsageCost(dashboard.totals.confirmedProvider)}</strong>
          <small>
            {numberFormat.format(dashboard.totals.confirmedProvider.requests)}
            {" "}Provider-Antworten
          </small>
        </article>
        <article>
          <span>Bestätigte Provider-Tokens</span>
          <strong>{numberFormat.format(dashboard.totals.confirmedProvider.totalTokens)}</strong>
          <small>
            {numberFormat.format(dashboard.totals.confirmedProvider.cachedInputTokens)} cached
          </small>
        </article>
        <article>
          <span>Geschätzte Text-Token-Kosten</span>
          <strong>{formatUsageCost(dashboard.totals.estimatedOrReconciled)}</strong>
          <small>
            {dashboard.totals.estimatedOrReconciled.unknownCostRequests
              ? `${dashboard.totals.estimatedOrReconciled.unknownCostRequests} ohne Preis`
              : "Schätzung, nicht Provider-bestätigt"}
          </small>
        </article>
        <article>
          <span>Geschätzte / abgeglichene Tokens</span>
          <strong>{numberFormat.format(dashboard.totals.estimatedOrReconciled.totalTokens)}</strong>
          <small>
            {numberFormat.format(dashboard.totals.reconciledEstimates)} automatische Abgleiche
          </small>
        </article>
        <article className={styles.legacyKpi}>
          <span>Stillgelegtes Freikontingent</span>
          <strong>
            {numberFormat.format(dashboard.accountTotals.freeMonthly.remaining)} /{" "}
            {numberFormat.format(dashboard.accountTotals.freeMonthly.limit)}
          </strong>
          <small>
            aus <code>ai_free_usage_accounts</code> · gates nichts, wird von
            keinem Request fortgeschrieben
          </small>
        </article>
        <article>
          <span>Produkt-Credits (stillgelegt)</span>
          <strong>{numberFormat.format(dashboard.accountTotals.product.available)}</strong>
          <small>
            Restbestand aus dem zweiten Guthaben · gates nichts
          </small>
        </article>
        <article>
          <span>Usage-Versuche</span>
          <strong>{numberFormat.format(dashboard.totals.settlements)}</strong>
          <small>{numberFormat.format(dashboard.totals.failedAttempts)} fehlgeschlagen</small>
        </article>
        <article>
          <span>Verbrauchte Credits im Zeitraum</span>
          <strong>{numberFormat.format(dashboard.totals.legacyTechnicalCreditsConsumed)}</strong>
          <small>
            aus den Abrechnungen · bei {BRIEF_ANALYSIS_CREDITS} Credits je Suche
          </small>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <p>USAGE BY MODEL</p>
            <h2>Modelle</h2>
          </div>
          <span>Stand {when(dashboard.generatedAt)}</span>
        </div>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th>Modell</th>
                <th>Settlements</th>
                <th>Bestätigte Tokens</th>
                <th>Text-Token-Kosten</th>
                <th>Schätzungen / Abgleiche</th>
                <th>Geschätzte Tokens</th>
                <th>Geschätzte Text-Token-Kosten</th>
                <th>Fehler</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.byModel.length ? (
                dashboard.byModel.map((model) => (
                  <tr key={model.key}>
                    <td><code>{model.key}</code></td>
                    <td>{numberFormat.format(model.settlements)}</td>
                    <td>{numberFormat.format(model.confirmedProvider.totalTokens)}</td>
                    <td>{formatUsageCost(model.confirmedProvider)}</td>
                    <td>{numberFormat.format(model.estimatedOrReconciled.requests)}</td>
                    <td>{numberFormat.format(model.estimatedOrReconciled.totalTokens)}</td>
                    <td>{formatUsageCost(model.estimatedOrReconciled)}</td>
                    <td>{numberFormat.format(model.failedAttempts)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={8}>Noch keine abgerechnete AI-Nutzung.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <p>USAGE BY USER</p>
            <h2>Nutzer, Monatskontingente und Guthaben</h2>
          </div>
          {selectedUser ? (
            <Link href={{ pathname: "/chat/admin/ai-usage", query: { from: params.from, to: params.to } }}>
              Detail schließen
            </Link>
          ) : null}
        </div>
        <div className={styles.tableTools}>
          <span>
            {showAllUsers
              ? `Alle ${numberFormat.format(dashboard.users.length)} Konten`
              : `${numberFormat.format(visibleUsers.length)} Konten mit Nutzung im Zeitraum`}
          </span>
          {hiddenUsers > 0 ? (
            <Link
              href={{
                pathname: "/chat/admin/ai-usage",
                query: tableQuery({ zeige: showAllUsers ? undefined : "alle" }),
              }}
            >
              {showAllUsers
                ? "nur Konten mit Nutzung"
                : `${numberFormat.format(hiddenUsers)} ohne Nutzung einblenden`}
            </Link>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>Sortiert nach</span>
          {(
            [
              ["kosten", "Kosten"],
              ["tokens", "Tokens"],
              ["credits", "verbrauchten Credits"],
              ["zuletzt", "letzter Nutzung"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              className={styles.sortLink}
              data-active={sort === key}
              href={{
                pathname: "/chat/admin/ai-usage",
                query: tableQuery({ sortierung: key }),
              }}
            >
              {label}
            </Link>
          ))}
          <span aria-hidden="true">·</span>
          <a href={`/api/admin/ai-usage/export?tabelle=nutzer${exportSuffix}`}>
            Nutzer als CSV
          </a>
          <a href={`/api/admin/ai-usage/export?tabelle=modelle${exportSuffix}`}>
            Modelle als CSV
          </a>
        </div>
        <div className={styles.accountLegend} aria-label="Kontotypen">
          <div>
            <strong>Monats-Credits (wirksam)</strong>
            <span>
              Das Guthaben, das der Chat anzeigt und das jede Anfrage sperrt.
              Neue Konten starten mit{" "}
              {numberFormat.format(ACCOUNT_MONTHLY_CREDITS)}, Gäste mit{" "}
              {numberFormat.format(GUEST_MONTHLY_CREDITS)} · eine normale Suche
              kostet {BRIEF_ANALYSIS_CREDITS} Credits
            </span>
          </div>
          <div className={styles.legacyLegend}>
            <strong>Stillgelegte Produkt-Credits</strong>
            <span>
              <code>product_credit_accounts</code> — das zweite Guthaben der
              Websuche, seit dem Zusammenlegen ohne Wirkung. Eine Recherche
              kostet {numberFormat.format(EXTERNAL_SEARCH_CREDITS)} Credits aus
              dem Monatskontingent.
            </span>
          </div>
          <div className={styles.legacyLegend}>
            <strong>Stillgelegtes Freikontingent</strong>
            <span>
              <code>ai_free_usage_accounts</code> — wird nur hier und im
              DSGVO-Export gelesen, gates nichts
            </span>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Stufe</th>
                <th>Monats-Credits (wirksam)</th>
                <th>Produkt-Credits (stillgelegt)</th>
                <th>Bestätigte Tokens</th>
                <th>Text-Token-Kosten</th>
                <th>Geschätzte Tokens</th>
                <th>Geschätzte Text-Token-Kosten</th>
                <th>Stillgelegtes Freikontingent</th>
                <th>Letzte Nutzung</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.userId} className={selectedUser?.userId === user.userId ? styles.selected : undefined}>
                  <td>
                    <Link href={{ pathname: "/chat/admin/ai-usage", query: { from: params.from, to: params.to, user: user.userId } }}>
                      {user.email ?? (user.anonymous ? "Anonymer Gast" : user.userId)}
                    </Link>
                    <small>{user.anonymous ? "Gast" : user.userId}</small>
                  </td>
                  <td>
                    <span
                      className={styles.planBadge}
                      data-plan={user.planId}
                    >
                      {creditPlan(user.planId, user.anonymous).label}
                    </span>
                    {/* Was die Stufe verspricht — daneben, was das Konto
                        tatsächlich trägt. Weicht beides ab, ist es ein
                        Bestandskonto aus einer früheren Zusage. */}
                    <small>
                      {numberFormat.format(
                        creditPlan(user.planId, user.anonymous).monthlyCredits,
                      )}{" "}
                      lt. Stufe
                    </small>
                  </td>
                  <td>
                    {user.legacyTechnicalCredits ? (
                      <span className={styles.accountBalance}>
                        <strong>
                          {numberFormat.format(user.legacyTechnicalCredits.remaining)} /{" "}
                          {numberFormat.format(user.legacyTechnicalCredits.total)}
                        </strong>
                        <small>
                          {numberFormat.format(user.legacyTechnicalCredits.used)} genutzt ·{" "}
                          {numberFormat.format(user.legacyTechnicalCredits.reserved)} reserviert
                        </small>
                      </span>
                    ) : "–"}
                  </td>
                  <td>
                    {user.productCredits ? (
                      <span className={styles.accountBalance}>
                        <strong>{numberFormat.format(user.productCredits.available)} verfügbar</strong>
                        <small>{numberFormat.format(user.productCredits.reserved)} reserviert</small>
                      </span>
                    ) : "–"}
                  </td>
                  <td>{numberFormat.format(user.confirmedProvider.totalTokens)}</td>
                  <td>{formatUsageCost(user.confirmedProvider)}</td>
                  <td>{numberFormat.format(user.estimatedOrReconciled.totalTokens)}</td>
                  <td>{formatUsageCost(user.estimatedOrReconciled)}</td>
                  <td>
                    {user.freeMonthlyUsage ? (
                      <span className={`${styles.accountBalance} ${styles.legacyBalance}`}>
                        <strong>
                          {numberFormat.format(user.freeMonthlyUsage.remaining)} /{" "}
                          {numberFormat.format(user.freeMonthlyUsage.limit)}
                        </strong>
                        <small>stillgelegt · gates nichts</small>
                      </span>
                    ) : "–"}
                  </td>
                  <td>{when(user.lastUsedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedUser ? (
        <section className={styles.detail}>
          <div>
            <p>USER DETAIL</p>
            <h2>{selectedUser.email ?? selectedUser.userId}</h2>
            <span>Letzte Nutzung: {when(selectedUser.lastUsedAt)}</span>
          </div>
          <dl>
            <div>
              <dt>Monats-Credits (wirksam)</dt>
              <dd>
                {selectedUser.legacyTechnicalCredits
                  ? `${numberFormat.format(selectedUser.legacyTechnicalCredits.remaining)} / ${numberFormat.format(selectedUser.legacyTechnicalCredits.total)}`
                  : "–"}
              </dd>
              <small>
                {selectedUser.legacyTechnicalCredits
                  ? `${numberFormat.format(selectedUser.legacyTechnicalCredits.used)} genutzt · ${numberFormat.format(selectedUser.legacyTechnicalCredits.reserved)} reserviert · sperrt jede Anfrage`
                  : "Kein Guthabenkonto"}
              </small>
            </div>
            <div>
              <dt>Produkt-Credits (stillgelegt)</dt>
              <dd>{selectedUser.productCredits ? numberFormat.format(selectedUser.productCredits.available) : "–"}</dd>
              <small>
                {selectedUser.productCredits
                  ? `${numberFormat.format(selectedUser.productCredits.balance)} Bestand · ${numberFormat.format(selectedUser.productCredits.reserved)} reserviert`
                  : "Kein Produkt-Credit-Konto"}
              </small>
            </div>
            <div className={styles.legacyDetail}>
              <dt>Stillgelegtes Freikontingent</dt>
              <dd>
                {selectedUser.freeMonthlyUsage
                  ? `${numberFormat.format(selectedUser.freeMonthlyUsage.remaining)} / ${numberFormat.format(selectedUser.freeMonthlyUsage.limit)}`
                  : "–"}
              </dd>
              <small>
                {selectedUser.freeMonthlyUsage
                  ? `Periode bis ${period(selectedUser.freeMonthlyUsage.periodEnd)} · gates nichts`
                  : "Keine offene Periode"}
              </small>
            </div>
            <div><dt>Bestätigte Tokens</dt><dd>{numberFormat.format(selectedUser.confirmedProvider.totalTokens)}</dd></div>
            <div><dt>Text-Token-Kosten</dt><dd>{formatUsageCost(selectedUser.confirmedProvider)}</dd></div>
            <div><dt>Geschätzte Tokens</dt><dd>{numberFormat.format(selectedUser.estimatedOrReconciled.totalTokens)}</dd></div>
            <div><dt>Geschätzte Text-Token-Kosten</dt><dd>{formatUsageCost(selectedUser.estimatedOrReconciled)}</dd></div>
          </dl>
        </section>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <p>REQUESTS / INTERACTIONS</p>
            <h2>{selectedUser ? "Nutzeraktivität" : "Neueste Aktivität"}</h2>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr><th>Zeit</th><th>User</th><th>Modell</th><th>Zweck</th><th>Messbasis</th><th>Tokens</th><th>Kosten</th><th>Credits belastet</th><th>Status</th></tr>
            </thead>
            <tbody>
              {selectedInteractions.length ? selectedInteractions.map((item, index) => (
                <tr key={`${item.id}-${index}`}>
                  <td>{when(item.settledAt)}</td>
                  <td>{item.email ?? item.userId ?? "Gelöscht"}</td>
                  <td><code>{item.model}</code></td>
                  <td>{item.purpose}</td>
                  <td>
                    <span className={`${styles.usageBasis} ${item.usageBasis === "confirmed_provider" ? styles.usageConfirmed : styles.usageEstimated}`}>
                      {usageBasisLabel(item.usageBasis)}
                    </span>
                  </td>
                  <td>{numberFormat.format(item.tokens)}</td>
                  <td>{item.costUsd === null ? "Unbekannt" : formatUsd(item.costUsd)}</td>
                  <td>
                    <span className={styles.legacyInline}>
                      {numberFormat.format(item.legacyTechnicalCredits)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.status} ${outcomeClass(item.outcome)}`}>
                      {item.outcome}
                    </span>
                  </td>
                </tr>
              )) : <tr><td colSpan={9}>Keine Requests im gewählten Zeitraum.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <ProviderDiagnosticPanel
        initialTransport={providerConnection.transport}
        requestedModel={requestedModel}
      />
    </main>
  );
}
