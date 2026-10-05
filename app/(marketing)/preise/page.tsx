import Link from "next/link";

import { JsonLd } from "@/components/JsonLd";
import { Questions } from "@/components/marketing/MarketingPage";
import { actionClass } from "@/components/ui/actions";
import {
  CREDIT_PRICES,
  roundedExampleCount,
  type CreditPriceId,
} from "@/lib/ai/credit-policy";
import {
  CREDIT_PLANS,
  GUEST_TRIAL_CREDITS,
  PUBLIC_PRICING_PLANS,
  START_CREDITS,
  effectiveCreditPriceCents,
  meteredNetCents,
  type FixedMonthlyPlan,
} from "@/lib/billing/plans";
import { CREDIT_RULES } from "@/lib/billing/credit-rules";
import { ENTERPRISE_CONTACT } from "@/lib/billing/payment-links";
import {
  PLACEMENT_TERMS,
  PLACEMENT_TERMS_PATH,
  formatWholeEuro,
  PLACEMENT_EXAMPLE,
  placementExampleFeeCents,
  placementRequestsEnabled,
  placementTermsSummary,
} from "@/lib/placement/config";
import { BUSINESS_ONLY_NOTICE } from "@/lib/legal/policy";
import { salesCallHref } from "@/lib/sales/sales-call-links";
import { MARKETING_PAGE, MARKETING_PAGES, pageMetadata } from "@/lib/seo";
import { breadcrumbStructuredData } from "@/lib/structured-data";

import { PricingContext } from "./PricingContext";
import styles from "./pricing.module.css";

export const metadata = pageMetadata(MARKETING_PAGE.pricing);

const number = new Intl.NumberFormat("de-DE");
const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Jede Karte beginnt mit der Aufgabe, die der Tarif trägt, dann Umfang,
 * Preis und Credits (UX-Review Oktober 2026: das Abo über den Arbeitsnutzen
 * verkaufen, nicht über die Einheit).
 */
/** Der Knopf jeder Tarifkarte: volle Breite, unten in der Karte. */
const CARD_ACTION = actionClass("primary", { block: true, className: styles.cardAction });

const CARD_COPY = {
  basic: {
    audience: "Für Recruiter, die einzelne Kundenanfragen im Monat selbst prüfen.",
    features: ["Projektanalysen", "AI-Agent-Recherchen", "Akquise-Anschreiben", "Transparentes Credit-System"],
  },
  pro: {
    audience: "Für Recruiter mit laufenden Besetzungen für mehrere Kunden.",
    features: ["Alle XPORTAL-Kernleistungen", "Günstigerer Preis pro Credit", "Für regelmäßige Nutzung"],
  },
  business: {
    audience: "Für Teams, die viele Ausschreibungen parallel prüfen und recherchieren.",
    features: ["Alle XPORTAL-Kernleistungen", "Bester Credit-Preis der Monatspläne", "Für hohes Teamvolumen"],
  },
  enterprise_flex: {
    audience: "Nur bezahlen, was tatsächlich genutzt wird.",
    features: ["Keine Grundgebühr", "Keine monatlichen Credit-Pakete", "Abrechnung nur nach Nutzung", "Monatliche Verbrauchsabrechnung"],
  },
} as const;

