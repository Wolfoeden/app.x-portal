"use client";

import { useState, type FormEvent } from "react";

import { creditPlan } from "@/lib/ai/credit-policy";
import { ACCOUNT_NAME_MAX_LENGTH } from "@/lib/auth/account-name";
import { customerPortalUrl } from "@/lib/billing/payment-links";
import { CREDIT_PLANS } from "@/lib/billing/plans";

import type { AiUsageSnapshot, PlanTeamSnapshot } from "../chat-contract";
import { IconArrowUpRight, IconSpark } from "../icons";
import { CreditLimitSetting } from "./credit-limit";
import { TeamMembersPanel } from "./team-members";

const creditFormat = new Intl.NumberFormat("de-DE");
const euroFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function planPriceSuffix(euro: number): string {
  return euro > 0 ? "pro Monat, zzgl. USt." : "ohne Grundgebühr";
}

export function formatCreditAmount(value: number): string {
  return creditFormat.format(Math.max(0, Math.round(value)));
}

export function renewalLabel(periodEnd: string, now = new Date()): string {
  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return "Erneuerung unbekannt";
  const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "Credits werden gerade erneuert";
  if (days === 1) return "Credits werden morgen erneuert";
  return `Credits werden in ${days} Tagen erneuert`;
}

type SubscriptionStatus = NonNullable<
  AiUsageSnapshot["credits"]["subscriptionStatus"]
>;

export function subscriptionStatusLabel(
  status: SubscriptionStatus | null | undefined,
  cancelAtPeriodEnd = false,
): string | null {
  if (cancelAtPeriodEnd && status !== "canceled") return "Gekündigt";
  if (status === "active" || status === "trialing") return "Abo aktiv";
  if (status === "pending" || status === "incomplete") return "Aktivierung läuft";
  if (status === "past_due" || status === "unpaid") return "Zahlung offen";
  if (status === "paused") return "Pausiert";
  if (status === "canceled" || status === "incomplete_expired") return "Beendet";
  return null;
}

export function billingPeriodLabel(
  periodEnd: string,
  status: SubscriptionStatus | null | undefined,
  cancelAtPeriodEnd = false,
): string {
  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime())) {
    if (status === "pending" || status === "incomplete") return "Zahlung wird bestätigt";
    if (status === "canceled" || status === "incomplete_expired") return "Abonnement beendet";
    return "Abrechnungszeitraum wird geladen";
  }
  const formattedEnd = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(end);
  if (cancelAtPeriodEnd) return `Credits verfügbar bis ${formattedEnd}`;
  if (status === "past_due" || status === "unpaid") {
    return `Keine neue Auffüllung ohne Zahlung · aktueller Zeitraum bis ${formattedEnd}`;
  }
  if (status === "pending" || status === "incomplete") return "Zahlung wird bestätigt";
  if (status === "canceled" || status === "incomplete_expired") return "Abonnement beendet";
  return renewalLabel(periodEnd);
}

export function totalBalance(usage: AiUsageSnapshot): number {
  return usage.credits.remaining;
}

/**
 * Der Name im Kopf der Kontokarte. Ein Klick macht ihn zum Eingabefeld;
 * Enter oder „Speichern" übernimmt, Escape verwirft.
 */
function EditableAccountName({
  name,
  onSave,
}: {
  name: string;
  onSave: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button className="account-name-button" type="button" title="Name ändern" onClick={() => setDraft(name)}>
        {name}
      </button>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const next = draft.trim();
    if (next === name) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der Name konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="account-name-form" onSubmit={submit}>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // Markiert die Taste als erledigt, damit sie nicht zusätzlich die
          // ganze Karte schließt.
          event.preventDefault();
          setDraft(null);
          setError(null);
        }}
        aria-label="Name"
        autoComplete="name"
        maxLength={ACCOUNT_NAME_MAX_LENGTH}
        autoFocus
        disabled={saving}
      />
      <button type="submit" disabled={saving}>{saving ? "…" : "Speichern"}</button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </form>
  );
}

