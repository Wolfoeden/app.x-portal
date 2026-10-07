import Link from "next/link";

import { CREDIT_PRICES } from "@/lib/ai/credit-policy";
import { CREDIT_RULES } from "@/lib/billing/credit-rules";
import {
  PUBLIC_PRICING_PLANS,
  TRIAL_CREDITS,
} from "@/lib/billing/plans";
import { BUSINESS_ONLY_NOTICE } from "@/lib/legal/policy";

import styles from "./marketing.module.css";

const number = new Intl.NumberFormat("de-DE");
const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export function CreditSummary() {
  return (
    <div className={styles.creditSummary}>
      <p>
        <strong>{CREDIT_RULES.account}</strong>{" "}
        {CREDIT_RULES.guest} {CREDIT_RULES.noRefill} Danach wählen Sie ein monatliches
        Kontingent im gewählten Software-Tarif.
      </p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Kontingente und Preise">
        <table>
          <caption>Kontingente und Preise</caption>
          <thead><tr><th scope="col">Tarif</th><th scope="col">Preis netto</th><th scope="col">Credits</th><th scope="col">Abrechnung</th></tr></thead>
          <tbody>
            <tr><th scope="row">14-Tage-Trial mit Karte</th><td>0 € im Trial</td><td>{number.format(TRIAL_CREDITS)} einmalig, insgesamt</td><td>Danach gewählter Monatstarif automatisch</td></tr>
            {PUBLIC_PRICING_PLANS.filter(plan => plan.billingModel === "fixed_monthly").map((plan) => (
              <tr key={plan.id} data-plan={plan.id}>
                <th scope="row">{plan.label}</th>
                  <td>{euro.format(plan.priceNetCents / 100)}<small>zzgl. USt.</small></td>
                  <td>{number.format(plan.monthlyCredits)} / Monat</td>
                  <td>Monatliches Kontingent</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Eine {CREDIT_PRICES.project_brief.label} kostet <strong>{CREDIT_PRICES.project_brief.credits} Credits</strong>,
        eine {CREDIT_PRICES.research.label} <strong>{CREDIT_PRICES.research.credits} Credits</strong> und ein
        {" "}{CREDIT_PRICES.leadgen_outreach.label} <strong>{CREDIT_PRICES.leadgen_outreach.credits} Credits</strong>.
      </p>
      <p className={styles.subtle}>Alle Leistungen verwenden dasselbe Guthaben. Nicht verbrauchte Monatscredits werden nicht kumuliert. Freelancer-Honorare sind nicht enthalten.</p>
      <p><Link href="/preise">Alle Tarife und Rechenbeispiele ansehen</Link></p>
      <p className={styles.subtle}>{BUSINESS_ONLY_NOTICE}</p>
    </div>
  );
}
