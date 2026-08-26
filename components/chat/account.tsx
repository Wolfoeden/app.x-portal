"use client";

/**
 * Kontoübersicht und Credit-Kauf.
 *
 * Zwei Ansichten: die Zusammenfassung im Konto-Menü und der Plan-Dialog
 * dahinter. Beide zeigen dieselben zwei Guthaben getrennt, weil sie sich
 * unterschiedlich verhalten — das monatliche Kontingent verfällt und füllt
 * sich wieder auf, gekaufte Credits nicht.
 */

import type { AiUsageSnapshot } from "../chat-contract";
import { IconArrowUpRight, IconCheck, IconSpark } from "../icons";

/** Der einzige Plan, der aktuell verkauft wird. */
export const STARTER_PLAN = {
  id: "starter",
  name: "Starter",
  audience: "Für Freelancer und Kleinunternehmen.",
  euro: 25,
  credits: 1_500,
  features: [
    "Voller Zugang zur Freelancer-Suche",
    "Websuche nach externen Profilen",
    "Credits laufen nie ab",
  ],
} as const;

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
        <span className="account-plan-badge">Free</span>
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
              <p>
                {formatCreditAmount(consumed)} / {formatCreditAmount(monthly.total)}{" "}
                Credits diesen Monat verwendet
              </p>
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
  onClose,
}: {
  usage: AiUsageSnapshot | null;
  customerReference: string | null;
  onClose: () => void;
}) {
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

      <div className="plans-grid">
        <article className="plan-card is-current">
          <h3>Free</h3>
          <p className="plan-audience">Ihr aktueller Plan.</p>
          <p className="plan-price">
            0 €<span>pro Monat</span>
          </p>
          <p className="plan-credits">
            {usage ? formatCreditAmount(usage.credits.total) : "–"} Credits monatlich
          </p>
          <ul className="plan-features">
            <li>
              <IconCheck size={12} /> Freelancer-Suche im internen Katalog
            </li>
            <li>
              <IconCheck size={12} /> Monatliches Kontingent, erneuert sich
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
            {STARTER_PLAN.euro} €<span>einmalig</span>
          </p>
          <p className="plan-credits">
            {formatCreditAmount(STARTER_PLAN.credits)} Credits enthalten
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

      <button className="plans-close" type="button" onClick={onClose}>
        Schließen
      </button>
    </div>
  );
}
