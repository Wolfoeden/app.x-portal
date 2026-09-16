"use client";

import { useState } from "react";

import { creditPlan } from "@/lib/ai/credit-policy";
import { confirmBusinessCustomer } from "@/lib/auth/browser";
import { fixedPlanCheckout } from "@/lib/billing/payment-links";
import {
  CREDIT_PLANS,
  type FixedMonthlyPlan,
} from "@/lib/billing/plans";
import { TERMS_REVIEW } from "@/lib/legal/policy";

import type { AiUsageSnapshot, PlanTeamSnapshot } from "../chat-contract";
import { IconArrowUpRight, IconCheck, IconSpark } from "../icons";
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

export function totalBalance(usage: AiUsageSnapshot): number {
  return usage.credits.remaining;
}

export function AccountSummary({
  usage,
  displayName,
  email,
  isAccountUser,
  onMoreCredits,
}: {
  usage: AiUsageSnapshot | null;
  displayName: string;
  email: string;
  isAccountUser: boolean;
  onMoreCredits: () => void;
}) {
  const monthly = usage?.credits ?? null;
  const plan = creditPlan(monthly?.planId, !isAccountUser);
  const consumed = monthly ? monthly.used + monthly.reserved : 0;
  const progress = monthly && monthly.total > 0
    ? Math.min(100, Math.max(0, (consumed / monthly.total) * 100))
    : 0;

  return (
    <div className="account-summary">
      <div className="account-summary-head">
        <span className="account-summary-avatar" aria-hidden="true">{displayName.slice(0, 2).toUpperCase()}</span>
        <span className="account-summary-identity"><strong>{displayName}</strong><span>{email}</span></span>
      </div>
      <div className="account-summary-status">
        <span className="account-status-dot">{isAccountUser ? "Angemeldet" : "Gast"}</span>
        <span className="account-plan-badge">{plan.label}</span>
      </div>

      {monthly ? <>
        <div className="account-balance">
          <strong>{formatCreditAmount(plan.billingModel === "metered" ? monthly.used : monthly.remaining)} Credits</strong>
          <span>{plan.billingModel === "metered" ? "im laufenden Monat verbraucht" : "verfügbar"}</span>
        </div>
        {plan.billingModel === "fixed_monthly" ? (
          <section className="account-credit-block" aria-label="Guthaben">
            <div className="account-credit-progress" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(monthly.total, 1)} aria-valuenow={Math.min(consumed, Math.max(monthly.total, 1))}><span style={{ width: `${progress}%` }} /></div>
            <p className="account-credit-muted">{renewalLabel(monthly.periodEnd)}</p>
          </section>
        ) : (
          <p className="account-credit-muted">
            {plan.billingModel === "metered"
              ? `Voraussichtlich ${euroFormat.format(monthly.used * CREDIT_PLANS.enterprise_flex.euroPerCreditCents / 100)} netto.`
              : "Einmaliges Startguthaben – keine monatliche Auffüllung."}
          </p>
        )}
      </> : <p className="account-credit-muted">Guthaben wird geladen …</p>}

      {isAccountUser ? <button className="account-upgrade" type="button" onClick={onMoreCredits}><IconSpark size={14} /> Tarife ansehen</button> : null}
    </div>
  );
}

const ACCOUNT_FEATURES = [
  "Projektanalysen",
  "AI-Agent-Recherche",
  "Akquise-Anschreiben",
] as const;

