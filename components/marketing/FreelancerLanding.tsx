import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/JsonLd";
import { EXAMPLE_BRIEFS, exampleBriefPath, type ExampleBriefKey } from "@/components/chat/example-briefs";
import { Questions } from "./MarketingPage";
import { ProcessVideo } from "./ProcessVideo";
import type { LandingStats } from "@/lib/marketing/landing-stats";
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
import { salesCallHref, type SalesCallEntry } from "@/lib/sales/sales-call-links";
import styles from "./landing.module.css";

/*
 * Aufbau nach dem Vorbild von Anbietern, die Software an Unternehmen
 * verkaufen: ein schmales Raster mit sichtbaren Linien, ruhige Display-Schrift,
 * zwei Wege von Anfang an (Gespräch buchen oder selbst testen) und Belege statt
 * Behauptungen. Kundenlogos gibt es noch keine; an ihrer Stelle steht, was
 * tatsächlich im Bestand ist (`stats`, aus der Datenbank, stündlich neu).
 */

function SalesButton({ entry, children = "Gespräch buchen", pill = false, outline = false }: { entry: SalesCallEntry; children?: ReactNode; pill?: boolean; outline?: boolean }) {
  return (
    <Link href={salesCallHref(entry)} prefetch={false} className={`${styles.button} ${outline ? styles.outline : styles.primary}${pill ? ` ${styles.pill}` : ""}`}>
      {children}
    </Link>
  );
}

function TryButton({ href = "/chat", children, pill = false, primary = false }: { href?: string; children: ReactNode; pill?: boolean; primary?: boolean }) {
  return (
    <Link href={href} prefetch={false} className={`${styles.button} ${primary ? styles.primary : styles.outline}${pill ? ` ${styles.pill}` : ""}`}>
      {children}
    </Link>
  );
}

