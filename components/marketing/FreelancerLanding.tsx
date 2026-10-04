import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { EXAMPLE_BRIEFS, exampleBriefPath, type ExampleBriefKey } from "@/components/chat/example-briefs";
import { ProjectLink, Questions, SalesCallLink } from "./MarketingPage";
import { ProcessVideo } from "./ProcessVideo";
import { MARKETING_PAGE } from "@/lib/seo";
import { breadcrumbStructuredData } from "@/lib/structured-data";
import { BRIEF_ANALYSIS_CREDITS, countLabel, roundedExampleCount } from "@/lib/ai/credit-policy";
import { CREDIT_RULES } from "@/lib/billing/credit-rules";
import { GUEST_TRIAL_CREDITS, PUBLIC_PRICING_PLANS, START_CREDITS, type FixedMonthlyPlan } from "@/lib/billing/plans";
import {
  formatWholeEuro,
  PLACEMENT_EXAMPLE,
  PLACEMENT_TERMS,
  PLACEMENT_TERMS_PATH,
  placementExampleFeeCents,
  placementRequestsEnabled,
} from "@/lib/placement/config";
import styles from "./landing.module.css";

function StepIcon({ kind }: { kind: "brief" | "profiles" | "conversation" }) {
  return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "brief" ? <><rect x="17" y="9" width="32" height="44" rx="5" /><path d="M25 21h16M25 29h16M25 37h8" /><path d="m35 46 5 5 13-14" strokeWidth="3" /></> : null}
    {kind === "profiles" ? <><rect x="7" y="17" width="23" height="35" rx="4" /><rect x="34" y="9" width="23" height="43" rx="4" /><circle cx="18.5" cy="28" r="4" /><path d="M12 43c0-9 13-9 13 0" /><circle cx="45.5" cy="23" r="4" /><path d="M39 37c0-9 13-9 13 0m-13 9 4 4 8-9" /></> : null}
    {kind === "conversation" ? <><path d="M10 11h32a5 5 0 0 1 5 5v17a5 5 0 0 1-5 5H24L12 48V38h-2a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5Z" /><path d="M47 25h7a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5v8L43 51H32m-17-29h22m-22 8h15" /></> : null}
  </svg>;
}

/**
 * Die Schritte sind die Kapitel des Ablauf-Videos; `startsAt` ist die Sekunde,
 * ab der das Video den Schritt zeigt (public/videos/ablauf.webm, 13,5 s).
 */
function processSteps(placement: boolean) {
  return [
    { title: "Projekttext kopieren", text: "Nehmen Sie die Beschreibung aus Ihrer bestehenden Ausschreibung.", icon: <StepIcon kind="brief" />, startsAt: 0 },
    { title: "Bei XPORTAL einfügen", text: "XPORTAL erkennt Anforderungen und schlägt passende Profile vor.", icon: <StepIcon kind="profiles" />, startsAt: 3.5 },
    // Der tatsächliche Weg im Vermittlungsmodell: anfragen, XPORTAL prüft und
    // stellt vor, erst danach der Termin. Eine Buchung ohne Anfrage gibt es
    // dort nicht, also verspricht die Seite auch keine.
    placement
      ? { title: "Freelancer anfragen", text: "Auch ohne Konto. XPORTAL prüft die Verfügbarkeit und stellt Sie per E-Mail vor; danach vereinbaren Sie das Erstgespräch.", icon: <StepIcon kind="conversation" />, startsAt: 8.7 }
      : { title: "Erstgespräch buchen", text: "Passendes Profil prüfen und bei vorhandenem Terminlink einen freien Slot wählen.", icon: <StepIcon kind="conversation" />, startsAt: 8.7 },
  ];
}

/** Wofür die Rolle steht, in einem Satz — ohne Zusage über den Bestand. */
const EXAMPLE_TEASERS: Readonly<Record<ExampleBriefKey, string>> = {
  "ai-agenten": "Agenten auf Basis von Sprachmodellen, angebunden an Ihre Systeme und Daten.",
  "react-typescript": "Weboberflächen und Anwendungen mit React und TypeScript.",
  "requirements-engineer": "Anforderungen mit den Fachbereichen aufnehmen und für die Umsetzung klären.",
};

const MONTHLY_PLANS: readonly FixedMonthlyPlan[] = PUBLIC_PRICING_PLANS.flatMap((plan) =>
  plan.billingModel === "fixed_monthly" ? [plan] : [],
);
const ENTRY_EURO = Math.min(...MONTHLY_PLANS.map((plan) => plan.euro));

/**
 * Der Preis gehört auf die Startseite. Wer hier entscheidet, ob sich der
 * Versuch lohnt, fragt zuerst, was es danach kostet — und fand bisher nur eine
 * FAQ-Zeile. Die Zahlen kommen aus demselben Katalog wie die Preisseite; die
 * vollständige Liste bleibt dort.
 */
