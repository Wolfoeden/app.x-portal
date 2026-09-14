"use client";

/**
 * Kontoübersicht und Credit-Kauf.
 *
 * Zwei Ansichten: die Zusammenfassung im Konto-Menü und der Plan-Dialog
 * dahinter. Beide zeigen dasselbe monatliche Guthaben aus der zentralen
 * Plan- und Credit-Policy.
 */

import { useState } from "react";

import {
  BRIEF_ANALYSIS_CREDITS,
  CREDIT_PLANS,
  creditPlan,
  EXTERNAL_SEARCH_CREDITS,
} from "@/lib/ai/credit-policy";
import { confirmBusinessCustomer } from "@/lib/auth/browser";
import { BUSINESS_ONLY_NOTICE } from "@/lib/legal/policy";
import { TERMS_REVIEW } from "@/lib/legal/policy";

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
 * Enterprise ist ein fester Monatspreis für ein festes Kontingent. Die
 * Oberfläche nennt keinen nachträglichen Verbrauchspreis, weil der aktuelle
 * Zahlungs- und Freischaltweg dafür keine Abrechnung implementiert.
 *
 * `credits` bleibt an der Guthabenregel haengen und nicht an einer Zahl von
 * Hand: was die Karte verspricht, muss das sein, was das System danach auch
 * freischaltet.
 */
