"use client";
import { useCallback, useEffect, useState } from "react";
import { CREDIT_PLANS, TRIAL_CREDITS } from "@/lib/billing/plans";
import { IMPRINT_EMAIL } from "@/lib/legal/policy";
import styles from "./billing-management.module.css";
export type BillingStatusView = { planId: string; selectedPlanId?: string | null; subscriptionStatus: string | null; trialEnd: string | null; periodEnd: string | null; cancelAtPeriodEnd: boolean; latestInvoiceStatus: string | null; access: { canRunAi: boolean; canUseRecruiting: boolean; source: "starter" | "trial" | "paid" | "legacy" | "none"; reason: string }; credits: { total: number; used: number; reserved: number; remaining: number } };
export function billingDate(value: string | null): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Noch nicht bestätigt";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
}
/**
 * Was die Rückkehr von `/api/billing/checkout` oder Stripe im Konto anzeigt.
 * Die Route leitet mit `?billing=<code>` hierher; ohne diese Meldung landete
 * man nach einem gescheiterten Checkout kommentarlos wieder beim Testknopf.
 */
export function checkoutReturnMessage(code: string | null): { tone: "notice" | "error"; text: string } | null {
  if (!code) return null;
  if (code === "success") return { tone: "notice", text: "Stripe hat Ihre Karte bestätigt. Ihre Testphase wird aktiviert …" };
  if (code === "email_not_verified") return { tone: "error", text: "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse über den Link in unserer Bestätigungsmail. Danach starten Sie die Testphase erneut." };
  if (code === "subscription_exists") return { tone: "notice", text: "Für dieses Konto besteht bereits eine Testphase oder ein Abonnement. Die Details sehen Sie unten." };
  const safeCode = /^[a-z_-]{1,40}$/u.test(code) ? code : "unbekannt";
  return { tone: "error", text: `Der Checkout konnte gerade nicht gestartet werden (Code: ${safeCode}). Es wurde nichts abgebucht. Bitte versuchen Sie es in einigen Minuten erneut oder schreiben Sie an ${IMPRINT_EMAIL}.` };
}
const RECONCILE_DELAYS_MS = [0, 1_500, 3_000, 5_000, 8_000] as const;
async function reconcileCheckout(signal: AbortSignal): Promise<void> {
  const response = await fetch("/api/billing/reconcile", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}", signal });
  if (!response.ok && response.status !== 503) throw new Error("reconcile_failed");
}
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (ms === 0 || signal.aborted) { resolve(); return; }
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});
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
  const [checkoutMessage, setCheckoutMessage] = useState<ReturnType<typeof checkoutReturnMessage>>(null);
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
  useEffect(() => {
    if (initialStatus) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("billing");
    const message = checkoutReturnMessage(code);
    if (!message) return;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      params.delete("billing");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}${window.location.hash}`);
      setCheckoutMessage(message);
      if (code !== "success") return;
      // Nach Stripe den Stand direkt dort abgleichen, statt nur auf den Webhook zu warten.
      for (const delay of RECONCILE_DELAYS_MS) {
        await wait(delay, controller.signal);
        if (controller.signal.aborted) return;
        try {
          await reconcileCheckout(controller.signal);
          const next = await loadBillingStatus(controller.signal);
          if (controller.signal.aborted) return;
          setStatus(next); setError(null); setLoading(false);
          if (next.subscriptionStatus && next.access.source !== "none") {
            setCheckoutMessage({ tone: "notice", text: next.subscriptionStatus === "trialing" ? "Ihre Testphase ist aktiv. Viel Erfolg mit Ihrem ersten Mandat." : "Ihr Abonnement ist aktiv." });
            return;
          }
        } catch { if (controller.signal.aborted) return; }
      }
      setCheckoutMessage({ tone: "notice", text: "Stripe hat den Abschluss gemeldet, die Bestätigung ist aber noch nicht bei uns angekommen. Bitte aktualisieren Sie den Status in einer Minute." });
    })();
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
  const trial = status?.subscriptionStatus === "trialing" || status?.access.source === "trial";
  const starter = status?.access.source === "starter";
  const cardlessTrial = trial && !status?.subscriptionStatus;
  const paymentIssue = ["past_due", "unpaid", "incomplete"].includes(status?.subscriptionStatus ?? "");
  return <section className={styles.panel} aria-labelledby="billing-management-title"><header><p>Abrechnung und Zugang</p><h2 id="billing-management-title">{starter ? "Ihr kostenloser Einstieg" : trial ? "Ihre kostenlose Testphase" : "Ihr Software-Abonnement"}</h2></header>
    {loading ? <p role="status">Bestätigten Stripe-Status laden …</p> : null}
    {error ? <p className={styles.error} role="alert">{error} <a href="/chat?anmelden=1">Zur Anmeldung</a></p> : null}
    {checkoutMessage ? <p className={checkoutMessage.tone === "error" ? styles.error : styles.notice} role={checkoutMessage.tone === "error" ? "alert" : "status"}>{checkoutMessage.text}</p> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {status ? <><p className={styles.status}>{status.cancelAtPeriodEnd ? "Kündigung bestätigt" : starter ? "3 kostenlose Anfragen" : trial ? "Trial aktiv" : status.access.source === "paid" ? "Bezahlte Periode aktiv" : status.access.source === "legacy" ? "Bestandsguthaben" : "Keine aktive Nutzungsberechtigung"}</p><dl className={styles.facts}>
      <div><dt>Gewählter Tarif</dt><dd>{plan?.label ?? status.planId}{plan?.billingModel === "fixed_monthly" ? ` · ${plan.euro} € netto / Monat, zzgl. USt.` : ""}</dd></div>
      {status.trialEnd ? <div><dt>{cardlessTrial ? "Testzugang bis" : status.cancelAtPeriodEnd ? "Trial-Zugang bis" : "Erste kostenpflichtige Verlängerung"}</dt><dd>{billingDate(status.trialEnd)}</dd></div> : null}
      {!trial && status.periodEnd ? <div><dt>{status.cancelAtPeriodEnd ? "Zugang bis" : "Laufende Periode bis"}</dt><dd>{billingDate(status.periodEnd)}</dd></div> : null}
      <div><dt>Verbleibendes Kontingent</dt><dd>{status.credits.remaining.toLocaleString("de-DE")} Credits</dd></div></dl>
      {trial ? <p>Einmalig {TRIAL_CREDITS} Credits insgesamt. Keine Auffüllung und keine vorzeitige Abbuchung bei Verbrauch. {cardlessTrial ? "Der Gutschein-Test endet automatisch; es ist keine Karte hinterlegt." : status.cancelAtPeriodEnd ? "Die erste kostenpflichtige Verlängerung ist gekündigt." : "Danach beginnt der gewählte Monatstarif automatisch. Stripe versucht die Zahlung; die Abbuchung ist damit noch nicht bestätigt."}</p> : null}
      {starter ? <p>Einmalig drei Projektanalysen ohne Karte und ohne automatische Verlängerung. Danach wählen Sie selbst, ob Sie einen Tarif benötigen.</p> : null}
      {paymentIssue ? <p className={styles.error} role="alert">Zahlung offen oder zusätzliche Bestätigung erforderlich. Aktualisieren Sie Ihr Zahlungsmittel bei Stripe. Neue Monatscredits entstehen erst nach bestätigter Zahlung.</p> : null}
      {!status.access.canRunAi ? <p>Neue kostenpflichtige KI-Läufe sind derzeit nicht freigeschaltet. Projekte bleiben lesbar; Kontoverwaltung und Rechnungen bleiben erreichbar.</p> : null}
      <div className={styles.actions}>{status.subscriptionStatus ? <button type="button" onClick={() => void action("portal")} disabled={Boolean(busy)}>{busy === "portal" ? "Stripe öffnen …" : "Zahlungsmittel und Rechnungen bei Stripe"}</button> : <a href="/preise#tarife">{cardlessTrial || starter ? "Tarife ansehen" : "14 Tage kostenlos testen"}</a>}
        {status.subscriptionStatus && !status.cancelAtPeriodEnd && ["active", "trialing", "past_due"].includes(status.subscriptionStatus) ? <button type="button" onClick={() => setConfirmCancel(true)} disabled={Boolean(busy)}>{trial ? "Testphase kündigen" : "Zum Periodenende kündigen"}</button> : null}<button type="button" onClick={() => void refresh()} disabled={loading || Boolean(busy)}>Status aktualisieren</button></div>
      {confirmCancel ? <div className={styles.confirm} role="group" aria-label="Kündigung bestätigen"><p>{trial ? "Die erste kostenpflichtige Verlängerung kündigen?" : "Die nächste automatische Verlängerung kündigen?"} Zugang bleibt innerhalb des verbleibenden Kontingents bis zum bestätigten Enddatum erhalten.</p><button type="button" onClick={() => void action("cancel")} disabled={Boolean(busy)}>{busy === "cancel" ? "Kündigung bestätigen …" : "Kündigung jetzt bestätigen"}</button><button type="button" onClick={() => setConfirmCancel(false)} disabled={Boolean(busy)}>Zurück</button></div> : null}</> : null}
  </section>;
}
