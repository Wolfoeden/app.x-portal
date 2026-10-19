import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { EXAMPLE_BRIEFS, exampleBriefPath } from "@/components/chat/example-briefs";
import { actionClass } from "@/components/ui/actions";
import { MatchCard } from "@/components/ui/MatchCard";
import { CREDIT_PRICES } from "@/lib/ai/credit-policy";
import { CREDIT_PLANS, PUBLIC_PRICING_PLANS, TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/billing/plans";
import type { LandingStats } from "@/lib/marketing/landing-stats";
import { publishedCaseStudies, type CaseStudy } from "@/lib/marketing/case-studies";
import { SALES_CONTACT } from "@/lib/sales/sales-contact-model";
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

/** Die vier Zusagen unter dem Kopf; jede steht auch auf /preise oder /datenwege. */
function FactIcon({ kind }: { kind: "free" | "analyses" | "evidence" | "data" }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "free" ? <><circle cx="14" cy="14" r="11" /><path d="m9 14.5 3.3 3.3L19 11" /></> : null}
      {kind === "analyses" ? <><rect x="5" y="4" width="18" height="21" rx="3" /><path d="M9.5 10h9M9.5 15h9M9.5 20h5" /></> : null}
      {kind === "evidence" ? <><path d="M5 8h18M5 14h12M5 20h8" /><path d="m18 19 2.5 2.5L25 17" /></> : null}
      {kind === "data" ? <><rect x="6" y="12" width="16" height="12" rx="2.5" /><path d="M10 12V9a4 4 0 0 1 8 0v3" /></> : null}
    </svg>
  );
}

/**
 * Die Beispieltreffer unter dem Eingabefeld: echte, freigegebene Profile,
 * deren Inhaber der Verwendung als Beispiel zugestimmt haben. Ab zwei Karten
 * wechseln sie sich ab (LandingIntake). „belegt“ steht nur bei Angaben, die
 * im Profil nachgewiesen sind.
 */
const LANDING_EXAMPLES = [
  {
    profileId: SALES_CONTACT.profileId,
    name: "Roman D.",
    label: "KI & Agenten",
    avatar: { src: SALES_CONTACT.photo.small, initials: "RD" },
    role: "Senior Blockchain & AI Automation Specialist · Remote",
    rows: [
      { label: "Blockchain", detail: "Muss · belegt" },
      { label: "KI-Agenten", detail: "Muss · belegt" },
      { label: "Automation", detail: "Kern · belegt" },
      { label: "Projektlaufzeit", detail: "im Erstgespräch klären", open: true },
    ],
    availability: "Verfügbar ab November",
  },
] as const;

const PLAN_AUDIENCE = { basic: "für einzelne Mandate", pro: "für laufende Mandate", business: "für Teams" } as const;