function Check() {
  return (
    <svg className={styles.check} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="10" />
      <path d="m6 10.2 2.6 2.6L14.2 7.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

/** Kleine Produktszenen auf den Rollenkacheln; Illustration, keine Daten. */
const ROLE_SCENES: Readonly<Record<ExampleBriefKey, ReactNode>> = {
  "ai-agenten": (
    <div className={styles.sceneGraph}>
      <span className={styles.chip}>Dokumente</span>
      <span className={styles.chip}>CRM</span>
      <span className={`${styles.chip} ${styles.chipStrong}`}>Agent</span>
      <span className={styles.chip}>RAG</span>
      <span className={styles.chip}>Freigabe</span>
    </div>
  ),
  "react-typescript": (
    <ul className={styles.sceneList}>
      <li data-muted="">Design-System vorhanden</li>
      <li>React-Komponenten bauen</li>
      <li>TypeScript strikt</li>
      <li data-muted="">Tests mit Playwright</li>
    </ul>
  ),
  "requirements-engineer": (
    <div className={styles.sceneSteps}>
      <span className={styles.chip}>Workshop beendet</span>
      <p><b>1</b>User Stories erfasst</p>
      <p><b>2</b>Abnahmekriterien geklärt</p>
      <span className={`${styles.chip} ${styles.chipStrong}`}>Backlog priorisiert</span>
    </div>
  ),
};

const MONTHLY_PLANS: readonly FixedMonthlyPlan[] = PUBLIC_PRICING_PLANS.flatMap((plan) =>
  plan.billingModel === "fixed_monthly" ? [plan] : [],
);
const ENTRY_EURO = Math.min(...MONTHLY_PLANS.map((plan) => plan.euro));

function number(value: number): string {
  return value.toLocaleString("de-DE");
}

function Stats({ stats, placement }: { stats: LandingStats | null; placement: boolean }) {
  const items = [
    stats ? { value: number(stats.profiles), label: "freigegebene Profile" } : { value: "0 €", label: "bis zur Beauftragung" },
    stats ? { value: number(stats.projects), label: "Projektbeschreibungen analysiert" } : { value: `${BRIEF_ANALYSIS_CREDITS} Credits`, label: "je Projektanalyse" },
    placement
      ? { value: `${PLACEMENT_TERMS.feePercent} %`, label: "nur bei Beauftragung" }
      : { value: `${START_CREDITS} Credits`, label: "zum Start mit Konto" },
  ];
  return (
    <ul className={styles.stats}>
      {items.map((item) => <li key={item.label}><strong>{item.value}</strong> {item.label}</li>)}
    </ul>
  );
}

function Pricing({ placement }: { placement: boolean }) {
  return (
    <section className={styles.section} aria-labelledby="preise-title">
      <div className={styles.frame}>
        <div className={styles.splitHead}>
          <h2 id="preise-title">Bezahlen, wenn es sich lohnt.</h2>
          <p>Gespräch, Suche und Vorstellung kosten nichts. Geld verdienen wir erst, wenn Sie jemanden beauftragen. Wer selbst sucht, startet mit Guthaben und ohne Abo.</p>
        </div>
        <div className={styles.priceGrid}>
          {placement ? (
            <article className={`${styles.priceCard} ${styles.priceFeatured}`}>
              <p className={styles.priceName}>Vermittlung</p>
              <p className={styles.priceValue}><strong>{PLACEMENT_TERMS.feePercent} %</strong><span>einmalig, nur bei Beauftragung</span></p>
              <ul>
                <li><Check />Suche, Anfrage und Vorstellung kostenlos</li>
                <li><Check />Vom Honorar der ersten {PLACEMENT_TERMS.feeMonths} Monate, höchstens {PLACEMENT_TERMS.maxFeeDays} Projekttage</li>
                <li><Check />Rechnung mit {PLACEMENT_TERMS.paymentDays} Tagen Zahlungsziel, keine Vorkasse</li>
                <li><Check />Beispiel: {formatWholeEuro(PLACEMENT_EXAMPLE.dayRateCents)} Tagessatz, {PLACEMENT_EXAMPLE.projectDays} Tage → {formatWholeEuro(placementExampleFeeCents())} netto</li>
              </ul>
              <div className={styles.priceActions}>
                <SalesButton entry="pricing" />
                <Link className={styles.textLink} href={PLACEMENT_TERMS_PATH}>Vermittlungsbedingungen</Link>
              </div>
            </article>
          ) : (
            <article className={`${styles.priceCard} ${styles.priceFeatured}`}>
              <p className={styles.priceName}>Monatstarife</p>
              <p className={styles.priceValue}><strong>ab {ENTRY_EURO} €</strong><span>netto im Monat, monatlich kündbar</span></p>
              <ul>
                {MONTHLY_PLANS.map((plan) => (
                  <li key={plan.id}><Check />{plan.label}: {number(plan.monthlyCredits)} Credits für {plan.euro} € netto</li>
                ))}
              </ul>
              <div className={styles.priceActions}>
                <TryButton href={MARKETING_PAGE.pricing.path} primary>Tarife vergleichen</TryButton>
              </div>
            </article>
          )}
          <article className={styles.priceCard}>
            <p className={styles.priceName}>Selbst suchen</p>
            <p className={styles.priceValue}><strong>0 €</strong><span>zum Start, ohne Abo</span></p>
            <ul>
              <li><Check />{GUEST_TRIAL_CREDITS} Credits ohne Konto, {START_CREDITS} mit kostenlosem Konto</li>
              <li><Check />Reicht für {countLabel(roundedExampleCount(START_CREDITS, "research"), "research")}</li>
              <li><Check />Danach Monatstarife ab {ENTRY_EURO} € netto, monatlich kündbar</li>
            </ul>
            <div className={styles.priceActions}>
              <TryButton>Kostenlos testen</TryButton>
              <Link className={styles.textLink} href={MARKETING_PAGE.pricing.path}>Alle Tarife vergleichen</Link>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function FreelancerLanding({ stats = null }: { stats?: LandingStats | null }) {
  // Wird beim Build eingesetzt, wie überall beim Vermittlungsmodell.
  const placement = placementRequestsEnabled();
  const pool = stats ? `${number(stats.profiles)} freigegebenen Profilen` : "unserem Bestand";
  return (
    <main id="main-content" className={styles.main} tabIndex={-1}>
      <JsonLd data={breadcrumbStructuredData(MARKETING_PAGE.find)} />

      <header className={`${styles.section} ${styles.hero}`}>
        <div className={`${styles.frame} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <h1>Freelancer finden.<br /><span>{placement ? "Persönlich vorgestellt." : "Termin buchen."}</span></h1>
            <p className={styles.subtitle}>Für KI-, Software- und Digitalprojekte in Ihrem Unternehmen.</p>
            <p className={styles.lead}>
              {placement
                ? `Sagen Sie uns in 30 Minuten, wen Sie suchen. Wir gleichen Ihr Projekt mit ${pool} ab, fragen die Verfügbarkeit an und stellen Ihnen passende Freelancer per E-Mail vor. Bezahlt wird nur, wenn Sie beauftragen.`
                : "Projektbeschreibung bei XPORTAL einfügen, passende Profile prüfen und – bei vorhandenem Terminlink – direkt ein Erstgespräch buchen."}
            </p>
            <div className={styles.actions}>
              <SalesButton entry="hero" />
              <TryButton>Projekt kostenlos prüfen</TryButton>
            </div>
            <ul className={styles.notes}>
              {placement ? (
                <>
                  <li><Check />Anfrage ohne Konto, Vorstellung kostenlos</li>
                  <li><Check />{PLACEMENT_TERMS.feePercent} % Honorar nur bei Beauftragung, <Link href={PLACEMENT_TERMS_PATH}>Bedingungen</Link></li>
                </>
              ) : (
                <>
                  <li><Check />Analyse kostenlos und ohne Anmeldung</li>
                  <li><Check />Monatstarife ab {ENTRY_EURO} € netto, <Link href={MARKETING_PAGE.pricing.path}>monatlich kündbar</Link></li>
                </>
              )}
            </ul>
          </div>
          <figure className={styles.heroVisual}>
            <div className={styles.glow} aria-hidden="true" />
            <div className={styles.briefChip}><span>Ihr Projekt</span>KI-Agenten · remote · ab November</div>
            <div className={styles.mockCard}>
              <div className={styles.mockBand} aria-hidden="true" />
              <div className={styles.mockHead}>
                <span className={styles.mockAvatar} aria-hidden="true">KE</span>
                <div><strong>KI-Entwicklerin</strong><span>Agenten, RAG, TypeScript · remote</span></div>
              </div>
              <ul className={styles.mockEvidence}>
                <li><span className={styles.ok} aria-hidden="true">✓</span>AI Agents<em>in Projekten belegt</em></li>
                <li><span className={styles.ok} aria-hidden="true">✓</span>TypeScript<em>im Profil genannt</em></li>
                <li><span className={styles.open} aria-hidden="true">?</span>Start November<em>wird angefragt</em></li>
              </ul>
            </div>
            <p className={styles.bubble}>{placement ? "Passt. Wir fragen die Verfügbarkeit an und stellen Sie vor." : "Passt. Termin direkt im Kalender wählen."}</p>
            <figcaption>Illustratives Beispiel, kein reales Profil</figcaption>
          </figure>
        </div>
      </header>

      {stats?.fields.length ? (
        <section className={styles.section} aria-label="Freigegebene Profile nach Fachgebiet">
          <div className={`${styles.frame} ${styles.wall}`}>
            <ul>
              {stats.fields.map((field) => (
                <li key={field.field}><strong>{field.label}</strong><span>{number(field.count)} Profile</span></li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className={styles.section} id="vermittlung" aria-labelledby="vermittlung-title">
        <div className={styles.frame}>
          <h2 id="vermittlung-title">Ein Gespräch genügt.<br />Wir stellen die passenden Leute vor.</h2>
          <p className={styles.sectionLead}>
            Wie ein Recruiting-Team auf Abruf: Wir nehmen Ihren Bedarf auf, gleichen ihn mit dem Bestand ab und fragen die
            Verfügbarkeit an, bevor wir Sie vorstellen. Entscheiden und beauftragen tun Sie selbst, direkt beim Freelancer.
          </p>
          <ol className={styles.timeline}>
            <li className={styles.timelineFeatured}>
              <div className={styles.chips} aria-hidden="true">
                <span className={styles.chip}><Check />Rolle und Muss-Skills</span>
                <span className={styles.chip}><Check />Start und Dauer</span>
                <span className={`${styles.chip} ${styles.chipMuted}`}>Tagessatz-Rahmen</span>
              </div>
              <p className={styles.timelineWhen}>Im Gespräch · 30 Minuten</p>
              <h3>Bedarf klären</h3>
              <p>Rolle, Muss-Skills, Start, Dauer und Tagessatz-Rahmen. Sie hören ehrlich, ob unser Bestand passt.</p>
            </li>
            <li>
              <p className={styles.timelineWhen}>Danach</p>
              <h3>Vorstellung per E-Mail</h3>
              <p>Wir fragen passende Freelancer an und stellen Sie vor. Sie sprechen direkt miteinander.</p>
            </li>
            <li>
              <p className={styles.timelineWhen}>{placement ? "Bei Beauftragung" : "Zum Schluss"}</p>
              <h3>{placement ? `Einmal ${PLACEMENT_TERMS.feePercent} % zahlen` : "Direkt beauftragen"}</h3>
              <p>{placement ? `Vom Honorar der ersten ${PLACEMENT_TERMS.feeMonths} Monate. Keine Vorkasse, kein Abo.` : "Vertrag und Honorar vereinbaren Sie direkt mit dem Freelancer."}</p>
            </li>
          </ol>
          <div className={styles.ruleRow}>
            <p>Sie brauchen jemanden in diesem Monat? Sprechen wir darüber.</p>
            <SalesButton entry="process" pill />
          </div>
        </div>
      </section>

      <section className={styles.section} id="ablauf" aria-labelledby="ablauf-title">
        <div className={styles.frame}>
          <div className={styles.splitHead}>
            <div>
              <p className={styles.eyebrow}>Lieber selbst suchen?</p>
              <h2 id="ablauf-title">{placement ? "Einfügen. Anfragen." : "Einfügen. Buchen."}</h2>
            </div>
            <div>
              <p>Projekttext aus Ihrer Ausschreibung einfügen, passende Profile mit Begründung sehen und den Freelancer anfragen. Ohne Anmeldung.</p>
              <div className={styles.actions}>
                <TryButton primary pill>Projekt einfügen</TryButton>
                <SalesButton entry="process" pill outline />
              </div>
            </div>
          </div>
          <div className={styles.videoPanel}>
            <ProcessVideo steps={processSteps(placement)} />
          </div>
        </div>
      </section>

      <section className={styles.section} id="begruendung" aria-labelledby="begruendung-title">
        <div className={styles.frame}>
          <div className={styles.storyHead}>
            <span className={styles.storyIcon} aria-hidden="true"><Check /></span>
            <h2 id="begruendung-title">Sehen, warum es passen könnte: Anforderung, Beleg und offene Frage stehen getrennt da.</h2>
            <Link className={`${styles.button} ${styles.outline}`} href={MARKETING_PAGE.matching.path}>Mehr zum Matching</Link>
          </div>
          <figure className={styles.example}>
            <figcaption>So lesen Sie ein Ergebnis <span>Illustratives Beispiel · kein reales Profil</span></figcaption>
            <div className={styles.exampleBody}>
              <div className={styles.brief}><span>Ihr Projekt</span><p>„KI-Automatisierung, remote. Start im November.“</p></div>
              <div className={styles.profile}>
                <div className={styles.profileHead}><span className={styles.avatar} aria-hidden="true">K</span><div><strong>KI-Automatisierung</strong><span>Beispielprofil</span></div></div>
                <dl>
                  <div><dt>Automatisierung</dt><dd className={styles.match}><span aria-hidden="true">✓</span> Im Profil genannt</dd></div>
                  <div><dt>Remote</dt><dd className={styles.match}><span aria-hidden="true">✓</span> Arbeitsmodus passt</dd></div>
                  <div><dt>Start im November</dt><dd className={styles.openText}><span aria-hidden="true">?</span> Noch zu klären</dd></div>
                </dl>
              </div>
            </div>
          </figure>
          <Stats stats={stats} placement={placement} />
        </div>
      </section>

      {/* Jede Rolle öffnet den Chat mit dem Anfang einer Anfrage — nur Rollen,
          die der Profilbestand trägt; alles andere über den eigenen Text. */}
      <section className={styles.section} aria-labelledby="felder-title">
        <div className={styles.frame}>
          <h2 id="felder-title">Wen suchen Sie?</h2>
          <p className={styles.sectionLead}>Ein Klick öffnet den Chat mit dem Anfang Ihrer Anfrage, ohne Anmeldung. Aufgabe, Start und Budget ergänzen, abschicken, passende Profile sehen.</p>
          <ul className={styles.roles}>
            {EXAMPLE_BRIEFS.map((example) => (
              <li key={example.key}>
                <Link className={styles.role} href={exampleBriefPath(example.key)} prefetch={false}>
                  <div className={styles.tile} aria-hidden="true">{ROLE_SCENES[example.key]}</div>
                  <strong>{example.label}</strong>
                  <span>{EXAMPLE_TEASERS[example.key]}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link className={styles.role} href="/chat" prefetch={false}>
                <div className={styles.tile} aria-hidden="true">
                  <div className={styles.scenePaste}><p>Wir suchen ab November Unterstützung für …</p><span className={`${styles.chip} ${styles.chipStrong}`}>Einfügen</span></div>
                </div>
                <strong>Eigene Ausschreibung</strong>
                <span>Softwareentwicklung, SAP oder ein anderes IT-Projekt: Text einfügen.</span>
              </Link>
            </li>
          </ul>
          <Link className={styles.textLink} href={MARKETING_PAGE.it.path}>IT-Projekt konkretisieren <span aria-hidden="true">→</span></Link>
          <div className={styles.ruleRow}>
            <p>Andere Rolle? Wir sagen Ihnen im Gespräch, ob wir passende Leute haben.</p>
            <SalesButton entry="roles" pill />
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="auswahl-title">
        <div className={`${styles.frame} ${styles.quote}`}>
          <div className={styles.quoteText}>
            {placement ? (
              <><h2 id="auswahl-title">Passendes Profil gefunden?<br />Anfragen, wir stellen vor.</h2><p>Mit einem Klick fragen Sie den Freelancer an, auch ohne Konto. XPORTAL prüft die Verfügbarkeit und stellt Sie beide per Mail vor; mit Terminlink wählen Sie danach selbst einen freien Slot. Den Stand sehen Sie unter „Gespräche“. Kommt es zur Beauftragung, berechnen wir einmalig {PLACEMENT_TERMS.feePercent} % des Honorars der ersten {PLACEMENT_TERMS.feeMonths} Monate.</p></>
            ) : (
              <><h2 id="auswahl-title">Passendes Profil gefunden?<br />Termin direkt buchen.</h2><p>Nach der Anmeldung öffnen Sie bei Profilen mit Terminlink die externe Terminseite und wählen selbst einen freien Slot. Erfahrung, Honorar und Verfügbarkeit klären Sie anschließend gemeinsam.</p></>
            )}
            <TryButton>Projekt jetzt einfügen</TryButton>
          </div>
          <div className={styles.quoteMedia}>
            <Image src="/images/landing/project-conversation.webp" alt="Auftraggeber und Freelancer besprechen gemeinsam eine Projektbeschreibung am Tisch." width={1536} height={1024} sizes="(max-width: 760px) 100vw, 560px" loading="lazy" />
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="vertrauen-title">
        <div className={styles.frame}>
          <h2 id="vertrauen-title">Gebaut für Unternehmen</h2>
          <p className={styles.sectionLead}>Klare Bedingungen, Daten in der EU und keine Vorkasse. XPORTAL arbeitet ausschließlich mit Unternehmen.</p>
          <div className={styles.badgePanel}>
            <div className={styles.badge}><span><small>Datenbank</small>EU<small>Irland</small></span><p>Daten in der EU <Check /></p></div>
            <div className={styles.badge}><span><small>Nur</small>B2B<small>§ 14 BGB</small></span><p>Nur Unternehmen <Check /></p></div>
            {placement ? <div className={styles.badge}><span><small>Honorar</small>{PLACEMENT_TERMS.feePercent} %<small>bei Auftrag</small></span><p>Keine Vorkasse <Check /></p></div> : null}
          </div>
          <div className={styles.checklists}>
            <div>
              <h3>Datenschutz</h3>
              <ul>
                <li><Check />Projektdaten in Irland (EU)</li>
                <li><Check />Kein KI-Training mit Ihren Daten</li>
                <li><Check /><Link href="/datenwege">Datenwege offengelegt</Link></li>
              </ul>
            </div>
            <div>
              <h3>Vermittlung</h3>
              <ul>
                <li><Check />Profile erst nach Freigabe sichtbar</li>
                <li><Check />Verfügbarkeit vor der Vorstellung angefragt</li>
                <li><Check />Vertrag direkt mit dem Freelancer</li>
              </ul>
            </div>
            <div>
              <h3>Abrechnung</h3>
              <ul>
                {placement ? <li><Check />{PLACEMENT_TERMS.feePercent} % nur bei Beauftragung</li> : null}
                <li><Check />Kein Abo nötig, Tarife monatlich kündbar</li>
                <li><Check />Rechnung über Stripe</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <Pricing placement={placement} />

      <section className={styles.section} id="fragen" aria-labelledby="fragen-title">
        <div className={`${styles.frame} ${styles.faq}`}>
          <div>
            <h2 id="fragen-title">Noch Fragen?</h2>
            <Link className={styles.textLink} href={MARKETING_PAGE.how.path}>Alle Details zum Ablauf <span aria-hidden="true">→</span></Link>
          </div>
          <Questions items={[
            { question: "Kann ich ohne Anmeldung starten?", answer: <p>Ja. Beschreiben Sie Ihr Projekt als Gast. Für das dauerhafte Speichern und weitere Schritte mit einem ausgewählten Profil können Sie anschließend ein Konto erstellen.</p> },
            { question: "Was kostet die Suche?", answer: <p>{CREDIT_RULES.guest} {CREDIT_RULES.account} Eine Projektanalyse verbraucht {BRIEF_ANALYSIS_CREDITS} Credits; fällt die KI aus, nichts. Kontingente und weitere Aktionen finden Sie auf der <Link href={MARKETING_PAGE.pricing.path}>Preisseite</Link>. Freelancer-Honorare sind separat.</p> },
            { question: "Ist ein passender Freelancer garantiert?", answer: <p>Nein. Ergebnisse hängen von Ihren Anforderungen und den vorhandenen Profilen ab. Profilangaben sind nicht automatisch unabhängig geprüft. Verfügbarkeit, Honorar und offene Fragen klären Sie vor einer Zusammenarbeit. Auch kein passendes Ergebnis wird ausgewiesen.</p> },
            placement
              ? { question: "Was kostet die Vermittlung?", answer: <p>Suche, Anfrage, Vorstellung und Erstgespräch sind kostenlos. Beauftragen Sie den Freelancer, zahlen Sie einmalig {PLACEMENT_TERMS.feePercent} % des vereinbarten Honorars für die ersten {PLACEMENT_TERMS.feeMonths} Monate (höchstens {PLACEMENT_TERMS.maxFeeDays} Projekttage), zuzüglich Umsatzsteuer, per Rechnung mit {PLACEMENT_TERMS.paymentDays} Tagen Zahlungsziel. Beispiel: {formatWholeEuro(PLACEMENT_EXAMPLE.dayRateCents)} Tagessatz und {PLACEMENT_EXAMPLE.projectDays} Projekttage ergeben {formatWholeEuro(placementExampleFeeCents())} netto. Die Rechnung kommt erst nach der Beauftragung, nicht für einen gebuchten Termin. Einzelheiten stehen in den <Link href={PLACEMENT_TERMS_PATH}>Vermittlungsbedingungen</Link>.</p> }
              : { question: "Was bedeutet „direkt buchen“?", answer: <p>Nach der Anmeldung öffnen Sie bei einem Profil mit Terminlink den hinterlegten Buchungskalender und wählen selbst einen freien Slot. Ohne Terminlink ist die direkte Buchung derzeit nicht verfügbar. Der Termin ist ein Erstgespräch und noch keine Beauftragung.</p> },
            { question: "Wie läuft das Gespräch ab?", answer: <p>Sie erzählen in 30 Minuten, wen Sie suchen; wir sagen Ihnen ehrlich, ob unser Bestand passt, und stellen passende Freelancer danach per E-Mail vor. Das Gespräch ist kostenlos und verpflichtet zu nichts.</p> },
          ]} />
        </div>
      </section>

      <section className={`${styles.section} ${styles.closing}`} aria-labelledby="start-title">
        <div className={styles.frame}>
          <div className={styles.closingCard}>
            <div className={styles.glow} aria-hidden="true" />
            <h2 id="start-title">In 30 Minuten wissen Sie,<br />ob wir passende Leute haben.</h2>
            <p>Kostenlos und unverbindlich. Oder fügen Sie Ihre Projektanzeige ein und sehen Sie sofort passende Profile.</p>
            <div className={styles.actions}>
              <SalesButton entry="closing" />
              <TryButton>Projekt jetzt einfügen</TryButton>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
