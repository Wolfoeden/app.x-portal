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
import { resolveOpenAiConnection } from "@/lib/openai/provider";
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

function outcomeClass(outcome: string): string {
  if (outcome === "succeeded") return styles.statusSuccess;
  if (outcome === "timeout" || outcome === "cancelled") {
    return styles.statusWarning;
  }
  return styles.statusError;
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
  searchParams: Promise<{ from?: string; to?: string; user?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.isAnonymous) {
    redirect(`${appPath("/chat")}?admin-login=1`);
  }
  if (!currentUser.isAdmin) notFound();

  const params = await searchParams;
  const providerConnection = resolveOpenAiConnection();
  const requestedModel =
    process.env.OPENAI_BRIEF_MODEL?.trim() ||
    "gpt-5.5-pro";
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
          <h1>AI Usage & Credits</h1>
          <p>
            Bestätigte Provider-Nutzung, konservative Schätzungen und interne
            XPORTAL Credits werden getrennt ausgewiesen.
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

      <ProviderDiagnosticPanel
        initialTransport={providerConnection.transport}
        requestedModel={requestedModel}
      />

      {dashboard.truncated ? (
        <p className={styles.notice}>
          Die Ansicht ist auf jeweils 20.000 Usage- und Credit-Datensätze
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
        Unvollständige und abgeglichene Datensätze bleiben
        ausdrücklich Schätzungen. XPORTAL Credits sind eine separate interne
        Produkteinheit.
      </p>

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
        <article>
          <span>Usage-Versuche</span>
          <strong>{numberFormat.format(dashboard.totals.settlements)}</strong>
          <small>{numberFormat.format(dashboard.totals.failedAttempts)} fehlgeschlagen</small>
        </article>
        <article>
          <span>XPORTAL Credits Used</span>
          <strong>{numberFormat.format(dashboard.totals.creditsUsed)}</strong>
          <small>Interne Produkteinheit</small>
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
            <h2>Nutzer und Credit-Konten</h2>
          </div>
          {selectedUser ? (
            <Link href={{ pathname: "/chat/admin/ai-usage", query: { from: params.from, to: params.to } }}>
              Detail schließen
            </Link>
          ) : null}
        </div>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Settlements</th>
                <th>Bestätigte Tokens</th>
                <th>Text-Token-Kosten</th>
                <th>Geschätzte Tokens</th>
                <th>Geschätzte Text-Token-Kosten</th>
                <th>XPORTAL Credits</th>
                <th>Credits Remaining</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.users.map((user) => (
                <tr key={user.userId} className={selectedUser?.userId === user.userId ? styles.selected : undefined}>
                  <td>
                    <Link href={{ pathname: "/chat/admin/ai-usage", query: { from: params.from, to: params.to, user: user.userId } }}>
                      {user.email ?? (user.anonymous ? "Anonymer Gast" : user.userId)}
                    </Link>
                    <small>{user.anonymous ? "Gast" : user.userId}</small>
                  </td>
                  <td>{numberFormat.format(user.settlements)}</td>
                  <td>{numberFormat.format(user.confirmedProvider.totalTokens)}</td>
                  <td>{formatUsageCost(user.confirmedProvider)}</td>
                  <td>{numberFormat.format(user.estimatedOrReconciled.totalTokens)}</td>
                  <td>{formatUsageCost(user.estimatedOrReconciled)}</td>
                  <td>{numberFormat.format(user.creditsUsed)}</td>
                  <td>{numberFormat.format(user.creditsRemaining)}</td>
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
            <div><dt>Credit Balance</dt><dd>{numberFormat.format(selectedUser.creditsRemaining)} / {numberFormat.format(selectedUser.creditsTotal)}</dd></div>
            <div><dt>Reserviert</dt><dd>{numberFormat.format(selectedUser.creditsReserved)}</dd></div>
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
              <tr><th>Zeit</th><th>User</th><th>Modell</th><th>Zweck</th><th>Messbasis</th><th>Tokens</th><th>Kosten</th><th>XPORTAL Credits</th><th>Status</th></tr>
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
                  <td>{numberFormat.format(item.credits)}</td>
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
    </main>
  );
}