function FixedCard({ plan }: { plan: FixedMonthlyPlan }) {
  const href = `/api/billing/checkout?plan=${plan.id}`;
  const copy = CARD_COPY[plan.id as "basic" | "pro" | "business"];
  const researchExamples = roundedExampleCount(plan.monthlyCredits, "research");
  const analysisExamples = researchExamples * (CREDIT_PRICES.research.credits / CREDIT_PRICES.project_brief.credits);
  return (
    <article className={`${styles.card} ${plan.recommended ? styles.recommended : ""}`}>
      <div className={styles.cardTopline}>
        <p className={styles.planName}>{plan.label}</p>
        {plan.recommended ? <span className={styles.badge}>Empfohlen</span> : null}
      </div>
      <p className={styles.audience}>{copy.audience}</p>
      <div className={styles.usageExample}>
        <span>Reicht im Monat für etwa</span>
        <strong>{number.format(analysisExamples)} Projektanalysen</strong>
        <span>oder {number.format(researchExamples)} AI-Agent-Recherchen</span>
      </div>
      <div className={styles.priceBlock}>
        <p className={styles.price}>{euro.format(plan.priceNetCents / 100).replace(",00", "")}</p>
        <span>netto pro Monat</span>
      </div>
      <p className={styles.creditVolume}><strong>{number.format(plan.monthlyCredits)}</strong> Credits / Monat</p>
      <p className={styles.unitPrice}>{effectiveCreditPriceCents(plan).toLocaleString("de-DE", { maximumFractionDigits: 2 })} Cent / Credit</p>
      <ul className={styles.features}>
        <li>{number.format(plan.monthlyCredits)} Credits pro Monat</li>
        {copy.features.map((feature) => <li key={feature}>{feature}</li>)}
      </ul>
      <a className={CARD_ACTION} href={href}>
        {plan.label} buchen <span aria-hidden="true">↗</span>
      </a>
    </article>
  );
}

function EnterpriseCard() {
  const plan = CREDIT_PLANS.enterprise_flex;
  return (
    <article className={`${styles.card} ${styles.enterpriseCard}`}>
      <div className={styles.cardTopline}><p className={styles.planName}>Enterprise</p></div>
      <p className={styles.audience}>{CARD_COPY.enterprise_flex.audience}</p>
      <div className={styles.usageExample}>
        <span>Kein vorausbezahltes Kontingent</span>
        <strong>Verbrauch × 2 Cent</strong>
        <span>exakt in Cent berechnet</span>
      </div>
      <div className={styles.priceBlock}>
        <p className={styles.usagePrice}>Nach Nutzung</p>
        <strong>{euro.format(plan.euroPerCreditCents / 100)} / Credit</strong>
        <span>0 € Grundgebühr</span>
      </div>
      <p className={styles.creditVolume}>Monatliche Abrechnung nach tatsächlichem Verbrauch.</p>
      <p className={styles.unitPrice}>{CREDIT_PRICES.research.credits} Credits AI-Agent-Recherche = {euro.format(meteredNetCents(CREDIT_PRICES.research.credits) / 100)}</p>
      <ul className={styles.features}>
        {CARD_COPY.enterprise_flex.features.map((feature) => <li key={feature}>{feature}</li>)}
        <li>{euro.format(plan.euroPerCreditCents / 100)} je verbrauchtem Credit</li>
      </ul>
      <Link className={CARD_ACTION} href={salesCallHref("pricing")} prefetch={false}>Gespräch buchen <span aria-hidden="true">↗</span></Link>
      <a className={styles.cardMail} href={`mailto:${ENTERPRISE_CONTACT.email}?subject=XPORTAL%20Enterprise`}>Enterprise per E-Mail anfragen</a>
    </article>
  );
}

const ACTION_IDS = Object.keys(CREDIT_PRICES) as CreditPriceId[];

/**
 * Was vor dem Klick auf „buchen" beruhigt. Jede Zeile ist durch AGB,
 * Datenschutzhinweise oder den Stripe-Checkout gedeckt — hier nur kurz und an
 * der Stelle, an der die Frage aufkommt.
 */
const TRUST_FACTS = [
  { title: "Sichere Zahlung über Stripe", body: "Bezahlt wird im Stripe-Checkout; Kartendaten erreichen XPORTAL nicht." },
  { title: "Monatlich kündbar", body: "Zum Ende der laufenden Periode, bequem im Kundenportal." },
  { title: "Rechnung nach § 14 UStG", body: "Alle Rechnungen jederzeit im Stripe-Kundenportal." },
  // Nicht „Hosting und Datenbank in der EU“: Der Hosting-Dienstleister sitzt
  // in den USA, nur die Datenbank liegt in Irland (Datenschutz, Abschnitt 9;
  // Audit P2).
  { title: "Datenbank in der EU", body: "Projektdaten liegen in Irland und werden nicht zum KI-Training verwendet.", link: { href: "/datenwege", label: "Welche Schritte wo laufen" } },
] as const;