export const ENTERPRISE_PLAN = {
  id: CREDIT_PLANS.enterprise.id,
  name: CREDIT_PLANS.enterprise.label,
  audience: "Für Unternehmen mit regelmäßigem Such- und Recherchebedarf.",
  startEuro: ENTERPRISE_START_EURO,
  credits: CREDIT_PLANS.enterprise.monthlyCredits,
  features: [
    "Voller Zugang zur Freelancer-Suche",
    "Websuche nach externen Profilen",
    "KI-Agenten für Recherche und Planung",
    "Teammitglieder teilen sich das Guthaben",
    "Festes Monatskontingent ohne nachträgliche Mehrberechnung",
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

/**
 * Der Kontostand. Eine Zahl, seit Analyse und Recherche aus demselben Topf
 * bezahlt werden — vorher wurden hier zwei Guthaben addiert, was die Summe
 * richtig und jede einzelne Zahl unverständlich machte.
 */
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
  const [businessConfirmed, setBusinessConfirmed] = useState(false);
  return (
    <div className="plans-dialog" role="dialog" aria-label="Credits und Pläne">
      <header className="plans-dialog-header">
        <div>
          <p className="eyebrow">Plan &amp; Guthaben</p>
          <h2>Aktueller Stand. Klare nächste Option.</h2>
          <p>Erst sehen Sie Ihr verfügbares Guthaben und die Aktionskosten. Danach folgt genau ein bezahlter Plan.</p>
        </div>
        <button className="plans-close" type="button" onClick={onClose}>
          Schließen
        </button>
      </header>

      <section className="plans-balance" aria-labelledby="plans-balance-title">
        <div>
          <p className="plans-section-label">Aktueller Plan</p>
          <h3 id="plans-balance-title">{plan.label}</h3>
          <p>{plan.euro} € {planPriceSuffix(plan.euro)} · {plan.agents ? "KI-Agenten nutzbar" : "KI-Agenten nach Kontoerstellung"}</p>
        </div>
        <div className="plans-balance-figure">
          <strong>
            {usage ? formatCreditAmount(totalBalance(usage)) : "–"} Credits
          </strong>
          {customerReference ? <code>{customerReference}</code> : null}
        </div>
      </section>

      <section className="plans-action-costs" aria-labelledby="plans-action-costs-title">
        <div>
          <p className="plans-section-label">Verbrauch</p>
          <h3 id="plans-action-costs-title">Was eine bestätigte Aktion kostet</h3>
          <p>Speichern, Prüfen und Kontaktieren starten keine automatische Recherche.</p>
        </div>
        <dl>
          <div>
            <dt>Projektanalyse</dt>
            <dd>{BRIEF_ANALYSIS_CREDITS} Credits</dd>
          </div>
          <div>
            <dt>Externe Recherche</dt>
            <dd>{EXTERNAL_SEARCH_CREDITS} Credits</dd>
          </div>
          <div>
            <dt>Automatik</dt>
            <dd>Keine</dd>
          </div>
        </dl>
      </section>

      <div className="plans-grid">
        <article className="plan-card">
          <div className="plan-card-offer">
            <div>
              <p className="plans-section-label">Einzige bezahlte Stufe</p>
              <h3>{ENTERPRISE_PLAN.name}</h3>
              <p className="plan-audience">{ENTERPRISE_PLAN.audience}</p>
            </div>
            <div>
              <p className="plan-price">
                {ENTERPRISE_PLAN.startEuro} €<span>pro Monat, zzgl. USt.</span>
              </p>
              <p className="plan-credits">
                {formatCreditAmount(ENTERPRISE_PLAN.credits)} Credits monatlich
              </p>
            </div>
            <ul className="plan-features">
              {ENTERPRISE_PLAN.features.map((feature) => (
                <li key={feature}>
                  <IconCheck size={12} /> {feature}
                </li>
              ))}
            </ul>
          </div>
          {/*
            Die Unternehmereigenschaft wird hier abgefragt und nicht mehr bei
            der Anmeldung.

            Das ist der Ort, an dem sie zählt: Die Beschränkung auf Unternehmer
            nach § 14 BGB trägt nur, wenn der *Bestellweg* sie abfragt und das
            Ergebnis festhält. Ein Satz in den AGB genügt nicht — bestellt
            jemand als Verbraucher, ohne dass es je abgefragt wurde, gilt
            Verbraucherrecht mitsamt Widerruf, Kündigungsknopf und
            Bruttopreisen.

            Deshalb ist der Knopf bis zum Häkchen nicht benutzbar, und der
            Zeitpunkt wird beim Klick am Konto vermerkt. Scheitert das
            Vermerken, wird trotzdem geöffnet: Die Erklärung ist abgegeben,
            und eine Bestellung an einem Netzwerkfehler scheitern zu lassen
            wäre die schlechtere Antwort.
          */}
          <label className="plan-business-confirm">
            <input
              type="checkbox"
              checked={businessConfirmed}
              onChange={(event) => setBusinessConfirmed(event.target.checked)}
            />
            <span>
              Ich bestätige, dass ich als Unternehmer im Sinne des § 14 BGB
              handle und diese Leistung für meine gewerbliche oder selbständige
              berufliche Tätigkeit buche.
            </span>
          </label>
          {/* Die Kontokennung reist als `client_reference_id` mit. Ohne sie
              kommt bei Stripe eine Zahlung an, die sich keinem Konto zuordnen
              laesst. */}
          <a
            className="plan-action"
            href={businessConfirmed && TERMS_REVIEW.checkoutEnabled
              ? enterprisePaymentLink(customerReference)
              : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!businessConfirmed || !TERMS_REVIEW.checkoutEnabled}
            tabIndex={businessConfirmed && TERMS_REVIEW.checkoutEnabled ? undefined : -1}
            onClick={(event) => {
              if (!businessConfirmed || !TERMS_REVIEW.checkoutEnabled) {
                event.preventDefault();
                return;
              }
              void confirmBusinessCustomer().catch(() => undefined);
            }}
          >
            {TERMS_REVIEW.checkoutEnabled ? "Plan buchen" : "Buchung nach rechtlicher Freigabe"} <IconArrowUpRight size={12} />
          </a>
          {!businessConfirmed ? (
            <p className="plan-contact-note">
              Setzen Sie zuerst das Häkchen — XPORTAL schließt Verträge
              ausschließlich mit Unternehmern.
            </p>
          ) : null}
          {!TERMS_REVIEW.checkoutEnabled ? (
            <p className="plan-contact-note" role="status">
              AGB-Status: {TERMS_REVIEW.label}. Der Bestellweg bleibt technisch
              erhalten und wird nach dokumentierter Freigabe aktiviert.
            </p>
          ) : null}
          {/* Bei Fragen zur Abrechnung braucht es einen direkten Weg, den ein
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
          <p className="plans-note">
            {BUSINESS_ONLY_NOTICE} Alle Preise verstehen sich netto zuzüglich der
            gesetzlichen Umsatzsteuer. Es gelten die{" "}
            <a href="/terms">Allgemeinen Geschäftsbedingungen</a>. Das Guthaben
            wird erst nach bestätigter Zahlung freigeschaltet.
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

    </div>
  );
}