function PricingTeaser({ placement }: { placement: boolean }) {
  return (
    <section className={styles.pricing} aria-labelledby="preise-title">
      <div className={styles.explanation}>
        <p className={styles.eyebrow}>Preise</p>
        <h2 id="preise-title">Kostenlos testen.<br />Bezahlen, wenn es sich lohnt.</h2>
        <p>
          {placement
            ? `Suche, Anfrage und Vorstellung sind kostenlos; bezahlt wird erst, wenn Sie einen Freelancer beauftragen. Für KI-Analysen und Recherchen gibt es ein Startguthaben: ${GUEST_TRIAL_CREDITS} Credits ohne Konto, ${START_CREDITS} insgesamt mit kostenlosem Konto. Danach gibt es Monatstarife – monatlich kündbar.`
            : `Die Analyse Ihres Projekts ist ohne Anmeldung möglich. Mit einem kostenlosen Konto erhalten Sie einmalig ${START_CREDITS} Start-Credits. Wer regelmäßig sucht, wählt einen Monatstarif – monatlich kündbar.`}
        </p>
        <Link className={styles.textLink} href={MARKETING_PAGE.pricing.path}>Alle Tarife vergleichen <span aria-hidden="true">↗</span></Link>
      </div>
      <ul className={styles.planList}>
        {placement ? (
          <li className={styles.planPlacement}>
            <div>
              <strong>Vermittlung</strong>
              <span>Suche, Anfrage und Vorstellung kostenlos · einmalig {PLACEMENT_TERMS.feePercent} % des Honorars der ersten {PLACEMENT_TERMS.feeMonths} Monate, nur bei Beauftragung · <Link href={PLACEMENT_TERMS_PATH}>Bedingungen</Link></span>
            </div>
            <p><strong>{PLACEMENT_TERMS.feePercent} %</strong><span>bei Beauftragung</span></p>
          </li>
        ) : null}
        <li>
          <div><strong>Kostenloser Start</strong><span>{START_CREDITS} Credits einmalig · reicht für {countLabel(roundedExampleCount(START_CREDITS, "research"), "research")}</span></div>
          <p><strong>0 €</strong></p>
        </li>
        {MONTHLY_PLANS.map((plan) => (
          <li key={plan.id} className={plan.recommended ? styles.planRecommended : undefined}>
            <div>
              <strong>{plan.label}{plan.recommended ? <em>Empfohlen</em> : null}</strong>
              <span>{plan.monthlyCredits.toLocaleString("de-DE")} Credits / Monat · {"rund " + countLabel(roundedExampleCount(plan.monthlyCredits, "research"), "research")}</span>
            </div>
            <p><strong>{plan.euro} €</strong><span>netto / Monat</span></p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FreelancerLanding() {
  // Wird beim Build eingesetzt, wie überall beim Vermittlungsmodell.
  const placement = placementRequestsEnabled();
  return (
    <main id="main-content" className={styles.main} tabIndex={-1}>
      <JsonLd data={breadcrumbStructuredData(MARKETING_PAGE.find)} />
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Für Recruiter mit fertiger Projektanzeige</p>
          <h1>Freelancer finden.<br /><span>{placement ? "Kostenlos anfragen." : "Termin buchen."}</span></h1>
          <p className={styles.lead}>
            {placement
              ? "Projektbeschreibung bei XPORTAL einfügen, passende Profile prüfen und den Freelancer anfragen. XPORTAL stellt Sie vor; bezahlt wird nur, wenn Sie beauftragen."
              : "Projektbeschreibung bei XPORTAL einfügen, passende Profile prüfen und – bei vorhandenem Terminlink – direkt ein Erstgespräch buchen."}
          </p>
          <div className={styles.actions}><ProjectLink>Projekt jetzt einfügen</ProjectLink><SalesCallLink entry="hero" /><a className={styles.textLink} href="#ablauf">So funktioniert’s <span aria-hidden="true">↓</span></a></div>
          <ul className={styles.startNotes}>
            <li><span aria-hidden="true">✓</span> Analyse kostenlos und ohne Anmeldung</li>
            {placement ? (
              <>
                <li><span aria-hidden="true">✓</span> Anfrage ohne Konto, Vorstellung kostenlos</li>
                <li><span aria-hidden="true">✓</span> {PLACEMENT_TERMS.feePercent} % Honorar nur bei Beauftragung, <Link href={PLACEMENT_TERMS_PATH}>Bedingungen</Link></li>
              </>
            ) : (
              <>
                <li><span aria-hidden="true">✓</span> Termin buchen mit kostenlosem Konto</li>
                <li><span aria-hidden="true">✓</span> Monatstarife ab {ENTRY_EURO} € netto, <Link href={MARKETING_PAGE.pricing.path}>monatlich kündbar</Link></li>
              </>
            )}
          </ul>
        </div>
        <figure className={styles.heroFigure}>
          <div className={styles.figureLabel}><span>Projekttext einfügen</span><span aria-hidden="true">→</span><span>Match erhalten</span></div>
          <Image src="/images/landing/project-match.webp" alt="Eine Projektbeschreibung wird mit einer Auswahl von Freelancer-Profilen verbunden." width={1536} height={1024} sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1260px) 48vw, 570px" loading="eager" fetchPriority="high" />
          <figcaption>Aus Ihrer Ausschreibung wird eine konkrete Freelancer-Empfehlung.</figcaption>
        </figure>
      </header>

      <section className={styles.process} id="ablauf" aria-labelledby="ablauf-title">
        <div className={styles.sectionHead}><p className={styles.eyebrow}>Von der Ausschreibung zum Erstgespräch</p><h2 id="ablauf-title">{placement ? "Einfügen. Anfragen." : "Einfügen. Buchen."}</h2></div>
        <ProcessVideo steps={processSteps(placement)} />
      </section>

      <section className={styles.evidence} id="begruendung" aria-labelledby="begruendung-title">
        <div className={styles.explanation}><p className={styles.eyebrow}>Mehr als eine Ergebnisliste</p><h2 id="begruendung-title">Sehen, warum<br />es passen könnte.</h2><p>XPORTAL stellt Ihre Anforderungen den Profilangaben gegenüber. Passende Skills und fehlende Informationen werden sichtbar.</p><Link className={styles.textLink} href={MARKETING_PAGE.matching.path}>Mehr zum KI-Matching <span aria-hidden="true">↗</span></Link></div>
        <figure className={styles.example}>
          <figcaption>So lesen Sie ein Ergebnis <span>Illustratives Beispiel · kein reales Profil</span></figcaption>
          <div className={styles.brief}><span>Ihr Projekt</span><p>„KI-Automatisierung, remote.<br />Start im November.“</p></div>
          <div className={styles.connector} aria-hidden="true">↓</div>
          <div className={styles.profile}><div className={styles.profileHead}><span className={styles.avatar} aria-hidden="true">K</span><div><strong>KI-Automatisierung</strong><span>Beispielprofil</span></div></div><dl><div><dt>Automatisierung</dt><dd className={styles.match}><span aria-hidden="true">✓</span> Im Profil genannt</dd></div><div><dt>Remote</dt><dd className={styles.match}><span aria-hidden="true">✓</span> Arbeitsmodus passt</dd></div><div><dt>Start im November</dt><dd className={styles.open}><span aria-hidden="true">?</span> Noch zu klären</dd></div></dl></div>
        </figure>
      </section>

      {/* Früher vier Etiketten, die wie Knöpfe aussahen und nirgendwohin
          führten. Jetzt öffnet jede Rolle den Chat mit dem Anfang einer
          Anfrage — nur Rollen, die der Profilbestand trägt; alles andere über
          den eigenen Text. */}
      <section className={styles.fields} aria-labelledby="felder-title">
        <div><p className={styles.eyebrow}>Direkt ausprobieren</p><h2 id="felder-title">Wen suchen Sie?</h2><p className={styles.fieldsLead}>Ein Klick öffnet den Chat mit dem Anfang Ihrer Anfrage, ohne Anmeldung. Aufgabe, Start und Budget ergänzen, abschicken, passende Profile sehen.</p></div>
        <ul className={styles.themeList}>
          {EXAMPLE_BRIEFS.map((example) => (
            <li key={example.key}>
              <Link className={styles.themeLink} href={exampleBriefPath(example.key)} prefetch={false}>
                <strong>{example.label}</strong>
                <span>{EXAMPLE_TEASERS[example.key]}</span>
                <em>Anfrage beginnen <span aria-hidden="true">→</span></em>
              </Link>
            </li>
          ))}
          <li>
            <Link className={styles.themeLink} href="/chat" prefetch={false}>
              <strong>Eigene Ausschreibung</strong>
              <span>Softwareentwicklung, SAP oder ein anderes IT-Projekt: Text einfügen.</span>
              <em>Projekt einfügen <span aria-hidden="true">→</span></em>
            </Link>
          </li>
        </ul>
        <Link className={styles.textLink} href={MARKETING_PAGE.it.path}>IT-Projekt konkretisieren <span aria-hidden="true">↗</span></Link>
      </section>

      <section className={styles.conversation} aria-labelledby="auswahl-title"><Image src="/images/landing/project-conversation.webp" alt="Auftraggeber und Freelancer besprechen gemeinsam eine Projektbeschreibung am Tisch." width={1536} height={1024} sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1260px) 44vw, 520px" loading="lazy" /><div className={styles.explanation}><p className={styles.eyebrow}>Vom Match ins Gespräch</p>{placement ? (
        <><h2 id="auswahl-title">Passendes Profil gefunden?<br />Anfragen, wir stellen vor.</h2><p>Mit einem Klick fragen Sie den Freelancer an, auch ohne Konto. XPORTAL prüft die Verfügbarkeit und stellt Sie beide per Mail vor; mit Terminlink wählen Sie danach selbst einen freien Slot. Den Stand sehen Sie unter „Gespräche“. Erfahrung, Honorar und Verfügbarkeit klären Sie im Gespräch. Kommt es zur Beauftragung, berechnen wir einmalig {PLACEMENT_TERMS.feePercent} % des Honorars der ersten {PLACEMENT_TERMS.feeMonths} Monate.</p></>
      ) : (
        <><h2 id="auswahl-title">Passendes Profil gefunden?<br />Termin direkt buchen.</h2><p>Nach der Anmeldung öffnen Sie bei Profilen mit Terminlink die externe Terminseite und wählen selbst einen freien Slot. Erfahrung, Honorar und Verfügbarkeit klären Sie anschließend gemeinsam.</p></>
      )}<ProjectLink>Projekt jetzt einfügen</ProjectLink></div></section>

      <PricingTeaser placement={placement} />

      <section className={styles.faq} id="fragen" aria-labelledby="fragen-title"><div><p className={styles.eyebrow}>Kurz beantwortet</p><h2 id="fragen-title">Noch Fragen?</h2><Link className={styles.textLink} href={MARKETING_PAGE.how.path}>Alle Details zum Ablauf <span aria-hidden="true">↗</span></Link></div><Questions items={[
        { question: "Kann ich ohne Anmeldung starten?", answer: <p>Ja. Beschreiben Sie Ihr Projekt als Gast. Für das dauerhafte Speichern und weitere Schritte mit einem ausgewählten Profil können Sie anschließend ein Konto erstellen.</p> },
        { question: "Was kostet die Suche?", answer: <p>{CREDIT_RULES.guest} {CREDIT_RULES.account} Eine Projektanalyse verbraucht {BRIEF_ANALYSIS_CREDITS} Credits; fällt die KI aus, nichts. Kontingente und weitere Aktionen finden Sie auf der <Link href={MARKETING_PAGE.pricing.path}>Preisseite</Link>. Freelancer-Honorare sind separat.</p> },
        { question: "Ist ein passender Freelancer garantiert?", answer: <p>Nein. Ergebnisse hängen von Ihren Anforderungen und den vorhandenen Profilen ab. Profilangaben sind nicht automatisch unabhängig geprüft. Verfügbarkeit, Honorar und offene Fragen klären Sie vor einer Zusammenarbeit. Auch kein passendes Ergebnis wird ausgewiesen.</p> },
        placement
          ? { question: "Was kostet die Vermittlung?", answer: <p>Suche, Anfrage, Vorstellung und Erstgespräch sind kostenlos. Beauftragen Sie den Freelancer, zahlen Sie einmalig {PLACEMENT_TERMS.feePercent} % des vereinbarten Honorars für die ersten {PLACEMENT_TERMS.feeMonths} Monate (höchstens {PLACEMENT_TERMS.maxFeeDays} Projekttage), zuzüglich Umsatzsteuer, per Rechnung mit {PLACEMENT_TERMS.paymentDays} Tagen Zahlungsziel. Beispiel: {formatWholeEuro(PLACEMENT_EXAMPLE.dayRateCents)} Tagessatz und {PLACEMENT_EXAMPLE.projectDays} Projekttage ergeben {formatWholeEuro(placementExampleFeeCents())} netto. Die Rechnung kommt erst nach der Beauftragung, nicht für einen gebuchten Termin. Einzelheiten stehen in den <Link href={PLACEMENT_TERMS_PATH}>Vermittlungsbedingungen</Link>.</p> }
          : { question: "Was bedeutet „direkt buchen“?", answer: <p>Nach der Anmeldung öffnen Sie bei einem Profil mit Terminlink den hinterlegten Buchungskalender und wählen selbst einen freien Slot. Ohne Terminlink ist die direkte Buchung derzeit nicht verfügbar. Der Termin ist ein Erstgespräch und noch keine Beauftragung.</p> },
      ]} /></section>
      <section className={styles.closing} aria-labelledby="start-title"><div><h2 id="start-title">Projektanzeige schon fertig?</h2><p>Kopieren, einfügen und passende Freelancer sehen. Oder in 20 Minuten mit uns klären, wen Sie brauchen.</p></div><div className={styles.actions}><ProjectLink>Projekt jetzt einfügen</ProjectLink><SalesCallLink entry="closing" /></div></section>
    </main>
  );
}