function MonthlyPlanCard({
  plan,
  customerReference,
  businessConfirmed,
}: {
  plan: FixedMonthlyPlan;
  customerReference: string | null;
  businessConfirmed: boolean;
}) {
  const checkout = fixedPlanCheckout(plan.id as "basic" | "pro" | "business", customerReference);
  const canCheckout = Boolean(checkout && businessConfirmed && TERMS_REVIEW.checkoutEnabled);
  const fallback = `/contact?tarif=${plan.id}`;
  return (
    <article className={`plan-card ${plan.recommended ? "is-recommended" : ""}`}>
      <div className="plan-card-offer">
        <div>
          <p className="plans-section-label">{plan.recommended ? "Empfohlen" : "Monatsplan"}</p>
          <h3>{plan.label}</h3>
          <p className="plan-audience">{formatCreditAmount(plan.monthlyCredits)} Credits pro Monat</p>
        </div>
        <p className="plan-price">{euroFormat.format(plan.priceNetCents / 100)}<span>netto pro Monat</span></p>
        <ul className="plan-features">
          {ACCOUNT_FEATURES.map((feature) => <li key={feature}><IconCheck size={12} /> {feature}</li>)}
        </ul>
      </div>
      <a
        className="plan-action"
        href={canCheckout ? checkout! : fallback}
        target={canCheckout ? "_blank" : undefined}
        rel={canCheckout ? "noopener noreferrer" : undefined}
        onClick={() => { if (canCheckout) void confirmBusinessCustomer().catch(() => undefined); }}
      >
        {canCheckout ? `${plan.label} buchen` : `${plan.label} anfragen`} <IconArrowUpRight size={12} />
      </a>
    </article>
  );
}

export function CreditPlansDialog({
  usage,
  customerReference,
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
  customerReference: string | null;
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
  const [businessConfirmed, setBusinessConfirmed] = useState(false);
  const fixedPlans = [CREDIT_PLANS.basic, CREDIT_PLANS.pro, CREDIT_PLANS.business] as const;

  return (
    <div className="plans-dialog" role="dialog" aria-label="Credits und Pläne">
      <header className="plans-dialog-header"><h2>Plan und Guthaben</h2><button className="plans-close" type="button" onClick={onClose}>Schließen</button></header>
      <section className="plans-balance" aria-labelledby="plans-balance-title">
        <div><p className="plans-section-label">Aktueller Plan</p><h3 id="plans-balance-title">{plan.label}</h3><p>{plan.billingModel === "fixed_monthly" ? `${plan.euro} € ${planPriceSuffix(plan.euro)}` : plan.billingModel === "metered" ? "2 Cent netto je verbrauchtem Credit · 0 € Grundgebühr" : "Einmaliges Guthaben · keine monatliche Auffüllung"}</p></div>
        <div className="plans-balance-figure"><strong>{usage ? formatCreditAmount(plan.billingModel === "metered" ? usage.credits.used : totalBalance(usage)) : "–"} Credits</strong>{customerReference ? <code>{customerReference}</code> : null}</div>
      </section>

      <label className="plan-business-confirm">
        <input type="checkbox" checked={businessConfirmed} onChange={(event) => setBusinessConfirmed(event.target.checked)} />
        <span>Ich bestätige, dass ich als Unternehmer im Sinne des § 14 BGB handle und die Leistung für meine gewerbliche oder selbständige berufliche Tätigkeit buche.</span>
      </label>

      <div className="plans-grid">
        {fixedPlans.map((entry) => <MonthlyPlanCard key={entry.id} plan={entry} customerReference={customerReference} businessConfirmed={businessConfirmed} />)}
        <article className="plan-card">
          <div className="plan-card-offer"><div><p className="plans-section-label">Nach Nutzung</p><h3>Enterprise</h3><p className="plan-audience">Keine Grundgebühr und kein vorausbezahltes Kontingent.</p></div><p className="plan-price">0,02 €<span>netto pro Credit</span></p><ul className="plan-features"><li><IconCheck size={12} /> Monatliche Verbrauchsabrechnung</li><li><IconCheck size={12} /> Keine ungenutzten Pakete</li><li><IconCheck size={12} /> Teamnutzung beim Billing Owner</li></ul></div>
          <a className="plan-action" href="mailto:roman@dering.info?subject=XPORTAL%20Enterprise">Enterprise per E-Mail anfragen <IconArrowUpRight size={12} /></a>
        </article>
      </div>

      {plan.billingModel === "fixed_monthly" ? <CreditLimitSetting limit={selfLimit} maxCredits={plan.monthlyCredits} maxEuro={selfLimitMaxEuro} onSaved={onSelfLimitSaved} /> : null}
      <TeamMembersPanel team={team} planLabel={plan.label} busy={teamBusy} notice={teamNotice} onInvite={onInviteTeamMember} onRemove={onRemoveTeamMember} />
    </div>
  );
}
