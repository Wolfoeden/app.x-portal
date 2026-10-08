"use client";
import { useCallback, useEffect, useState } from "react";
import { CREDIT_PLANS, TRIAL_CREDITS } from "@/lib/billing/plans";
import styles from "./billing-management.module.css";
export type BillingStatusView = { planId: string; selectedPlanId?: string | null; subscriptionStatus: string | null; trialEnd: string | null; periodEnd: string | null; cancelAtPeriodEnd: boolean; latestInvoiceStatus: string | null; access: { canRunAi: boolean; canUseRecruiting: boolean; source: "trial" | "paid" | "legacy" | "none"; reason: string }; credits: { total: number; used: number; reserved: number; remaining: number } };
export function billingDate(value: string | null): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Noch nicht bestätigt";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
}
async function loadBillingStatus(signal?: AbortSignal): Promise<BillingStatusView> {
  const response = await fetch("/api/billing/status", { credentials: "same-origin", cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? "Melden Sie sich an, um Ihre Abrechnung zu sehen." : body.error ?? "Die Abrechnung konnte nicht geladen werden.");
  return body;
}
export function BillingManagement({ initialStatus }: { initialStatus?: BillingStatusView }) {
  const [status, setStatus] = useState<BillingStatusView | null>(initialStatus ?? null);
  const [loading, setLoading] = useState(!initialStatus);
  const [busy, setBusy] = useState<"portal" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (initialStatus) return;
    try {
      setStatus(await loadBillingStatus()); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Die Abrechnung konnte nicht geladen werden."); }
    finally { setLoading(false); }
  }, [initialStatus]);
  useEffect(() => {
    if (initialStatus) return;
    const controller = new AbortController();
    void loadBillingStatus(controller.signal).then((nextStatus) => {
      if (controller.signal.aborted) return;
      setStatus(nextStatus); setError(null);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Die Abrechnung konnte nicht geladen werden.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [initialStatus]);
  const action = async (kind: "portal" | "cancel") => {
    if (initialStatus) { setNotice("Vorschau: Keine Änderung bei Stripe ausgeführt."); return; }
    setBusy(kind); setError(null);
    try {
      const response = await fetch(`/api/billing/${kind}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Die Änderung konnte nicht bestätigt werden.");
      if (kind === "portal" && typeof body.url === "string") { window.location.assign(body.url); return; }
      if (kind === "cancel") { setNotice(`Kündigung bestätigt. Zugang innerhalb Ihres verbleibenden Kontingents bis ${billingDate(body.accessUntil ?? body.trialEnd)}. Keine weitere automatische Verlängerung.`); setConfirmCancel(false); await refresh(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Die Änderung konnte nicht bestätigt werden."); }
    finally { setBusy(null); }
  };
  const plan = status ? CREDIT_PLANS[(status.selectedPlanId ?? status.planId) as keyof typeof CREDIT_PLANS] : null;
  const trial = status?.subscriptionStatus === "trialing";
  const paymentIssue = ["past_due", "unpaid", "incomplete"].includes(status?.subscriptionStatus ?? "");
  return <section className={styles.panel} aria-labelledby="billing-management-title"><header><p>Abrechnung und Zugang</p><h2 id="billing-management-title">{trial ? "Ihre kostenlose Testphase" : "Ihr Software-Abonnement"}</h2></header>
    {loading ? <p role="status">Bestätigten Stripe-Status laden …</p> : null}
    {error ? <p className={styles.error} role="alert">{error} <a href="/chat?anmelden=1">Zur Anmeldung</a></p> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {status ? <><p className={styles.status}>{status.cancelAtPeriodEnd ? "Kündigung bestätigt" : trial ? "Trial aktiv" : status.access.source === "paid" ? "Bezahlte Periode aktiv" : status.access.source === "legacy" ? "Bestandsguthaben" : "Keine aktive Nutzungsberechtigung"}</p><dl className={styles.facts}>
      <div><dt>Gewählter Tarif</dt><dd>{plan?.label ?? status.planId}{plan?.billingModel === "fixed_monthly" ? ` · ${plan.euro} € netto / Monat, zzgl. USt.` : ""}</dd></div>
      {status.trialEnd ? <div><dt>{status.cancelAtPeriodEnd ? "Trial-Zugang bis" : "Erste kostenpflichtige Verlängerung"}</dt><dd>{billingDate(status.trialEnd)}</dd></div> : null}
      {!trial && status.periodEnd ? <div><dt>{status.cancelAtPeriodEnd ? "Zugang bis" : "Laufende Periode bis"}</dt><dd>{billingDate(status.periodEnd)}</dd></div> : null}
      <div><dt>Verbleibendes Kontingent</dt><dd>{status.credits.remaining.toLocaleString("de-DE")} Credits</dd></div></dl>
      {trial ? <p>Einmalig {TRIAL_CREDITS} Credits insgesamt. Keine Auffüllung und keine vorzeitige Abbuchung bei Verbrauch. {status.cancelAtPeriodEnd ? "Die erste kostenpflichtige Verlängerung ist gekündigt." : "Danach beginnt der gewählte Monatstarif automatisch. Stripe versucht die Zahlung; die Abbuchung ist damit noch nicht bestätigt."}</p> : null}
      {paymentIssue ? <p className={styles.error} role="alert">Zahlung offen oder zusätzliche Bestätigung erforderlich. Aktualisieren Sie Ihr Zahlungsmittel bei Stripe. Neue Monatscredits entstehen erst nach bestätigter Zahlung.</p> : null}
      {!status.access.canRunAi ? <p>Neue kostenpflichtige KI-Läufe sind derzeit nicht freigeschaltet. Projekte bleiben lesbar; Kontoverwaltung und Rechnungen bleiben erreichbar.</p> : null}
      <div className={styles.actions}>{status.subscriptionStatus ? <button type="button" onClick={() => void action("portal")} disabled={Boolean(busy)}>{busy === "portal" ? "Stripe öffnen …" : "Zahlungsmittel und Rechnungen bei Stripe"}</button> : <a href="/preise#tarife">14 Tage kostenlos testen</a>}
        {status.subscriptionStatus && !status.cancelAtPeriodEnd && ["active", "trialing", "past_due"].includes(status.subscriptionStatus) ? <button type="button" onClick={() => setConfirmCancel(true)} disabled={Boolean(busy)}>{trial ? "Testphase kündigen" : "Zum Periodenende kündigen"}</button> : null}<button type="button" onClick={() => void refresh()} disabled={loading || Boolean(busy)}>Status aktualisieren</button></div>
      {confirmCancel ? <div className={styles.confirm} role="group" aria-label="Kündigung bestätigen"><p>{trial ? "Die erste kostenpflichtige Verlängerung kündigen?" : "Die nächste automatische Verlängerung kündigen?"} Zugang bleibt innerhalb des verbleibenden Kontingents bis zum bestätigten Enddatum erhalten.</p><button type="button" onClick={() => void action("cancel")} disabled={Boolean(busy)}>{busy === "cancel" ? "Kündigung bestätigen …" : "Kündigung jetzt bestätigen"}</button><button type="button" onClick={() => setConfirmCancel(false)} disabled={Boolean(busy)}>Zurück</button></div> : null}</> : null}
  </section>;
}