const PRICING_QUESTIONS = [
  {
    question: "Kann ich jederzeit kündigen?",
    answer: <p>Ja. Basic, Pro und Business laufen monatlich und lassen sich zum Ende der laufenden Abrechnungsperiode kündigen – im Stripe-Kundenportal oder in Textform, etwa über das <Link href="/contact">Kontaktformular</Link>. Das bezahlte Kontingent bleibt bis zum Periodenende nutzbar.</p>,
  },
  {
    question: "Was passiert, wenn meine Credits aufgebraucht sind?",
    answer: <p>Sie können weiter schreiben; XPORTAL speichert Ihre Angaben und gleicht sie regelbasiert ab. KI-Analysen und AI-Agent-Recherchen sind wieder möglich, sobald das nächste Kontingent beginnt oder Sie in einen größeren Tarif wechseln. Nicht verbrauchte Monatscredits werden nicht in den Folgemonat übertragen.</p>,
  },
  {
    question: "Kostet ein fehlgeschlagener Lauf Credits?",
    answer: <p>Nein. Fällt die KI-Analyse aus, übernimmt die Basisanalyse Ihre Angaben, und es wird nichts belastet. Scheitert eine AI-Agent-Recherche technisch, ebenfalls nicht. Ein abgeschlossener Recherche-Lauf kostet {CREDIT_PRICES.research.credits} Credits – auch dann, wenn die öffentlichen Quellen keine passenden Profile hergeben.</p>,
  },
  {
    question: "Was passiert mit dem Gastguthaben, wenn ich ein Konto anlege?",
    answer: <p>{CREDIT_RULES.guest} {CREDIT_RULES.account} {CREDIT_RULES.noRefill}</p>,
  },
  {
    question: "Brauche ich ein Abo, um einen Freelancer anzufragen?",
    answer: <p>Nein. {CREDIT_RULES.placementWithoutPlan} Bei einer Beauftragung über XPORTAL fällt das <Link href={PLACEMENT_TERMS_PATH}>Vermittlungshonorar</Link> an, unabhängig vom Tarif.</p>,
  },
  {
    question: "Sind Freelancer-Honorare im Preis enthalten?",
    answer: <p>Nein. Der Tarif deckt die Nutzung von XPORTAL ab. Honorar, Verfügbarkeit und Vertrag vereinbaren Sie direkt mit dem Freelancer; kommt es über XPORTAL zur Beauftragung, gilt zusätzlich das Vermittlungshonorar.</p>,
  },
  {
    question: "Wer kann einen Tarif buchen?",
    answer: <p>{BUSINESS_ONLY_NOTICE} Alle Preise sind Nettopreise zuzüglich gesetzlicher Umsatzsteuer.</p>,
  },
] as const;

/**
 * Das Vermittlungsmodell als eigener Abschnitt direkt unter den Tarifen:
 * Anfrage und Vorstellung sind kostenlos, bezahlt wird bei Beauftragung. Die
 * Tarife bleiben für Analysen und KI-Recherchen. Dass dafür kein Abo nötig
 * ist, sagt schon der Kopf der Seite.
 */
