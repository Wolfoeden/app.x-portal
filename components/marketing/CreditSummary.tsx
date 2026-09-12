import { CREDIT_PLANS, CREDIT_PRICES, affordableCount } from "@/lib/ai/credit-policy";
import { BUSINESS_ONLY_NOTICE } from "@/lib/legal/policy";
import styles from "./marketing.module.css";

const number = new Intl.NumberFormat("de-DE");
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function CreditSummary() {
  return (
    <div className={styles.creditSummary}>
      <p>
        Eine {CREDIT_PRICES.project_brief.label} kostet{" "}
        <strong>{number.format(CREDIT_PRICES.project_brief.credits)} Credits</strong>.
        Eine separat gestartete {CREDIT_PRICES.research.label} kostet{" "}
        <strong>{number.format(CREDIT_PRICES.research.credits)} Credits</strong>.
        Beide Leistungen nutzen dasselbe Guthaben.
      </p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Monatliche Kontingente und Preise">
        <table>
          <caption>Monatliche Kontingente und Preise</caption>
          <thead>
            <tr><th scope="col">Zugang</th><th scope="col">Preis / Monat</th><th scope="col">Credits / Monat</th><th scope="col">Bis zu Projektanalysen*</th></tr>
          </thead>
          <tbody>
            {Object.values(CREDIT_PLANS).map((plan) => (
              <tr key={plan.id} data-plan={plan.id}>
                <th scope="row">{plan.label}</th>
                <td>{euro.format(plan.euro)}{plan.purchasable ? <small>zzgl. USt.</small> : null}</td>
                <td>{number.format(plan.monthlyCredits)}</td>
                <td>{number.format(affordableCount(plan.monthlyCredits, "project_brief"))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.subtle}>
        * Rechnerisch bei ausschließlicher Nutzung für Projektanalysen. Andere
        kostenpflichtige Funktionen verringern die verbleibende Anzahl. Ein
        Kontingent garantiert keine passenden Treffer. Ihr verfügbares Guthaben
        sehen Sie im Chat; Freelancer-Honorare sind hier nicht enthalten.
      </p>
      <p className={styles.subtle}>{BUSINESS_ONLY_NOTICE}</p>
    </div>
  );
}
