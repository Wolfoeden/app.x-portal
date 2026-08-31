"use client";

/**
 * Kontoübersicht und Credit-Kauf.
 *
 * Zwei Ansichten: die Zusammenfassung im Konto-Menü und der Plan-Dialog
 * dahinter. Beide zeigen dieselben zwei Guthaben getrennt, weil sie sich
 * unterschiedlich verhalten — das monatliche Kontingent verfällt und füllt
 * sich wieder auf, gekaufte Credits nicht.
 */

import {
  BRIEF_ANALYSIS_CREDITS,
  CREDIT_PLANS,
  creditPlan,
} from "@/lib/ai/credit-policy";
import { BUSINESS_ONLY_NOTICE } from "@/lib/legal/policy";

import type { AiUsageSnapshot, PlanTeamSnapshot } from "../chat-contract";
import { IconArrowUpRight, IconCheck, IconSpark } from "../icons";
import { TeamMembersPanel } from "./team-members";

/**
 * Der Plan, der aktuell verkauft wird. Er hebt das monatliche Kontingent —
 * er legt kein zweites, unbefristetes Guthaben daneben. Deshalb steht hier
 * "pro Monat" und nicht "einmalig".
 */
export const STARTER_PLAN = {
  id: CREDIT_PLANS.enterprise.id,
  name: CREDIT_PLANS.enterprise.label,
  audience: "Für Teams, die gemeinsam suchen.",
  euro: CREDIT_PLANS.enterprise.euro,
  credits: CREDIT_PLANS.enterprise.monthlyCredits,
  features: [
    "Voller Zugang zur Freelancer-Suche",
    "Websuche nach externen Profilen",
    "KI-Agenten für Recherche und Planung",
    "Teammitglieder teilen sich das Guthaben",
  ],
} as const;

/**
 * Preisangabe mit Steuerhinweis.
 *
 * XPORTAL richtet sich ausschließlich an Unternehmer, deshalb sind Nettopreise
 * mit "zzgl. USt." zulässig — aber nur, wenn der Hinweis auch dasteht. Bei 0 €
 * bliebe er ein sinnloser Zusatz und entfällt.
 */
export function planPriceSuffix(euro: number): string {
  return euro > 0 ? "pro Monat, zzgl. USt." : "pro Monat";
}

const creditFormat = new Intl.NumberFormat("de-DE");

export function formatCreditAmount(value: number): string {
  return creditFormat.format(Math.max(0, Math.round(value)));
}

/** "in 16 Tagen" — der Countdown aus dem Vorbild. */
export function renewalLabel(periodEnd: string, now = new Date()): string {
  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return "Erneuerung unbekannt";
  const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "Credits werden gerade erneuert";
  if (days === 1) return "Credits werden morgen erneuert";
  return `Credits werden in ${days} Tagen erneuert`;
}

export function totalBalance(usage: AiUsageSnapshot): number {
  return usage.credits.remaining + (usage.productCredits?.available ?? 0);
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
  const consumed = monthly ? monthly.used + monthly.reserved : 0;
  const progress =
    monthly && monthly.total > 0
      ? Math.min(100, Math.max(0, (consumed / monthly.total) * 100))
      : 0;

  return (
    <div className="account-summary">
      <div className="account-summary-head">
        <span className="account-summary-avatar" aria-hidden="true">
          {displayName.slice(0, 2).toUpperCase()}
        </span>
        <span className="account-summary-identity">
          <strong>{displayName}</strong>
          <span>{email}</span>
        </span>
      </div>

      <div className="account-summary-status">
        <span className="account-status-dot">
          {isAccountUser ? "Angemeldet" : "Gast"}
        </span>
        <span className="account-plan-badge">
          {creditPlan(usage?.credits.planId, !isAccountUser).label}
        </span>
      </div>

      {usage ? (
        <>
          {/* Ein Guthaben, eine Zahl. Gekaufte und monatliche Credits werden
              zusammengezählt — die Unterscheidung war für den Nutzer nur dann
              wichtig, wenn er sie beim Monatswechsel bemerkt, und dafür steht
              die Erneuerungszeile darunter. */}
          <div className="account-balance">
            <strong>{formatCreditAmount(totalBalance(usage))} Credits</strong>
            <span>verfügbar</span>
          </div>

          {monthly ? (
            <section className="account-credit-block" aria-label="Guthaben">
              <div
                className="account-credit-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={Math.max(monthly.total, 1)}
                aria-valuenow={Math.min(consumed, Math.max(monthly.total, 1))}
              >
                <span style={{ width: `${progress}%` }} />
              </div>
              <p className="account-credit-muted">{renewalLabel(monthly.periodEnd)}</p>
            </section>
          ) : null}
        </>
      ) : (
        <p className="account-credit-muted">Guthaben wird geladen …</p>
      )}

      {isAccountUser ? (
        <button className="account-upgrade" type="button" onClick={onMoreCredits}>
          <IconSpark size={14} /> Mehr Credits erhalten
        </button>
      ) : null}
    </div>
  );
}