function PlacementSection() {
  return (
    <section className={styles.placement} aria-labelledby="placement-title">
      <div>
        <p className={styles.eyebrow}>Vermittlung</p>
        <h2 id="placement-title">Kostenlos anfragen.<br />Zahlen bei Beauftragung.</h2>
        <ul>
          {placementTermsSummary().map((sentence) => <li key={sentence}>{sentence}</li>)}
        </ul>
        <Link href={PLACEMENT_TERMS_PATH} className={styles.placementLink}>Vermittlungsbedingungen lesen <span aria-hidden="true">↗</span></Link>
      </div>
      <aside aria-label="Rechenbeispiel">
        <p>Rechenbeispiel</p>
        <dl>
          <div><dt>Tagessatz des Freelancers</dt><dd>{formatWholeEuro(PLACEMENT_EXAMPLE.dayRateCents)}</dd></div>
          <div><dt>Projekttage in den ersten {PLACEMENT_TERMS.feeMonths} Monaten</dt><dd>{PLACEMENT_EXAMPLE.projectDays}</dd></div>
          <div><dt>Honorar, {PLACEMENT_TERMS.feePercent} %, einmalig</dt><dd>{formatWholeEuro(placementExampleFeeCents())} netto</dd></div>
        </dl>
        <span>Die Rechnung kommt erst, wenn Sie den Freelancer beauftragt haben, nicht schon für Termin oder Erstgespräch. {PLACEMENT_TERMS.paymentDays} Tage Zahlungsziel. Kommt keine Beauftragung zustande, kostet die Vermittlung nichts.</span>
      </aside>
    </section>
  );
}

const ENTRY_EURO = Math.min(...PUBLIC_PRICING_PLANS.flatMap((plan) => (plan.billingModel === "fixed_monthly" ? [plan.euro] : [])));

/**
 * Drei Kostenarten, klar getrennt (Audit F02) — als Auswahl nach dem, was
 * jemand vorhat: eine einzelne Kundenanfrage, ausprobieren oder laufend
 * selbst prüfen. Steht im Kopf, damit vor den Tarifen klar ist, dass eine
 * Anfrage kein Abo braucht.
 */
function PathChooser() {
  return (
    <aside className={styles.chooser} aria-labelledby="chooser-title">
      <p id="chooser-title">Welcher Weg passt?</p>
      <ul>
        <li>
          <Link href={salesCallHref("pricing")} prefetch={false}>
            <span>Einzelne Kundenanfrage</span>
            <strong>Gespräch · 0 € bis zur Beauftragung</strong>
            <small>Danach einmalig {PLACEMENT_TERMS.feePercent} % des Honorars der ersten {PLACEMENT_TERMS.feeMonths} Monate, per Rechnung. Kein Abo nötig.</small>
          </Link>
        </li>
        <li>
          <Link href="/chat" prefetch={false}>
            <span>Erst ausprobieren</span>
            <strong>{GUEST_TRIAL_CREDITS} / {START_CREDITS} Credits frei</strong>
            <small>Ohne Konto {GUEST_TRIAL_CREDITS}, mit kostenlosem Konto {START_CREDITS} insgesamt, einmalig. Analyse {CREDIT_PRICES.project_brief.credits}, Recherche {CREDIT_PRICES.research.credits} Credits; fällt die KI aus, nichts.</small>
          </Link>
        </li>
        <li>
          <a href="#tarife">
            <span>Ausschreibungen laufend selbst prüfen</span>
            <strong>Monatstarif ab {ENTRY_EURO} € netto</strong>
            <small>Monatlich kündbar. Ein Vermittlungshonorar kommt bei einer Beauftragung gegebenenfalls hinzu.</small>
          </a>
        </li>
      </ul>
    </aside>
  );
}

