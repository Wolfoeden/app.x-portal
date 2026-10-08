import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { actionClass } from "@/components/ui/actions";
import { PUBLIC_PRICING_PLANS, TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/billing/plans";
import type { LandingStats } from "@/lib/marketing/landing-stats";
import { publishedCaseStudies, type CaseStudy } from "@/lib/marketing/case-studies";
import { MARKETING_PAGE, MARKETING_PAGES } from "@/lib/seo";
import { CaseStudies } from "./CaseStudies";
import { breadcrumbStructuredData, faqStructuredData } from "@/lib/structured-data";
import { salesCallHref } from "@/lib/sales/sales-call-links";
import { Questions } from "./MarketingPage";
import { ProcessVideo } from "./ProcessVideo";
import { faqAnswerText, landingFaq } from "./landing-faq";
import { RecruitingLink } from "./RecruitingLink";
import styles from "./landing.module.css";

function StepIcon({ kind }: { kind: "brief" | "profiles" | "contact" }) {
  return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "brief" ? <><rect x="17" y="9" width="32" height="44" rx="5" /><path d="M25 21h16M25 29h16M25 37h8" /><path d="m35 46 5 5 13-14" strokeWidth="3" /></> : null}
    {kind === "profiles" ? <><rect x="7" y="17" width="23" height="35" rx="4" /><rect x="34" y="9" width="23" height="43" rx="4" /><circle cx="18.5" cy="28" r="4" /><path d="M12 43c0-9 13-9 13 0" /><circle cx="45.5" cy="23" r="4" /><path d="M39 37c0-9 13-9 13 0m-13 9 4 4 8-9" /></> : null}
    {kind === "contact" ? <><path d="M10 11h32a5 5 0 0 1 5 5v17a5 5 0 0 1-5 5H24L12 48V38h-2a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5Z" /><path d="M47 25h7a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5v8L43 51H32m-17-29h22m-22 8h15" /></> : null}
  </svg>;
}

const processSteps = [
  { title: "Projekttext kopieren", text: "Nehmen Sie die Beschreibung aus Ihrer bestehenden Ausschreibung.", icon: <StepIcon kind="brief" />, startsAt: 0 },
  { title: "Bei XPORTAL einfügen", text: "XPORTAL strukturiert die Anforderungen und gleicht vorhandene Profile ab.", icon: <StepIcon kind="profiles" />, startsAt: 3.5 },
  { title: "Freelancer anfragen", text: "Profilbelege und offene Punkte prüfen, Auswahl speichern und den Kontakt bewusst anfragen.", icon: <StepIcon kind="contact" />, startsAt: 8.7 },
] as const;

