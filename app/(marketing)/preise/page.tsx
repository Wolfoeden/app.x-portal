import Link from "next/link";

import { JsonLd } from "@/components/JsonLd";
import {
  CREDIT_PRICES,
  affordableCount,
  type CreditPriceId,
} from "@/lib/ai/credit-policy";
import {
  CREDIT_PLANS,
  PUBLIC_PRICING_PLANS,
  START_CREDITS,
  effectiveCreditPriceCents,
  meteredNetCents,
  type FixedMonthlyPlan,
} from "@/lib/billing/plans";
import { BUSINESS_ONLY_NOTICE } from "@/lib/legal/policy";
import { MARKETING_PAGE, MARKETING_PAGES, pageMetadata } from "@/lib/seo";
import { breadcrumbStructuredData } from "@/lib/structured-data";

import styles from "./pricing.module.css";

export const metadata = pageMetadata(MARKETING_PAGE.pricing);

const number = new Intl.NumberFormat("de-DE");
const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CARD_COPY = {
  basic: {
    audience: "Für Einzelpersonen und kleine Teams mit regelmäßigem Bedarf.",
    features: ["Projektanalysen", "AI-Agent-Recherchen", "Akquise-Anschreiben", "Transparentes Credit-System"],
  },
  pro: {
    audience: "Für Unternehmen, die XPORTAL regelmäßig für Projekte und AI-Agent-Recherchen einsetzen.",
    features: ["Alle XPORTAL-Kernleistungen", "Günstigerer Preis pro Credit", "Für regelmäßige Nutzung"],
  },
  business: {
    audience: "Für Teams mit hohem Analyse- und Recherchebedarf.",
    features: ["Alle XPORTAL-Kernleistungen", "Bester Credit-Preis der Monatspläne", "Für hohes Teamvolumen"],
  },
  enterprise_flex: {
    audience: "Nur bezahlen, was tatsächlich genutzt wird.",
    features: ["Keine Grundgebühr", "Keine monatlichen Credit-Pakete", "Abrechnung nur nach Nutzung", "Monatliche Verbrauchsabrechnung"],
  },
} as const;

function FixedCard({ plan }: { plan: FixedMonthlyPlan }) {
  const href = `/chat?checkout=${plan.id}`;
  const copy = CARD_COPY[plan.id as "basic" | "pro" | "business"];
  const researchExamples = Math.floor(affordableCount(plan.monthlyCredits, "research") / 5) * 5;
  const analysisExamples = researchExamples * (CREDIT_PRICES.research.credits / CREDIT_PRICES.project_brief.credits);
  return (
    <article className={`${styles.card} ${plan.recommended ? styles.recommended : ""}`}>
      <div className={styles.cardTopline}>
        <p className={styles.planName}>{plan.label}</p>
        {plan.recommended ? <span className={styles.badge}>Empfohlen</span> : null}
      </div>
      <p className={styles.audience}>{copy.audience}</p>
      <div className={styles.priceBlock}>
        <p className={styles.price}>{euro.format(plan.priceNetCents / 100).replace(",00", "")}</p>
        <span>netto pro Monat</span>
      </div>
      <p className={styles.creditVolume}><strong>{number.format(plan.monthlyCredits)}</strong> Credits / Monat</p>
      <p className={styles.unitPrice}>{effectiveCreditPriceCents(plan).toLocaleString("de-DE", { maximumFractionDigits: 2 })} Cent / Credit</p>
      <div className={styles.usageExample}>
        <span>Rundes Beispielvolumen</span>
        <strong>{number.format(analysisExamples)} Projektanalysen</strong>
        <span>oder {number.format(researchExamples)} AI-Agent-Recherchen</span>
      </div>
      <ul className={styles.features}>
        <li>{number.format(plan.monthlyCredits)} Credits pro Monat</li>
        {copy.features.map((feature) => <li key={feature}>{feature}</li>)}
      </ul>
      <Link className={styles.cardAction} href={href} prefetch={false}>
        {plan.label} buchen <span aria-hidden="true">↗</span>
      </Link>
    </article>
  );
}

function EnterpriseCard() {
  const plan = CREDIT_PLANS.enterprise_flex;
  return (
    <article className={`${styles.card} ${styles.enterpriseCard}`}>
      <div className={styles.cardTopline}><p className={styles.planName}>Enterprise</p></div>
      <p className={styles.audience}>{CARD_COPY.enterprise_flex.audience}</p>
      <div className={styles.priceBlock}>
        <p className={styles.usagePrice}>Nach Nutzung</p>
        <strong>{euro.format(plan.euroPerCreditCents / 100)} / Credit</strong>
        <span>0 € Grundgebühr</span>
      </div>
      <p className={styles.creditVolume}>Monatliche Abrechnung nach tatsächlichem Verbrauch.</p>
      <p className={styles.unitPrice}>{CREDIT_PRICES.research.credits} Credits AI-Agent-Recherche = {euro.format(meteredNetCents(CREDIT_PRICES.research.credits) / 100)}</p>
      <div className={styles.usageExample}>
        <span>Kein vorausbezahltes Kontingent</span>
        <strong>Verbrauch × 2 Cent</strong>
        <span>exakt in Cent berechnet</span>
      </div>
      <ul className={styles.features}>
        {CARD_COPY.enterprise_flex.features.map((feature) => <li key={feature}>{feature}</li>)}
        <li>{euro.format(plan.euroPerCreditCents / 100)} je verbrauchtem Credit</li>
      </ul>
      <a className={styles.cardAction} href="mailto:roman@dering.info?subject=XPORTAL%20Enterprise">Enterprise per E-Mail anfragen <span aria-hidden="true">↗</span></a>
    </article>
  );
}