export function CreditPlansDialog({
  usage,
  customerReference,
  team,
  teamBusy,
  teamNotice,
  onInviteTeamMember,
  onRemoveTeamMember,
  onClose,
}: {
  usage: AiUsageSnapshot | null;
  customerReference: string | null;
  team: PlanTeamSnapshot | null;
  teamBusy: boolean;
  teamNotice: { tone: "error" | "success"; message: string } | null;
  onInviteTeamMember: (email: string) => void;
  onRemoveTeamMember: (memberUserId: string) => void;
  onClose: () => void;
}) {
  const plan = creditPlan(usage?.credits.planId);
  return (
    <div className="plans-dialog" role="dialog" aria-label="Credits und Pläne">
      <header className="plans-balance">
        <div>
          <h2>Guthaben</h2>
          <p>Deine aktuellen Credits im persönlichen Account.</p>
        </div>
        <div className="plans-balance-figure">
          <strong>
            {usage ? formatCreditAmount(totalBalance(usage)) : "–"} Credits
          </strong>
          {customerReference ? <code>{customerReference}</code> : null}
        </div>
      </header>

      <p className="plans-note">
        Die Zahlungsabwicklung wird noch angebunden. Ein Plan lässt sich hier
        ansehen, aber noch nicht kaufen.
      </p>

      <p className="plans-note">
        {BUSINESS_ONLY_NOTICE} Alle Preise verstehen sich netto zuzüglich der
        gesetzlichen Umsatzsteuer. Es gelten die{" "}
        <a href="/terms">Allgemeinen Geschäftsbedingungen</a>.
      </p>

      <div className="plans-grid">
        <article className="plan-card is-current">
          <h3>{plan.label}</h3>
          <p className="plan-audience">Ihr aktueller Plan.</p>
          <p className="plan-price">
            {plan.euro} €<span>{planPriceSuffix(plan.euro)}</span>
          </p>
          <p className="plan-credits">
            {usage ? formatCreditAmount(usage.credits.total) : "–"} Credits monatlich
          </p>
          <ul className="plan-features">
            <li>
              <IconCheck size={12} /> Freelancer-Suche im internen Katalog
            </li>
            <li>
              <IconCheck size={12} /> Eine Suche kostet {BRIEF_ANALYSIS_CREDITS}{" "}
              Credits
            </li>
            <li>
              <IconCheck size={12} />{" "}
              {plan.agents
                ? "KI-Agenten nutzbar"
                : "KI-Agenten erst mit einem Konto"}
            </li>
          </ul>
          <button type="button" disabled>
            Aktueller Plan
          </button>
        </article>

        <article className="plan-card">
          <h3>{STARTER_PLAN.name}</h3>
          <p className="plan-audience">{STARTER_PLAN.audience}</p>
          <p className="plan-price">
            {STARTER_PLAN.euro} €
            <span>{planPriceSuffix(STARTER_PLAN.euro)}</span>
          </p>
          <p className="plan-credits">
            {formatCreditAmount(STARTER_PLAN.credits)} Credits monatlich
          </p>
          <ul className="plan-features">
            {STARTER_PLAN.features.map((feature) => (
              <li key={feature}>
                <IconCheck size={12} /> {feature}
              </li>
            ))}
          </ul>
          <button type="button" disabled title="Zahlung wird noch angebunden">
            Plan auswählen <IconArrowUpRight size={12} />
          </button>
        </article>
      </div>

      <TeamMembersPanel
        team={team}
        planLabel={plan.label}
        busy={teamBusy}
        notice={teamNotice}
        onInvite={onInviteTeamMember}
        onRemove={onRemoveTeamMember}
      />

      <button className="plans-close" type="button" onClick={onClose}>
        Schließen
      </button>
    </div>
  );
}
