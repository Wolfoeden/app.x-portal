import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { actionClass } from "@/components/ui/actions";
import { PUBLIC_PRICING_PLANS, TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/billing/plans";
import type { LandingStats } from "@/lib/marketing/landing-stats";
import type { CaseStudy } from "@/lib/marketing/case-studies";
import { MARKETING_PAGE } from "@/lib/seo";
import { breadcrumbStructuredData, faqStructuredData } from "@/lib/structured-data";
import { salesCallHref } from "@/lib/sales/sales-call-links";
import { Questions } from "./MarketingPage";
import { faqAnswerText, landingFaq } from "./landing-faq";
import { RecruitingLink } from "./RecruitingLink";
import styles from "./landing.module.css";

export function FreelancerLanding(_props: { stats?: LandingStats | null; contactPhotoUrl?: string | null; caseStudies?: readonly CaseStudy[] }) {
  const plans = PUBLIC_PRICING_PLANS.filter((plan) => plan.billingModel === "fixed_monthly");
  const entry = Math.min(...plans.map((plan) => plan.euro));
  const faq = landingFaq(false);
  return (
    <main id="main-content" className={styles.main} tabIndex={-1}>
      <JsonLd data={breadcrumbStructuredData(MARKETING_PAGE.find)} />
      <header className={`${styles.section} ${styles.hero}`}>
        <div className={`${styles.frame} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <h1><span className={styles.heroKicker}>Freelancer finden für Recruiter und IT-Personaldienstleister</span>{" "}Kundenanfrage rein.<br /><span>Prüfbare Auswahl raus.</span></h1>
            <p className={styles.lead}>Strukturieren Sie Anforderungen, gleichen Sie Freelancer ab und speichern Sie Ihre Auswahl. Für das nächste Mandat und für die nächste Entscheidung.</p>
            <div className={styles.actions}>
              <RecruitingLink href="/preise#tarife" event="trial_cta_clicked" className={actionClass("primary")}>14 Tage kostenlos testen</RecruitingLink>
              <RecruitingLink href="#ergebnisbeispiel" event="demo_viewed" className={actionClass("secondary")}>Ergebnisbeispiel ansehen</RecruitingLink>
            </div>
            <p className={styles.trialDisclosure}>Karte bei Stripe erforderlich · {TRIAL_CREDITS} Credits insgesamt für {TRIAL_DAYS} Tage.<br />Danach gewählter Monatstarif ab {entry} € netto, zzgl. USt., mit automatischer Verlängerung. Vor Trial-Ende kündigen, um die erste kostenpflichtige Verlängerung zu vermeiden.</p>
            <p className={styles.softwareNote}>Sie bezahlen die Software. Neue Kontaktanfragen und Beauftragungen sind provisionsfrei.</p>
          </div>
          <figure id="ergebnisbeispiel" className={styles.mandateBoard}>
            <figcaption><strong>Ergebnisbeispiel · frei erfunden</strong><span>Demonstriert die Darstellung. Keine reale Person, keine bestätigte Verfügbarkeit.</span></figcaption>
            <div className={styles.mandateBrief}><span>Kundenmandat</span><strong>React &amp; TypeScript · remote</strong><p>Start im November · Honorarrahmen offen</p></div>
            <div className={styles.mandateCandidate}><span className={styles.mockAvatar} aria-hidden="true">AB</span><div><strong>Beispielprofil A</strong><span>Frontend-Entwicklung</span></div><b>Teilpassung</b></div>
            <dl className={styles.evidenceMatrix}>
              <div><dt>React</dt><dd><strong>Profilbeleg</strong>Im Beispielprojekt genannt</dd></div>
              <div><dt>TypeScript</dt><dd><strong>Selbstauskunft</strong>Im Beispielprofil genannt</dd></div>
              <div><dt>Honorar</dt><dd><strong>Beispielangabe</strong>90 € / Stunde netto</dd></div>
              <div data-open=""><dt>Start November</dt><dd><strong>Offen</strong>Verfügbarkeit nicht bestätigt</dd></div>
            </dl>
            <p className={styles.mandateNext}><strong>Nächster Schritt</strong>Auswahl speichern, offene Kriterien klären und Kontakt bewusst anfragen.</p>
          </figure>
        </div>
      </header>
      <section className={styles.section} aria-labelledby="workflow-title"><div className={styles.frame}>
        <p className={styles.eyebrow}>Ein Arbeitsablauf für Ihre Mandate</p><h2 id="workflow-title">Von der Ausschreibung zur nachvollziehbaren Auswahl.</h2>
        <ol className={styles.workflow}>
          <li><span>1 · Anforderungen</span><h3>Projekttext einfügen</h3><p>Prüfen und ergänzen Sie fachliche Kriterien. Bedienanweisungen bleiben vom Profilabgleich getrennt.</p></li>
          <li><span>2 · Abgleich</span><h3>Belege und Lücken sehen</h3><p>Profilangaben, Honorare und offene Punkte bleiben erkennbar. Ein Profilfund bestätigt keine Verfügbarkeit.</p></li>
          <li><span>3 · Weiterarbeiten</span><h3>Auswahl sichern</h3><p>Speichern Sie mehrere Projekte und Profile, setzen Sie Mandate fort und nutzen Sie freigegebene Kontaktwege.</p></li>
        </ol>
        <p className={styles.sectionLead}>Kein verlässlicher Treffer? Kriterien bearbeiten oder eine zusätzliche Recherche ausdrücklich starten. Sie brauchen dafür kein Gespräch mit dem Betreiber.</p>
      </div></section>
      <section className={styles.section} aria-labelledby="preise-title"><div className={styles.frame}>
        <div className={styles.splitHead}><h2 id="preise-title">14 Tage am eigenen Mandat testen.</h2><p>Einmalig {TRIAL_CREDITS} Credits innerhalb des gewählten Tarifs. Kein zusätzliches Gast- oder Registrierungsbonusguthaben. Verbrauchte Trial-Credits werden nicht aufgefüllt und lösen keine vorzeitige Abbuchung aus.</p></div>
        <div className={styles.saasPlans}>{plans.map((plan) => <article key={plan.id} className={styles.priceCard}><p className={styles.priceName}>{plan.label}</p><p className={styles.priceValue}><strong>{plan.euro} €</strong><span>netto / Monat nach dem Trial</span></p><p>{plan.monthlyCredits.toLocaleString("de-DE")} Credits je bezahlter Monatsperiode</p><RecruitingLink href={`/chat?checkout=${plan.id}`} event="trial_cta_clicked" plan={plan.id} className={actionClass("primary")}>14 Tage kostenlos testen</RecruitingLink><p className={styles.trialDisclosure}>Karte erforderlich · anschließend automatische monatliche Verlängerung · monatlich zum Periodenende kündbar.</p></article>)}</div>
        <Link href="/preise" className={styles.textLink}>Tarife und Abrechnung im Detail →</Link>
      </div></section>
      <section className={styles.section}><div className={`${styles.frame} ${styles.faq}`}><div><p className={styles.eyebrow}>Vor dem Start</p><h2>Was Sie wissen sollten.</h2></div><Questions items={faq.map((item) => ({ question: item.question, answer: <p>{item.answer.map((part, index) => typeof part === "string" ? part : <Link key={index} href={part.href}>{part.label}</Link>)}</p> }))} /></div></section>
      <section className={`${styles.section} ${styles.closing}`}><div className={styles.frame}><h2>Das nächste Mandat wartet.</h2><div className={styles.actions}><RecruitingLink href="/preise#tarife" event="trial_cta_clicked" className={actionClass("primary")}>14 Tage kostenlos testen</RecruitingLink><Link href={salesCallHref("hero")} prefetch={false} className={styles.textLink}>Gespräch buchen</Link><Link href="/freelancer/apply" className={styles.textLink}>Als Freelancer bewerben</Link></div><p className={styles.trialDisclosure}>Ergebnisbeispiel ohne Karte ansehen. Für den eigentlichen Trial sind ein bestätigtes Konto und die Kartenhinterlegung bei Stripe erforderlich.</p></div></section>
      <JsonLd data={faqStructuredData(faq.map((item) => ({ question: item.question, answer: faqAnswerText(item) })))} />
    </main>
  );
}
