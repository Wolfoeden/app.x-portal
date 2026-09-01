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
import {
  ENTERPRISE_CONTACT,
  ENTERPRISE_START_EURO,
  enterprisePaymentLink,
} from "@/lib/billing/payment-links";

import { IconArrowUpRight, IconCheck, IconSpark } from "../icons";
import { CreditLimitSetting } from "./credit-limit";
import { TeamMembersPanel } from "./team-members";

/**
 * Der einzige bezahlte Plan. Neben der Gratisstufe gibt es nichts weiter —
 * eine dritte Karte waere ein Angebot, das es nicht gibt.
 *
 * Die Zahlung ist zweigeteilt: ein Euro beim Buchen, die tatsaechliche Nutzung
 * am Monatsende auf Rechnung. Deshalb steht beim Preis "zum Start" und nicht
 * "pro Monat" — ein Monatspreis waere hier schlicht falsch.
 *
 * `credits` bleibt an der Guthabenregel haengen und nicht an einer Zahl von
 * Hand: was die Karte verspricht, muss das sein, was das System danach auch
 * freischaltet.
 */
export const ENTERPRISE_PLAN = {
  id: CREDIT_PLANS.enterprise.id,
  name: CREDIT_PLANS.enterprise.label,
  audience: "Für Unternehmen, die nach Verbrauch abrechnen.",
  startEuro: ENTERPRISE_START_EURO,
  credits: CREDIT_PLANS.enterprise.monthlyCredits,
  features: [
    "Voller Zugang zur Freelancer-Suche",
    "Websuche nach externen Profilen",
    "KI-Agenten für Recherche und Planung",
    "Teammitglieder teilen sich das Guthaben",
    "Abrechnung nach Verbrauch, auf Wunsch mit Obergrenze",
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
        Die Buchung läuft über Stripe: ein Euro beim Abschluss, die tatsächliche
        Nutzung folgt am Monatsende auf Rechnung. Das Guthaben wird nach
        bestätigter Zahlung automatisch freigeschaltet.
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
          <h3>{ENTERPRISE_PLAN.name}</h3>
          <p className="plan-audience">{ENTERPRISE_PLAN.audience}</p>
          <p className="plan-price">
            {ENTERPRISE_PLAN.startEuro} €<span>zum Start, zzgl. USt.</span>
          </p>
          <p className="plan-credits">
            {formatCreditAmount(ENTERPRISE_PLAN.credits)} Credits monatlich
          </p>
          <ul className="plan-features">
            {ENTERPRISE_PLAN.features.map((feature) => (
              <li key={feature}>
                <IconCheck size={12} /> {feature}
              </li>
            ))}
          </ul>
          {/* Die Kontokennung reist als `client_reference_id` mit. Ohne sie
              kommt bei Stripe eine Zahlung an, die sich keinem Konto zuordnen
              laesst. */}
          <a
            className="plan-action"
            href={enterprisePaymentLink(customerReference)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Plan buchen <IconArrowUpRight size={12} />
          </a>
          {/* Ueber die Abrechnung nach Verbrauch entstehen Rueckfragen, die ein
              Formular nicht beantwortet. Deshalb steht der Ansprechpartner
              neben dem Knopf und nicht auf einer Unterseite. */}
          <p className="plan-contact-note">
            Fragen zur Abrechnung oder eine Obergrenze vereinbaren:{" "}
            <a href={`mailto:${ENTERPRISE_CONTACT.email}`}>{ENTERPRISE_CONTACT.email}</a>
            {" · "}
            <a href={`tel:${ENTERPRISE_CONTACT.phone}`}>{ENTERPRISE_CONTACT.phoneDisplay}</a>
            {" · "}
            {ENTERPRISE_CONTACT.person}
          </p>
        </article>
      </div>

      {plan.purchasable ? (
        <CreditLimitSetting
          limit={selfLimit}
          maxCredits={ENTERPRISE_PLAN.credits}
          maxEuro={selfLimitMaxEuro}
          onSaved={onSelfLimitSaved}
        />
      ) : null}

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