export function AccountSummary({
  usage,
  displayName,
  email,
  isAccountUser,
  onRename,
  onMoreCredits,
}: {
  usage: AiUsageSnapshot | null;
  displayName: string;
  email: string;
  isAccountUser: boolean;
  /** Nur für Konten: Gäste haben keinen Namen, den sie ändern könnten. */
  onRename?: (name: string) => Promise<void>;
  onMoreCredits: () => void;
}) {
  const monthly = usage?.credits ?? null;
  const plan = creditPlan(monthly?.planId, !isAccountUser);
  const consumed = monthly ? monthly.used + monthly.reserved : 0;
  const subscriptionLabel = subscriptionStatusLabel(
    monthly?.subscriptionStatus,
    monthly?.cancelAtPeriodEnd,
  );
  const progress = monthly && monthly.total > 0
    ? Math.min(100, Math.max(0, (consumed / monthly.total) * 100))
    : 0;

  return (
    <div className="account-summary">
      <div className="account-summary-head">
        <span className="account-summary-avatar" aria-hidden="true">{displayName.slice(0, 2).toUpperCase()}</span>
        <span className="account-summary-identity">
          {onRename ? <EditableAccountName name={displayName} onSave={onRename} /> : <strong>{displayName}</strong>}
          <span>{email}</span>
        </span>
      </div>
      <div className="account-summary-status">
        <span className="account-status-dot">{isAccountUser ? "Angemeldet" : "Gast"}</span>
        <span className="account-plan-badge">{subscriptionLabel ?? plan.label}</span>
      </div>

      {monthly ? <>
        <div className="account-balance">
          <strong>{formatCreditAmount(plan.billingModel === "metered" ? monthly.used : monthly.remaining)} Credits</strong>
          <span>{plan.billingModel === "metered" ? "im laufenden Monat verbraucht" : "verfügbar"}</span>
        </div>
        {plan.billingModel === "fixed_monthly" ? (
          <section className="account-credit-block" aria-label="Guthaben">
            <div className="account-credit-progress" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(monthly.total, 1)} aria-valuenow={Math.min(consumed, Math.max(monthly.total, 1))}><span style={{ width: `${progress}%` }} /></div>
            <p className="account-credit-muted">{billingPeriodLabel(
              monthly.periodEnd,
              monthly.subscriptionStatus,
              monthly.cancelAtPeriodEnd,
            )}</p>
          </section>
        ) : plan.billingModel === "metered" ? (
          <p className="account-credit-muted">
            {`Voraussichtlich ${euroFormat.format(monthly.used * CREDIT_PLANS.enterprise_flex.euroPerCreditCents / 100)} netto.`}
          </p>
        ) : null}
      </> : <p className="account-credit-muted">Guthaben wird geladen …</p>}

      {isAccountUser ? <button className="account-upgrade" type="button" onClick={onMoreCredits}><IconSpark size={14} /> Abrechnung und Team</button> : null}
    </div>
  );
}

export function CreditPlansDialog({
  usage,
  team,
  teamBusy,
  teamNotice,
  selfLimit,
  selfLimitMaxEuro,
  onSelfLimitSaved,
  onInviteTeamMember,
  onRemoveTeamMember,
  onClose,
}: {
  usage: AiUsageSnapshot | null;
  selfLimit: number | null;
  selfLimitMaxEuro: number;
  onSelfLimitSaved: (limit: number | null) => void;
  team: PlanTeamSnapshot | null;
  teamBusy: boolean;
  teamNotice: { tone: "error" | "success"; message: string } | null;
  onInviteTeamMember: (email: string) => void;
  onRemoveTeamMember: (memberUserId: string) => void;
  onClose: () => void;
}) {
  const plan = creditPlan(usage?.credits.planId);
  const subscriptionLabel = subscriptionStatusLabel(
    usage?.credits.subscriptionStatus,
    usage?.credits.cancelAtPeriodEnd,
  );
  const portal = customerPortalUrl();

  return (
    <div className="plans-dialog" role="dialog" aria-label="Abrechnung und Team">
      <header className="plans-dialog-header"><h2>Abrechnung und Team</h2><button className="plans-close" type="button" onClick={onClose}>Schließen</button></header>
      <section className="plans-balance" aria-labelledby="plans-balance-title">
        <div><p className="plans-section-label">Aktueller Plan</p><h3 id="plans-balance-title">{plan.label}</h3><p>{plan.billingModel === "fixed_monthly" ? `${plan.euro} € ${planPriceSuffix(plan.euro)}` : plan.billingModel === "metered" ? "2 Cent netto je verbrauchtem Credit · 0 € Grundgebühr" : "Einmaliges Guthaben · keine monatliche Auffüllung"}</p></div>
        <div className="plans-balance-figure"><strong>{usage ? formatCreditAmount(plan.billingModel === "metered" ? usage.credits.used : totalBalance(usage)) : "–"} Credits</strong><span>{subscriptionLabel ?? "Kontostand"}</span></div>
        {subscriptionLabel ? (
          <div className="plans-billing-rail" data-status={usage?.credits.subscriptionStatus ?? "pending"}>
            <span className="plans-billing-dot" aria-hidden="true" />
            <div>
              <strong>{subscriptionLabel}</strong>
              <span>{usage ? billingPeriodLabel(
                usage.credits.periodEnd,
                usage.credits.subscriptionStatus,
                usage.credits.cancelAtPeriodEnd,
              ) : "Zahlungsstatus wird geladen"}</span>
            </div>
            {portal ? <a href={portal}>Zahlungen und Rechnungen <IconArrowUpRight size={12} /></a> : null}
          </div>
        ) : null}
      </section>

      <a className="plan-action" href="/preise">
        Tarife ansehen und Credits kaufen <IconArrowUpRight size={12} />
      </a>

      {plan.billingModel === "fixed_monthly" ? <CreditLimitSetting limit={selfLimit} maxCredits={plan.monthlyCredits} maxEuro={selfLimitMaxEuro} onSaved={onSelfLimitSaved} /> : null}
      <TeamMembersPanel team={team} planLabel={plan.label} busy={teamBusy} notice={teamNotice} onInvite={onInviteTeamMember} onRemove={onRemoveTeamMember} />
    </div>
  );
}