export function FreelancerLanding({ caseStudies = publishedCaseStudies() }: { stats?: LandingStats | null; contactPhotoUrl?: string | null; caseStudies?: readonly CaseStudy[] }) {
  const plans = PUBLIC_PRICING_PLANS.filter((plan) => plan.billingModel === "fixed_monthly");
  const faq = landingFaq();
  return (
    <main id="main-content" className={styles.main} tabIndex={-1}>
      <JsonLd data={breadcrumbStructuredData(MARKETING_PAGE.find)} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "XPORTAL", applicationCategory: "BusinessApplication", operatingSystem: "Web", description: "Recruiting-Software für nachvollziehbare Freelancer-Auswahl und wiederkehrende Kundenmandate.", offers: plans.map(plan => ({ "@type": "Offer", price: plan.euro, priceCurrency: "EUR", description: `${plan.label}: netto pro Monat nach ${TRIAL_DAYS} Tagen Trial mit Karte, ${TRIAL_CREDITS} Trial-Credits insgesamt.` })) }} />
      <header className={`${styles.section} ${styles.hero}`}>
        <div className={`${styles.frame} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <h1>Kundenanfrage rein.<br /><span>Prüfbare Auswahl raus.</span></h1>
            <p className={styles.lead}>Strukturieren Sie Anforderungen, gleichen Sie Freelancer ab und speichern Sie Ihre Auswahl. Für das nächste Mandat und für die nächste Entscheidung.</p>
            <div className={styles.actions}>
              <RecruitingLink href="/preise#tarife" event="trial_cta_clicked" className={actionClass("primary")}>14 Tage kostenlos testen</RecruitingLink>
              <RecruitingLink href="#produktablauf" event="demo_viewed" className={actionClass("secondary")}>Produktablauf ansehen</RecruitingLink>
            </div>
            <p className={styles.softwareNote}>Sie bezahlen die Software. Neue Kontaktanfragen und Beauftragungen sind provisionsfrei.</p>
          </div>
          <div className={styles.heroVisual} aria-label="Projektbeschreibung aus einer Plattform einfügen und passendes Profil anzeigen">
            <div className={styles.glow} aria-hidden="true" />
            <div className={styles.intakeStage}>
              <ul className={styles.sourceLogos} aria-label="Mögliche Quellen einer Projektbeschreibung">
                <li><Image src="/images/landing/source-freelancermap.png" alt="freelancermap" width={44} height={42} /></li>
                <li><Image src="/images/landing/source-linkedin.png" alt="LinkedIn" width={42} height={42} /></li>
                <li><Image src="/images/landing/source-arbeitsagentur.png" alt="Bundesagentur für Arbeit" width={42} height={42} /></li>
                <li><Image src="/images/landing/source-upwork.png" alt="Upwork" width={42} height={42} /></li>
              </ul>
              <div className={styles.requestBubble}><span>XPORTAL</span><strong>Projektbeschreibung</strong></div>
            </div>
            <div className={`${styles.mockCard} ${styles.profileReveal}`}>
              <div className={styles.mockBand} aria-hidden="true" />
              <div className={styles.mockHead}>
                <Image className={`${styles.mockAvatar} ${styles.mockAvatarImage}`} src="/images/landing/amelie-d.png" alt="Porträt von Amelie D." width={52} height={52} priority />
                <div><strong>Amelie D.</strong><span>KI-Entwicklerin · Agenten, RAG, TypeScript · remote</span></div>
              </div>
              <p className={styles.mockLabel}>Profilbeleg</p>
              <ul className={styles.mockEvidence}>
                <li><span className={styles.ok} aria-hidden="true">✓</span>AI Agents<em>in Projekten belegt</em></li>
                <li><span className={styles.ok} aria-hidden="true">✓</span>TypeScript<em>im Profil genannt</em></li>
              </ul>
              <p className={styles.mockLabel}>Offener Punkt</p>
              <ul className={styles.mockEvidence}>
                <li><span className={styles.open} aria-hidden="true">?</span>Start November<em>wird angefragt</em></li>
              </ul>
            </div>
          </div>
        </div>
      </header>
      <section className={`${styles.section} ${styles.inventoryStrip}`} aria-label="Profile online"><div className={`${styles.frame} ${styles.inventoryFrame}`}><span className={styles.onlineDot} aria-hidden="true" /><strong>210</strong><span>Profile online</span></div></section>
      <section id="produktablauf" className={styles.section} aria-labelledby="produktablauf-title"><div className={styles.frame}>
        <div className={styles.splitHead}>
          <div><p className={styles.eyebrow}>XPORTAL in Aktion</p><h2 id="produktablauf-title">Projekt einfügen. Profil prüfen. Kontakt anfragen.</h2></div>
          <p>Das Kurzvideo zeigt den bestehenden Ablauf direkt im Produkt: Ausschreibung übernehmen, Anforderungen abgleichen und mit nachvollziehbaren Profilangaben weiterarbeiten.</p>
        </div>
        <div className={styles.videoPanel}><ProcessVideo steps={processSteps} /></div>
      </div></section>
      <section className={styles.section} aria-labelledby="preise-title"><div className={styles.frame}>
        <div className={styles.splitHead}><h2 id="preise-title">14 Tage am eigenen Mandat testen.</h2><p>Einmalig {TRIAL_CREDITS} Credits innerhalb des gewählten Tarifs. Kein zusätzliches Gast- oder Registrierungsbonusguthaben. Verbrauchte Trial-Credits werden nicht aufgefüllt und lösen keine vorzeitige Abbuchung aus.</p></div>
        <div className={styles.saasPlans}>{plans.map((plan) => <article key={plan.id} className={styles.priceCard}><p className={styles.priceName}>{plan.label}</p><p className={styles.priceValue}><strong>{plan.euro} €</strong><span>netto / Monat nach dem Trial</span></p><p>{plan.monthlyCredits.toLocaleString("de-DE")} Credits je bezahlter Monatsperiode</p><RecruitingLink href={`/chat?checkout=${plan.id}`} event="trial_cta_clicked" plan={plan.id} className={actionClass("primary")}>14 Tage kostenlos testen</RecruitingLink><p className={styles.trialDisclosure}>Karte erforderlich · anschließend automatische monatliche Verlängerung · monatlich zum Periodenende kündbar.</p></article>)}</div>
        <Link href="/preise" className={styles.textLink}>Tarife und Abrechnung im Detail →</Link>
      </div></section>
      <section id="fragen" className={styles.section}><div className={`${styles.frame} ${styles.faq}`}><div><p className={styles.eyebrow}>Vor dem Start</p><h2>Was Sie wissen sollten.</h2></div><Questions items={faq.map((item) => ({ question: item.question, answer: <p>{item.answer.map((part, index) => typeof part === "string" ? part : <Link key={index} href={part.href}>{part.label}</Link>)}</p> }))} /></div></section>
      <section className={`${styles.section} ${styles.closing}`}><div className={styles.frame}><h2>Das nächste Mandat wartet.</h2><div className={styles.actions}><RecruitingLink href="/preise#tarife" event="trial_cta_clicked" className={actionClass("primary")}>14 Tage kostenlos testen</RecruitingLink><Link href={salesCallHref("hero")} prefetch={false} className={styles.textLink}>Gespräch buchen</Link><Link href="/freelancer/apply" className={styles.textLink}>Als Freelancer bewerben</Link></div><p className={styles.trialDisclosure}>Produktansicht und Ablaufvideo sind ohne Konto und Karte zugänglich. Für den eigentlichen Trial sind ein bestätigtes Konto und die Kartenhinterlegung bei Stripe erforderlich.</p></div></section>
      <CaseStudies cases={publishedCaseStudies(caseStudies)} />
      <section className={styles.section}><div className={styles.frame}><Link href="/datenwege" className={styles.textLink}>Datenwege ansehen</Link><nav aria-label="Weiterlesen" className={styles.actions}>{MARKETING_PAGES.filter(page => page.path !== MARKETING_PAGE.find.path).map(page => <Link key={page.path} href={page.path} className={styles.textLink}>{page.label}</Link>)}</nav></div></section>
      <JsonLd data={faqStructuredData(faq.map((item) => ({ question: item.question, answer: faqAnswerText(item) })))} />
    </main>
  );
}