export function FreelancerLanding({ caseStudies = publishedCaseStudies() }: { stats?: LandingStats | null; caseStudies?: readonly CaseStudy[] }) {
  const plans = PUBLIC_PRICING_PLANS.filter((plan) => plan.billingModel === "fixed_monthly");
  const freeAnalyses = Math.floor(CREDIT_PLANS.starter.grantCredits / CREDIT_PRICES.project_brief.credits);
  const faq = landingFaq();
  return (
    <main id="main-content" className={styles.main} tabIndex={-1}>
      <JsonLd data={breadcrumbStructuredData(MARKETING_PAGE.find)} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "XPORTAL", applicationCategory: "BusinessApplication", operatingSystem: "Web", description: "Recruiting-Software für nachvollziehbare Freelancer-Auswahl und wiederkehrende Kundenmandate.", offers: plans.map(plan => ({ "@type": "Offer", price: plan.euro, priceCurrency: "EUR", description: `${plan.label}: netto pro Monat nach ${TRIAL_DAYS} Tagen Trial mit Karte, ${TRIAL_CREDITS} Trial-Credits insgesamt.` })) }} />
      <LandingIntake
        note={`${freeAnalyses} Projektanalysen kostenlos · ohne Kreditkarte · provisionsfrei`}
        roleChips={EXAMPLE_BRIEFS.map((example) => (
          <Link key={example.key} href={exampleBriefPath(example.key)} prefetch={false}>{example.label}</Link>
        ))}
        examples={LANDING_EXAMPLES.map((example) => ({
          profileId: example.profileId,
          name: example.name,
          // Dieselbe Kartenform wie die Ergebnisse im Talent Index.
          card: (
            <MatchCard
              className={styles.expertCard}
              label={example.label}
              verified
              avatar={example.avatar}
              name={example.name}
              role={example.role}
              rows={[...example.rows]}
              footer={<>
                <span className={styles.cardAvailability}>{example.availability}</span>
                <span className={styles.cardAction}>Experte kontaktieren</span>
              </>}
            />
          ),
        }))}
      />

      <section className={styles.facts} aria-label="Auf einen Blick">
        <div className={`${styles.wrap} ${styles.factsRow}`}>
          <div><FactIcon kind="free" /><p><strong>Provisionsfrei</strong><span>Keine Vermittlungsgebühr, kein Erfolgshonorar.</span></p></div>
          <div><FactIcon kind="analyses" /><p><strong>{freeAnalyses} Analysen kostenlos</strong><span>Ohne Kreditkarte, ohne Abo.</span></p></div>
          <div><FactIcon kind="evidence" /><p><strong>Belege je Anforderung</strong><span>Muss, Kern und optional – nachvollziehbar.</span></p></div>
          <div><FactIcon kind="data" /><p><strong>Ihre Daten bleiben Ihre</strong><span>Nicht zum Trainieren von KI-Modellen genutzt.</span></p></div>
        </div>
      </section>

      {/* 14.10.2026: Überschrift und die drei Schrittkarten sind weg (zu viel
          Text); das Video zeigt den Ablauf selbst. `#produktablauf` bleibt als
          Sprungziel für alte Links. */}
      <section id="produktablauf" className={styles.section} aria-label="Produktablauf im Video">
        <div className={styles.wrap}>
          <div id="video" className={styles.videoPanel}><ProcessVideo steps={processSteps} /></div>
        </div>
      </section>

      <section id="abgleich" className={`${styles.section} ${styles.tinted}`} aria-labelledby="abgleich-title">
        <div className={`${styles.wrap} ${styles.split}`}>
          <Image className={styles.splitImage} src="/images/landing/project-match.webp" alt="Eine Projektbeschreibung wird mit einer Auswahl von Freelancer-Profilen verbunden." width={1536} height={1024} sizes="(max-width: 960px) 100vw, 760px" loading="lazy" />
          <div className={styles.splitText}>
            <p className={styles.eyebrow}>Abgleich</p>
            <h2 id="abgleich-title">Jede Anforderung gegen echte Profilangaben geprüft.</h2>
            <ul className={styles.checks}>
              <li>Muss-Kriterien entscheiden, ob ein Profil erscheint.</li>
              <li>Belege aus Profil, Projekten und Lebenslauf statt Selbstauskunft.</li>
              <li>Was offen ist, steht als Frage fürs Erstgespräch da.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="tarife" className={styles.section} aria-labelledby="preise-title">
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <h2 id="preise-title">Kostenlos prüfen. <span>Zahlen, wenn es passt.</span></h2>
            <Link href="/preise" className={styles.textLink}>Alle Tarife im Detail →</Link>
          </div>
          <div className={styles.planCards}>
            <article className={styles.planCard}>
              <p className={styles.planName}>{CREDIT_PLANS.starter.label}</p>
              <p className={styles.planPrice}>0 €</p>
              <p>{freeAnalyses} Projektanalysen, ohne Karte</p>
              <Link href="/chat" prefetch={false} className={actionClass("secondary", { block: true })}>Kostenlos starten</Link>
            </article>
            {plans.map((plan) => (
              <article key={plan.id} className={plan.recommended ? `${styles.planCard} ${styles.planRecommended}` : styles.planCard}>
                <p className={styles.planName}>{plan.label}{plan.recommended ? <span>Empfohlen</span> : null}</p>
                <p className={styles.planPrice}>{plan.euro} € <small>netto / Monat</small></p>
                <p>{plan.monthlyCredits.toLocaleString("de-DE")} Credits / Monat {PLAN_AUDIENCE[plan.id as keyof typeof PLAN_AUDIENCE] ?? ""}</p>
                <RecruitingLink href={`/anmelden?checkout=${plan.id}`} event="trial_cta_clicked" plan={plan.id as "basic" | "pro" | "business"} className={actionClass(plan.recommended ? "primary" : "secondary", { block: true })}>{TRIAL_DAYS} Tage kostenlos testen</RecruitingLink>
              </article>
            ))}
          </div>
          <p className={styles.trialDisclosure}>Produktansicht und Ablaufvideo sind ohne Konto und Karte zugänglich. Für den eigentlichen Trial sind ein bestätigtes Konto und die Kartenhinterlegung bei Stripe erforderlich.</p>
        </div>
      </section>

      <section id="fragen" className={`${styles.section} ${styles.tinted}`} aria-labelledby="fragen-title">
        <div className={`${styles.wrap} ${styles.faq}`}>
          <div>
            <p className={styles.eyebrow}>Vor dem Start</p>
            <h2 id="fragen-title">Was Sie wissen sollten.</h2>
            <nav aria-label="Weiterlesen" className={styles.related}>
              {MARKETING_PAGES.filter(page => page.path !== MARKETING_PAGE.find.path).map(page => <Link key={page.path} href={page.path}>{page.label}</Link>)}
              <Link href="/datenwege">Datenwege ansehen</Link>
              <Link href="/bewerber-portal/apply">Bewerber-Portal</Link>
            </nav>
          </div>
          <Questions items={faq.map((item) => ({ question: item.question, answer: <p>{item.answer.map((part, index) => typeof part === "string" ? part : <Link key={index} href={part.href}>{part.label}</Link>)}</p> }))} />
        </div>
      </section>

      <CaseStudies cases={publishedCaseStudies(caseStudies)} />

      <section className={styles.closing} aria-labelledby="abschluss-title">
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.splitText}>
            <h2 id="abschluss-title">Das nächste Mandat wartet.</h2>
            <p>Fügen Sie die nächste Ausschreibung ein und sehen Sie, wer wirklich passt.</p>
            <div className={styles.actions}>
              <Link href="/chat" prefetch={false} className={actionClass("primary")}>Kostenlos starten</Link>
              <Link href={salesCallHref("closing")} prefetch={false} className={styles.closingSecondary}>Gespräch vereinbaren</Link>
            </div>
          </div>
          <Image className={styles.splitImage} src="/images/landing/project-conversation.webp" alt="Auftraggeber und Freelancer besprechen gemeinsam eine Projektbeschreibung am Tisch." width={1536} height={1024} sizes="(max-width: 960px) 100vw, 760px" loading="lazy" />
        </div>
      </section>
      <JsonLd data={faqStructuredData(faq.map((item) => ({ question: item.question, answer: faqAnswerText(item) })))} />
    </main>
  );
}
