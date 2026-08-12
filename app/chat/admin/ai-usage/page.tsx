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
  const requestedModel = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-terra";
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
          <strong>{numberFormat.format(dm���-�G����ƭy�OFT_AUTH_ENABLED ? (
                    <button type="button" onClick={() => void connectProvider("microsoft")} disabled={Boolean(busy)}><span className="provider-letter microsoft" aria-hidden="true">M</span>{busy === "microsoft" ? "Microsoft wird geöffnet …" : "Mit Microsoft fortfahren"}</button>
                  ) : null}
                </div>
                <div className="or-divider"><span>oder</span></div>
              </>
            ) : null}
            <div className="auth-mode-tabs" role="tablist" aria-label="E-Mail-Zugang">
              <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(null); }}>Bestehendes Konto</button>
              <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(null); }}>Neues Konto</button>
            </div>
          </>
        ) : null}

        {confirmationSent ? (
          <div className="confirmation-state" role="status">
            <span aria-hidden="true">✓</span>
            <h3>{mode === "recover" ? "Wiederherstellungslink versendet" : "Bestätigungslink versendet"}</h3>
            <p>
              {mode === "recover" ? (
                <>Öffnen Sie den Link in der E-Mail an <strong>{email}</strong> und legen Sie anschließend ein neues Passwort fest.</>
              ) : (
                <>Öffnen Sie den Link in der E-Mail an <strong>{email}</strong>, um Ihr Konto mit dem gewählten Passwort zu aktivieren.</>
              )}
            </p>
            <button type="button" onClick={onClose}>Verstanden</button>
          </div>
        ) : (
          <form className="email-login" onSubmit={submitEmail}>
            {mode !== "set-password" ? (
              <>
                <label htmlFor="login-email">E-Mail-Adresse</label>
                <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              </>
            ) : null}
            {mode === "login" || mode === "register" || mode === "set-password" ? (
              <>
                <label htmlFor="login-password">{mode === "set-password" ? "Neues Passwort" : "Passwort"}</label>
                <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
              </>
            ) : null}
            {mode === "register" || mode === "set-password" ? (
              <>
                <label htmlFor="login-password-repeat">Passwort wiederholen</label>
                <input id="login-password-repeat" type="password" value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} autoComplete="new-password" minLength={8} required />
              </>
            ) : null}
            {mode === "login" ? (
              <button className="forgot-password" type="button" onClick={() => { setMode("recover"); setError(null); setPassword(""); }}>
                Passwort vergessen?
              </button>
            ) : null}
            {mode === "recover" ? (
              <button className="back-to-login" type="button" onClick={() => { setMode("login"); setError(null); }}>
                Zurück zur Anmeldung
              </button>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="auth-submit" type="submit" disabled={Boolean(busy)}>
              {busy === "email"
                ? "Bitte warten …"
                : mode === "login"
                  ? "Mit E-Mail anmelden"
                  : mode === "register"
                    ? "Konto erstellen"
                    : mode === "recover"
                      ? "Wiederherstellungslink senden"
                      : "Passwort speichern & fortfahren"}
            </button>
          </form>
        )}
        <p className="auth-privacy">Die Anmeldung dient dazu, Projekte geräteübergreifend zuzuordnen und eine Profilwahl sicher fortzusetzen.</p>
      </div>
    </Modal>
  );
}

function ContactDialog({ profile, onClose }: { profile: FreelancerProfileResult; onClose: () => void }) {
  return (
    <Modal titleId="contact-title" onClose={onClose} size="large">
      <div className="contact-dialog">
        <div className="contact-dialog-header">
          <div className="contact-profile-avatar" aria-hidden="true">{initials(profile.displayName)}</div>
          <div><span className="dialog-eyebrow">Reales Profil ausgewählt</span><h2 id="contact-title">Termin mit {profile.displayName}</h2><p>{profile.role}</p></div>
        </div>
        <div className="contact-layout">
          <div className="contact-copy">
            <div className="roman-card">
              <div className="live-row"><span className="live-dot" aria-hidden="true" /> Live erreichbar</div>
              <h3>Roman Dering begleitet den Kontakt</h3>
              <p>{profile.bookingUrl ? "Buchen Sie direkt einen freien Termin beim Freelancer. Bei Rückfragen ist Roman Dering zusätzlich erreichbar." : "Dieses historische Match ist derzeit nicht direkt buchbar. Roman Dering hilft bei Rückfragen oder Alternativen."}</p>
              <a className="phone-action" href={`tel:${CONTACT_PHONE}`}><span aria-hidden="true">☎</span><span><small>Direkt anrufen</small>{CONTACT_PHONE_LABEL}</span></a>
            </div>
            <div className="continue-note"><span aria-hidden="true">＋</span><p><strong>Noch etwas ergänzen?</strong>Schließen Sie dieses Fenster und schreiben Sie frei im Chat weiter. Die Terminoption bleibt sichtbar.</p></div>
          </div>
          <div className="calendar-area">
            <div className="calendar-consent">
              <div className="calendar-symbol" aria-hidden="true"><span>↗</span><small>BOOKING</small></div>
              <h3>{profile.bookingUrl ? "Direkt Termin wählen" : "Aktuell nicht buchbar"}</h3>
              <p>{profile.bookingUrl ? `Die Buchungsseite von ${profile.displayName} wird erst nach Ihrem Klick in einem neuen Tab geöffnet.` : "Der frühere Treffer bleibt zur Nachvollziehbarkeit sichtbar, aber es ist kein aktueller Booking-Link freigegeben."}</p>
              {profile.bookingUrl ? (
                <a
                  className="booking-link-action"
                  href={profile.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Meeting buchen <span aria-hidden="true">→</span>
                </a>
              ) : (
                <span className="booking-unavailable">Aktuell kein direkter Booking-Link</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteDialog({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal titleId="delete-title" onClose={onClose}>
      <div className="delete-dialog">
        <span className="danger-symbol" aria-hidden="true">!</span>
        <h2 id="delete-title">Anwendungsdaten löschen?</h2>
        <p>Ihre Projekte, Nachrichten und gespeicherten Ergebnisse werden entsprechend der geltenden Aufbewahrungsregeln gelöscht oder anonymisiert. Dieser Schritt kann nicht rückgängig gemacht werden.</p>
        <div className="dialog-actions">
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button className="danger-action" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Wird gelöscht …" : "Daten endgültig löschen"}</button>
        </div>
      </div>
    </Modal>
  );
}
