import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { writeAuditEvent } from "@/lib/audit/write";
import {
  getAdminUsageDashboard,
  getAdminUserUsageInteractions,
} from "@/lib/ai/admin-usage";
import { getCurrentUser } from "@/lib/auth/current-user";
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

export default async function AiUsageAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; user?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isAdmin || currentUser.isAnonymous) notFound();

  const params = await searchParams;
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
            Provider-Nutzung und interne XPORTAL Credits werden getrennt
            ausgewertet.
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
          Die Ansicht ist auf jeweils 20.000 Usage- und Credit-Datensätze
          begrenzt. Engen Sie den Zeitraum ein oder nutzen Sie einen
          serverseitigen Export für eine vollständige Auswertung.
        </p>
      ) : null}

      <section className={styles.kpis} aria-label="Gesamtnutzung">
        <article>
          <span>Estimated API Cost</span>
          <strong>{formatUsd(dashboard.totals.estimatedCostUsd)}</strong>
          <small>
            {dashboard.totals.unknownCostRequests
              ? `${dashboard.totals.unknownCostRequests} ohne Preis`
              : "Alle Modelle bepreist"}
          </small>
        </article>
        <article>
          <span>Total API Tokens</span>
          <strong>{numberFormat.format(dashboard.totals.totalTokens)}</strong>
          <small>
            {numberFormat.format(dashboard.totals.cachedInputTokens)} cached
          </small>
        </article>
        <article>
          <span>AI Usage Settlements</span>
          <strong>{numberFormat.format(dashboard.totals.requests)}</strong>
          <small>Abgerechnete Versuche, inkl. Fehler/Fallbacks</small>
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
                <th>Input</th>
                <th>Cached</th>
                <th>Output</th>
                <th>Kosten</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.byModel.length ? (
                dashboard.byModel.map((model) => (
                  <tr key={model.key}>
                    <td><code>{model.key}</code></td>
                    <td>{numberFormat.format(model.requests)}</td>
                    <td>{numberFormat.format(model.inputTokens)}</td>
                    <td>{numberFormat.format(model.cachedInputTokens)}</td>
                    <td>{numberFormat.format(model.outputTokens)}</td>
                    <td>
                      {formatUsd(model.estimatedCostUsd)}
                      {model.unknownCostRequests ? " + unknown" : ""}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6}>Noch keine abgerechnete AI-Nutzung.</td></tr>
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
                <th>API Tokens</th>
                <th>Credits im Zeitraum</th>
                <th>Credits Remaining</th>
                <th>Kosten</th>
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
                  <td>{numberFormat.format(user.requests)}</td>
                  <td>{numberFormat.format(user.totalTokens)}</td>
                  <td>{numberFormat.format(user.creditsUsed)}</td>
                  <td>{numberFormat.format(user.creditsRemaining)}</td>
                  <td>{formatUsd(user.estimatedCostUsd)}</td>
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
            <div><dt>API Tokens</dt><dd>{numberFormat.format(selectedUser.totalTokens)}</dd></div>
            <div><dt>Estimated Cost</dt><dd>{formatUsd(selectedUser.estimatedCostUsd)}</dd></div>
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
              <tr><th>Zeit</th><th>User</th><th>Modell</th><th>Zweck</th><th>Tokens</th><th>Credits</th><th>Status</th></tr>
            </thead>
            <tbody>
              {selectedInteractions.length ? selectedInteractions.map((item, index) => (
                <tr key={`${item.id}-${index}`}>
                  <td>{when(item.settledAt)}</td>
                  <td>{item.email ?? item.userId ?? "Gelöscht"}</td>
                  <td><code>{item.model}</code></td>
                  <td>{item.purpose}</td>
                  <td>{numberFormat.format(item.tokens)}</td>
                  <td>{numberFormat.format(item.credits)}</td>
                  <td>
                    <span className={`${styles.status} ${outcomeClass(item.outcome)}`}>
                      {item.outcome}
                    </span>
                  </td>
                </tr>
              )) : <tr><td colSpan={7}>Keine Requests im gewählten Zeitraum.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