export default function PricingPage() {
  const placement = placementRequestsEnabled();
  return (
    <main id="main-content" className={styles.main} tabIndex={-1}>
      <JsonLd data={breadcrumbStructuredData(MARKETING_PAGE.pricing)} />
      <nav aria-label="Brotkrümelnavigation" className={styles.breadcrumb}>
        <ol><li><Link href="/chat" prefetch={false}>XPORTAL</Link></li><li><span aria-current="page">Preise &amp; Credits</span></li></ol>
      </nav>
      <PricingContext />

      {placement ? (
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Preise</p>
            <h1>Vorstellung kostenlos.<br /><span>Selbst suchen im Monatstarif.</span></h1>
            <p className={styles.lead}>
              Für eine einzelne Kundenanfrage stellen wir passende Freelancer kostenlos vor; bezahlt wird nur bei
              Beauftragung. Prüfen Sie Ausschreibungen regelmäßig selbst, deckt ein Monatstarif Ihre Analysen und
              Recherchen ab.
            </p>
            <div className={styles.heroActions}>
              <a href="#tarife" className={actionClass("primary")}>Tarife vergleichen</a>
              <Link href={salesCallHref("pricing")} prefetch={false} className={actionClass("secondary")}>Gespräch buchen</Link>
            </div>
          </div>
          <PathChooser />
        </header>
      ) : (
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Preise &amp; Credits</p>
            <h1>Ein Guthaben.<br /><span>Klare Kosten.</span></h1>
            <p className={styles.lead}>
              {`Starten Sie kostenlos: ${GUEST_TRIAL_CREDITS} Credits ohne Konto, ${START_CREDITS} insgesamt mit kostenlosem Konto. Danach wählen Sie ein monatliches Kontingent – oder zahlen im Enterprise-Tarif ausschließlich nach tatsächlicher Nutzung.`}
            </p>
            <div className={styles.heroActions}>
              <Link href="/chat" prefetch={false} className={actionClass("primary")}>Kostenlos starten <span aria-hidden="true">↗</span></Link>
              <p><strong>{START_CREDITS} Credits mit kostenlosem Konto</strong><span>Einmalig, insgesamt; das Gastguthaben ({GUEST_TRIAL_CREDITS}) wird ersetzt, nicht addiert.</span></p>
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
      )}

      <section className={styles.planSection} id="tarife" aria-label="Tarife">
        <div className={styles.cards}>
          {PUBLIC_PRICING_PLANS.filter((plan) => plan.billingModel === "fixed_monthly").map((plan) => <FixedCard key={plan.id} plan={plan} />)}
          <EnterpriseCard />
        </div>
        <ul className={styles.trust} aria-label="Sicherheit und Konditionen">
          {TRUST_FACTS.map((fact) => (
            <li key={fact.title}>
              <strong>{fact.title}</strong>
              <span>{fact.body}{"link" in fact ? <> <Link href={fact.link.href}>{fact.link.label}</Link></> : null}</span>
            </li>
          ))}
        </ul>
        <p className={styles.checkoutNote}>Alle Preise netto, zuzüglich gesetzlicher Umsatzsteuer. Basic, Pro und Business sind Monatsabonnements und verlängern sich automatisch. Sie können das Abonnement über Stripe verwalten und zum Ende der laufenden Abrechnungsperiode kündigen.</p>
      </section>

      {placement ? <PlacementSection /> : null}

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

      <section className={styles.faq} aria-labelledby="pricing-faq-title">
        <div><p className={styles.eyebrow}>Vor dem Kauf</p><h2 id="pricing-faq-title">Häufige Fragen zur Abrechnung</h2></div>
        <Questions items={PRICING_QUESTIONS} />
      </section>

      <section className={styles.finalCta}>
        <div><p className={styles.eyebrow}>Kostenlos testen</p><h2>{START_CREDITS} Credits mit Konto. Einmalig. Ohne Abo.</h2><p>Erleben Sie XPORTAL zuerst am eigenen Projekt und wählen Sie danach den passenden Abrechnungsweg.</p></div>
        <Link href="/chat" prefetch={false} className={actionClass("primary")}>Kostenlos starten <span aria-hidden="true">↗</span></Link>
      </section>
      <nav className={styles.related} aria-label="Passend zum Thema">
        {MARKETING_PAGES.filter((page) => page.path !== MARKETING_PAGE.pricing.path).map((page) => (
          <Link key={page.path} href={page.path}>{page.label}<span aria-hidden="true">↗</span></Link>
        ))}
      </nav>
    </main>
  );
}