const ACTION_IDS = Object.keys(CREDIT_PRICES) as CreditPriceId[];

export default function PricingPage() {
  return (
    <main id="main-content" className={styles.main} tabIndex={-1}>
      <JsonLd data={breadcrumbStructuredData(MARKETING_PAGE.pricing)} />
      <nav aria-label="Brotkrümelnavigation" className={styles.breadcrumb}>
        <ol><li><Link href="/chat" prefetch={false}>XPORTAL</Link></li><li><span aria-current="page">Preise &amp; Credits</span></li></ol>
      </nav>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Preise &amp; Credits</p>
          <h1>Ein Guthaben.<br /><span>Klare Kosten.</span></h1>
          <p className={styles.lead}>Starten Sie kostenlos mit {START_CREDITS} Credits. Danach wählen Sie ein monatliches Kontingent – oder zahlen im Enterprise-Tarif ausschließlich nach tatsächlicher Nutzung.</p>
          <div className={styles.heroActions}>
            <Link href="/chat" prefetch={false} className={styles.primaryAction}>Kostenlos starten <span aria-hidden="true">↗</span></Link>
            <p><strong>{START_CREDITS} Start-Credits kostenlos</strong><span>Einmalig. Keine automatische monatliche Auffüllung.</span></p>
          </div>
        </div>
        <aside className={styles.creditThesis} aria-label="Ein Credit-System für alle Leistungen">
          <p>Ein Guthaben</p>
          <strong>3</strong>
          <span>Leistungen, dieselbe Einheit</span>
          <ul>
            {ACTION_IDS.map((id) => <li key={id}><span>{CREDIT_PRICES[id].label}</span><strong>{CREDIT_PRICES[id].credits} C</strong></li>)}
          </ul>
        </aside>
      </header>

      <section className={styles.planSection} aria-label="Tarife">
        <div className={styles.cards}>
          {PUBLIC_PRICING_PLANS.filter((plan) => plan.billingModel === "fixed_monthly").map((plan) => <FixedCard key={plan.id} plan={plan} />)}
          <EnterpriseCard />
        </div>
        <p className={styles.checkoutNote}>Alle Preise netto, zuzüglich gesetzlicher Umsatzsteuer. Basic, Pro und Business sind Monatsabonnements und verlängern sich automatisch. Sie können das Abonnement über Stripe verwalten und zum Ende der laufenden Abrechnungsperiode kündigen.</p>
      </section>

      <section className={styles.actionSection} aria-labelledby="actions-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Einheitliche Aktionspreise</p>
          <h2 id="actions-title">Was kostet eine Aktion?</h2>
          <p>Alle XPORTAL-Leistungen verwenden dasselbe Credit-Guthaben.</p>
        </div>
        <div className={styles.actionGrid}>
          {ACTION_IDS.map((id) => {
            const item = CREDIT_PRICES[id];
            return <article key={id}><p>{item.label}</p><strong>{item.credits} Credits</strong><span>Enterprise: {euro.format(meteredNetCents(item.credits) / 100)}</span></article>;
          })}
        </div>
      </section>

      <section className={styles.explainer} aria-labelledby="credit-title">
        <div><p className={styles.eyebrow}>Credits verstehen</p><h2 id="credit-title">Transparent messen, planbar bezahlen.</h2></div>
        <div>
          <p>Credits sind die gemeinsame Nutzungseinheit für Projektanalysen, AI-Agent-Recherchen und Akquise-Anschreiben. Sie bezahlen also keine künstlich getrennten Funktionspakete.</p>
          <p>Bei Basic, Pro und Business wird das inkludierte Kontingent zu Beginn jeder Abrechnungsperiode neu gesetzt; Restguthaben wird nicht addiert. Enterprise Flex hat kein Prepaid-Kontingent: Abgerechnet werden nur protokollierte, abrechenbare Credits.</p>
          <p>{BUSINESS_ONLY_NOTICE}</p>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div><p className={styles.eyebrow}>Kostenlos testen</p><h2>{START_CREDITS} Credits. Einmalig. Ohne Abo.</h2><p>Erleben Sie XPORTAL zuerst am eigenen Projekt und wählen Sie danach den passenden Abrechnungsweg.</p></div>
        <Link href="/chat" prefetch={false} className={styles.primaryAction}>Kostenlos starten <span aria-hidden="true">↗</span></Link>
      </section>
      <nav className={styles.related} aria-label="Passend zum Thema">
        {MARKETING_PAGES.filter((page) => page.path !== MARKETING_PAGE.pricing.path).map((page) => (
          <Link key={page.path} href={page.path}>{page.label}<span aria-hidden="true">↗</span></Link>
        ))}
      </nav>
    </main>
  );
}
