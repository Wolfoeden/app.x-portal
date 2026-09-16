import Link from "next/link";

import { CREDIT_PRICES } from "@/lib/ai/credit-policy";
import {
  PUBLIC_PRICING_PLANS,
  START_CREDITS,
  meteredNetCents,
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
        <strong>{number.format(START_CREDITS)} Start-Credits werden einmalig vergeben.</strong>{" "}
        Sie füllen sich nicht monatlich neu auf. Danach wählen Sie ein monatliches
        Kontingent oder Enterprise-Abrechnung nach tatsächlicher Nutzung.
      </p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Kontingente und Preise">
        <table>
          <caption>Kontingente und Preise</caption>
          <thead><tr><th scope="col">Tarif</th><th scope="col">Preis netto</th><th scope="col">Credits</th><th scope="col">Abrechnung</th></tr></thead>
          <tbody>
            <tr><th scope="row">Kostenloser Start</th><td>0 €</td><td>{number.format(START_CREDITS)} einmalig</td><td>Kein Abo</td></tr>
            {PUBLIC_PRICING_PLANS.map((plan) => (
              <tr key={plan.id} data-plan={plan.id}>
                <th scope="row">{plan.label}</th>
                {plan.billingModel === "fixed_monthly" ? <>
                  <td>{euro.format(plan.priceNetCents / 100)}<small>zzgl. USt.</small></td>
                  <td>{number.format(plan.monthlyCredits)} / Monat</td>
                  <td>Monatliches Kontingent</td>
                </> : <>
                  <td>{euro.format(plan.euroPerCreditCents / 100)} / Credit<small>0 € Grundgebühr</small></td>
                  <td>Nach Verbrauch</td>
                  <td>Monatliche Verbrauchsabrechnung</td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Eine {CREDIT_PRICES.project_brief.label} kostet <strong>{CREDIT_PRICES.project_brief.credits} Credits</strong>,
        eine {CREDIT_PRICES.research.label} <strong>{CREDIT_PRICES.research.credits} Credits</strong> und ein
        {" "}{CREDIT_PRICES.leadgen_outreach.label} <strong>{CREDIT_PRICES.leadgen_outreach.credits} Credits</strong>.
        Enterprise berechnet dafür {euro.format(meteredNetCents(CREDIT_PRICES.project_brief.credits) / 100)}, {euro.format(meteredNetCents(CREDIT_PRICES.research.credits) / 100)} beziehungsweise {euro.format(meteredNetCents(CREDIT_PRICES.leadgen_outreach.credits) / 100)} netto.
      </p>
      <p className={styles.subtle}>Alle Leistungen verwenden dasselbe Guthaben. Nicht verbrauchte Monatscredits werden nicht kumuliert. Freelancer-Honorare sind nicht enthalten.</p>
      <p><Link href="/preise">Alle Tarife und Rechenbeispiele ansehen</Link></p>
      <p className={styles.subtle}>{BUSINESS_ONLY_NOTICE}</p>
    </div>
  );
}
