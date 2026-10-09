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
import { LandingIntake } from "./LandingIntake";
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

export function FreelancerLanding({ contactPhotoUrl = null, caseStudies = publishedCaseStudies() }: { stats?: LandingStats | null; contactPhotoUrl?: string | null; caseStudies?: readonly CaseStudy[] }) {
  const plans = PUBLIC_PRICING_PLANS.filter((plan) => plan.billingModel === "fixed_monthly");
  const faq = landingFaq();
  return (
    <main id="main-content" className={styles.main} tabIndex={-1}>
      <JsonLd data={breadcrumbStructuredData(MARKETING_PAGE.find)} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "XPORTAL", applicationCategory: "BusinessApplication", operatingSystem: "Web", description: "Recruiting-Software für nachvollziehbare Freelancer-Auswahl und wiederkehrende Kundenmandate.", offers: plans.map(plan => ({ "@type": "Offer", price: plan.euro, priceCurrency: "EUR", description: `${plan.label}: netto pro Monat nach ${TRIAL_DAYS} Tagen Trial mit Karte, ${TRIAL_CREDITS} Trial-Credits insgesamt.` })) }} />
      <LandingIntake contactPhotoUrl={contactPhotoUrl} />
      <section className={`${styles.section} ${styles.inventoryStrip}`} aria-label="XPORTAL in Zahlen">
        <div className={`${styles.frame} ${styles.inventoryFrame}`}>
          <div className={styles.inventoryMetric}><strong>2</strong><span>Entwickler im<br />Familienunternehmen</span></div>
          <div className={`${styles.inventoryMetric} ${styles.inventoryPrimary}`}><span className={styles.onlineDot} aria-hidden="true" /><strong>210</strong><span>Profile online</span></div>
          <div className={styles.inventoryMetricGroup}>
            <div className={styles.inventoryMetric}><strong>51 %</strong><span>Erfolgsquote</span></div>
            <div className={styles.inventoryMetric}><strong>3 Wochen</strong><span>durchschnittliche<br />Besetzungszeit</span></div>
          </div>
        </div>
      </section>
      <section id="abgleich" className={styles.section} aria-labelledby="abgleich-title">
        <div className={`${styles.frame} ${styles.quote}`}>
          <div className={styles.quoteText}>
            <p className={styles.eyebrow}>Abgleich</p>
            <h2 id="abgleich-title">Jede Anforderung gegen echte Profilangaben geprüft.</h2>
            <RecruitingLink href="#produktablauf" event="demo_viewed" className={actionClass("secondary", { className: styles.prominentSecondary })}>Produktablauf ansehen</RecruitingLink>
          </div>
          <div className={styles.quoteMedia}>
            <Image src="/images/landing/project-match.webp" alt="Eine Projektbeschreibung wird mit einer Auswahl von Freelancer-Profilen verbunden." width={1536} height={1024} sizes="(max-width: 860px) 100vw, 560px" loading="lazy" />
          </div>
        </div>
      </section>
      <section id="produktablauf" className={styles.section} aria-labelledby="produktablauf-title"><div className={styles.frame}>
        <div className={`${styles.splitHead} ${styles.singleHead}`}>
          <div><p className={styles.eyebrow}>XPORTAL in Aktion</p><h2 id="produktablauf-title">Projekt einfügen. Profil prüfen. Kontakt anfragen.</h2></div>
        </div>
        <div className={styles.videoPanel}><ProcessVideo steps={processSteps} /></div>
      </div></section>
      <section id="kontakt" className={styles.section} aria-labelledby="kontakt-title">
        <div className={`${styles.frame} ${styles.quote}`}>
          <div className={styles.quoteText}>
            <h2 id="kontakt-title">Passendes Profil gefunden?<br />Direkt ins Gespräch.</h2>
            <RecruitingLink href="/preise#tarife" event="trial_cta_clicked" className={actionClass("primary")}>14 Tage kostenlos testen</RecruitingLink>
          </div>
          <div className={styles.quoteMedia}>
            <Image src="/images/landing/project-conversation.webp" alt="Auftraggeber und Freelancer besprechen gemeinsam eine Projektbeschreibung am Tisch." width={1536} height={1024} sizes="(max-width: 860px) 100vw, 560px" loading="lazy" />
          </div>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="preise-title"><div className={styles.frame}>
        <div className={`${styles.splitHead} ${styles.singleHead}`}><h2 id="preise-title">14 Tage am eigenen Mandat testen.</h2></div>
        <div className={styles.saasPlans}>{plans.map((plan) => <article key={plan.id} className={styles.priceCard}><p className={styles.priceName}>{plan.label}</p><p className={styles.priceValue}><strong>{plan.euro} €</strong><span>netto / Monat nach dem Trial</span></p><p>{plan.monthlyCredits.toLocaleString("de-DE")} Credits je bezahlter Monatsperiode</p><RecruitingLink href={`/anmelden?checkout=${plan.id}`} event="trial_cta_clicked" plan={plan.id} className={actionClass("primary")}>14 Tage kostenlos testen</RecruitingLink><p className={styles.trialDisclosure}>Karte erforderlich · anschließend automatische monatliche Verlängerung · monatlich zum Periodenende kündbar.</p></article>)}</div>
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
