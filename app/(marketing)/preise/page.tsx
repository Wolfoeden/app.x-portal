import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { Questions } from "@/components/marketing/MarketingPage";
import { RecruitingLink } from "@/components/marketing/RecruitingLink";
import { actionClass } from "@/components/ui/actions";
import { countLabel, CREDIT_PRICES, roundedExampleCount } from "@/lib/ai/credit-policy";
import { CREDIT_PLANS, TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/billing/plans";
import { BUSINESS_ONLY_NOTICE } from "@/lib/legal/policy";
import { MARKETING_PAGE, pageMetadata } from "@/lib/seo";
import { breadcrumbStructuredData } from "@/lib/structured-data";
import { PricingContext } from "./PricingContext";
import styles from "./pricing.module.css";
export const metadata = pageMetadata(MARKETING_PAGE.pricing);
const questions = [
  { question: "Was passiert nach den 14 Tagen?", answer: <p>Nach dem tatsächlichen Stripe-Trial-Ende beginnt automatisch Ihr gewählter Monatstarif, sofern Sie nicht rechtzeitig kündigen. Das erste Abrechnungsdatum sehen Sie nach Aktivierung in Ihrem Konto. Stripe erstellt die Rechnung und versucht die Zahlung. Ein Zahlungsversuch garantiert keine erfolgreiche Abbuchung.</p> },
  { question: "Wie kündige ich den Trial?", answer: <p>Selbstständig im <Link href="/konto">Kontobereich</Link>, ohne Supportkontakt. Bei bestätigter Kündigung vor Trial-Ende erfolgt keine erste kostenpflichtige Verlängerung. Die verbleibenden Trial-Credits bleiben bis zum bestätigten Enddatum nutzbar. Nach einer bezahlten Periode kündigen Sie zum Ende der laufenden Monatsperiode.</p> },
  { question: "Was passiert bei aufgebrauchten Trial-Credits?", answer: <p>Das einmalige Trial-Kontingent wird nicht nachgefüllt. Verbrauchte Credits lösen keine vorzeitige Abbuchung aus. Ein erneuter Checkout, Kontowechsel oder Tarifwechsel startet keinen neuen Trial. Gespeicherte Projektinformationen bleiben lesbar.</p> },
  { question: "Was geschieht bei einem Zahlungsfehler?", answer: <p>Sie erhalten einen Hinweis und können Ihr Zahlungsmittel in der Abrechnung aktualisieren. Ohne bestätigte Zahlung entstehen keine neuen Monatscredits. Nach Ende Ihrer vorhandenen Berechtigung sind neue kostenpflichtige KI-Läufe gesperrt; Projekte, Rechnungen und Kontoverwaltung bleiben erreichbar.</p> },
  { question: "Was gilt für bestehende Guthaben?", answer: <p>Legitim zugesagtes Bestandsguthaben bleibt erhalten. Ein neues bestätigtes Konto erhält einmalig 9 Starter-Credits für drei Projektanalysen. Die {TRIAL_CREDITS} zusätzlichen Trial-Credits gibt es erst nach serverseitig verifizierter Kartenhinterlegung; ein neues Konto oder Tarifwechsel vergibt das Starter-Guthaben nicht erneut.</p> },
];
type Tier = {
  id: "starter" | "basic" | "pro" | "business";
  name: string;
  audience: string;
  price: string;
  unit: string;
  allotment: string;
  allotmentDetail: string;
  inherits: string | null;
  features: readonly string[];
  note: string;
};

/** Beispielmengen wie in der App: auf Fünferschritte abgerundet. */
function usage(credits: number) {
  return `≈ ${roundedExampleCount(credits, "project_brief").toLocaleString("de-DE")} Analysen oder ${countLabel(roundedExampleCount(credits, "research"), "research").replace("AI-Agent-", "")}`;
}

/**
 * Vier Stufen, eine Zeile je Angabe: Preis, Kontingent und Umfang stehen in
 * jeder Karte auf derselben Höhe. Die Listen nennen nur, was gegenüber der
 * Stufe davor dazukommt — gleiche Zeilen in allen Karten verstecken den
 * Unterschied.
 */
function tiers(): Tier[] {
  const { starter, basic, pro, business } = CREDIT_PLANS;
  const monthly = (plan: typeof basic | typeof pro | typeof business) => ({
    price: `${plan.euro} €`,
    unit: "netto / Monat, zzgl. USt.",
    allotment: `${plan.monthlyCredits.toLocaleString("de-DE")} Credits / Monat`,
    allotmentDetail: usage(plan.monthlyCredits),
    note: `Nach dem Trial ${plan.euro} € netto im Monat, monatlich kündbar.`,
  });
  return [
    {
      id: "starter",
      name: starter.label,
      audience: "Erst prüfen, ob passende Profile da sind.",
      price: "0 €",
      unit: "einmalig, ohne Abo",
      allotment: `${Math.floor(starter.grantCredits / CREDIT_PRICES.project_brief.credits)} Projektanalysen`,
      allotmentDetail: `${starter.grantCredits} Credits, keine Karte`,
      inherits: null,
      features: ["Projekt einfügen und analysieren", "Passende Profile mit Belegen", "Projekte und Merkliste speichern"],
      note: "Ohne Karte. Kein automatischer Tarifwechsel.",
    },
    {
      id: "basic",
      name: basic.label,
      audience: "Für einzelne Kundenmandate.",
      ...monthly(basic),
      inherits: starter.label,
      features: ["Profile provisionsfrei anfragen", "Lebenslauf, Kalender und LinkedIn freigegebener Profile", "AI-Agent-Recherche", "Team mit bis zu 10 Personen"],
    },
    {
      id: "pro",
      name: pro.label,
      audience: "Für Recruiter mit laufenden Mandaten.",
      ...monthly(pro),
      inherits: basic.label,
      features: [`${(pro.monthlyCredits / basic.monthlyCredits).toLocaleString("de-DE")}-faches Kontingent von ${basic.label}`],
    },
    {
      id: "business",
      name: business.label,
      audience: "Für Teams mit vielen parallelen Mandaten.",
      ...monthly(business),
      inherits: pro.label,
      features: [`${(business.monthlyCredits / basic.monthlyCredits).toLocaleString("de-DE")}-faches Kontingent von ${basic.label}`, "Masumi AI-Agent-Portfolio"],
    },
  ];
}

export default function PricingPage() {
  return <main id="main-content" className={styles.main} tabIndex={-1}>
    <JsonLd data={breadcrumbStructuredData(MARKETING_PAGE.pricing)} /><PricingContext />
    <header className={styles.hero}><p className={styles.eyebrow}>Preise</p><h1>Kostenlos prüfen.<br /><span>Zahlen, wenn es passt.</span></h1><p className={styles.lead}>Drei Projektanalysen ohne Karte. Für Kontakt und Recherche {TRIAL_DAYS} Tage kostenlos testen, danach monatlich kündbar. Neue Kontakte sind provisionsfrei.</p><div className={styles.heroActions}><a href="#tarife" className={actionClass("primary")}>Tarife vergleichen</a><RecruitingLink href="/fuer-unternehmen#produktablauf" event="demo_viewed" className={actionClass("secondary")}>Produktablauf ansehen</RecruitingLink></div></header>
    <section className={styles.planSection} id="tarife" aria-labelledby="tarife-title">
      <h2 id="tarife-title" className={styles.planTitle}>Tarife</h2>
      <p className={styles.trialLine}><strong>Alle Monatstarife: {TRIAL_DAYS} Tage kostenlos mit {TRIAL_CREDITS} Credits insgesamt.</strong> Karte bei Stripe erforderlich. Keine vorzeitige Abbuchung, vor Trial-Ende im Konto kündbar.</p>
      <div className={styles.cards}>{tiers().map((tier) => {
        const plan = CREDIT_PLANS[tier.id];
        const free = tier.id === "starter";
        return <article key={tier.id} className={`${styles.card} ${plan.recommended ? styles.recommended : ""}`}>
          <div className={styles.cardTopline}><p className={styles.planName}>{tier.name}</p>{plan.recommended ? <span className={styles.badge}>Empfohlen</span> : null}</div>
          <p className={styles.audience}>{tier.audience}</p>
          <div className={styles.priceBlock}><p className={styles.price}>{tier.price}</p><span>{tier.unit}</span></div>
          <p className={styles.allotment}><strong>{tier.allotment}</strong><span>{tier.allotmentDetail}</span></p>
          <div className={styles.features}>{tier.inherits ? <p>Alles aus {tier.inherits}, plus:</p> : null}<ul>{tier.features.map((feature) => <li key={feature}>{feature}</li>)}</ul></div>
          {free
            ? <RecruitingLink href="/chat" event="signup_started" plan="starter" className={actionClass("secondary", { block: true })}>Kostenlos starten</RecruitingLink>
            : <RecruitingLink href={`/anmelden?checkout=${tier.id}`} event="trial_cta_clicked" plan={tier.id} className={actionClass(plan.recommended ? "primary" : "secondary", { block: true })}>{TRIAL_DAYS} Tage kostenlos testen</RecruitingLink>}
          <p className={styles.cardNote}>{tier.note}</p>
        </article>;
      })}</div>
      <p className={styles.checkoutNote}>Der Trial beginnt nach bestätigter E-Mail und verifiziertem Stripe-Abschluss; Karte erforderlich. Neue Kontakte und Beauftragungen kosten keine Vermittlungsprovision und keine Erfolgsgebühr; Historische Verträge bleiben unverändert. {BUSINESS_ONLY_NOTICE}</p>
    </section>
    <section className={styles.actionSection} aria-labelledby="actions-title"><div className={styles.sectionIntro}><div><p className={styles.eyebrow}>Kontingent</p><h2 id="actions-title">Was verbraucht Credits?</h2></div><p>Den Verbrauch sehen Sie vor jeder Aktion. Fehlgeschlagene KI-Läufe kosten nichts.</p></div><div className={styles.actionGrid}>{Object.values(CREDIT_PRICES).map((price) => <article key={price.label}><p>{price.label}</p><strong>{price.credits} Credits</strong></article>)}</div></section>
    <section className={styles.faq}><div><p className={styles.eyebrow}>Abrechnung und Zugang</p><h2>Vor dem Start klar.</h2></div><Questions items={questions} /></section>
    <section className={styles.finalCta}><div><h2>Am nächsten Mandat ausprobieren.</h2><p>Drei Analysen kostenlos, danach {TRIAL_DAYS} Tage testen.</p></div><a href="#tarife" className={actionClass("primary")}>Tarif wählen</a></section>
    <nav aria-label="Weiterlesen"><Link href="/datenwege">Datenwege ansehen</Link></nav>
  </main>;
}
