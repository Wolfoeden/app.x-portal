import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { ProjectLink, Questions } from "./MarketingPage";
import { MARKETING_PAGE } from "@/lib/seo";
import { breadcrumbStructuredData } from "@/lib/structured-data";
import { BRIEF_ANALYSIS_CREDITS, CREDIT_PLANS } from "@/lib/ai/credit-policy";
import styles from "./landing.module.css";

function StepIcon({ kind }: { kind: "brief" | "profiles" | "conversation" }) {
  return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "brief" ? <><rect x="17" y="9" width="32" height="44" rx="5" /><path d="M25 21h16M25 29h16M25 37h8" /><path d="m35 46 5 5 13-14" strokeWidth="3" /></> : null}
    {kind === "profiles" ? <><rect x="7" y="17" width="23" height="35" rx="4" /><rect x="34" y="9" width="23" height="43" rx="4" /><circle cx="18.5" cy="28" r="4" /><path d="M12 43c0-9 13-9 13 0" /><circle cx="45.5" cy="23" r="4" /><path d="M39 37c0-9 13-9 13 0m-13 9 4 4 8-9" /></> : null}
    {kind === "conversation" ? <><path d="M10 11h32a5 5 0 0 1 5 5v17a5 5 0 0 1-5 5H24L12 48V38h-2a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5Z" /><path d="M47 25h7a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5v8L43 51H32m-17-29h22m-22 8h15" /></> : null}
  </svg>;
}

export function FreelancerLanding() {
  return (
    <main id="main-content" className={styles.main} tabIndex={-1}>
      <JsonLd data={breadcrumbStructuredData(MARKETING_PAGE.find)} />
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Für Recruiter mit fertiger Projektanzeige</p>
          <h1>Projekt kopieren.<br />Freelancer finden.<br /><span>Termin buchen.</span></h1>
          <p className={styles.lead}>Projektbeschreibung bei XPORTAL einfügen, passende Profile prüfen und – bei vorhandenem Terminlink – direkt ein Erstgespräch buchen.</p>
          <div className={styles.actions}><ProjectLink>Projekt jetzt einfügen</ProjectLink><a className={styles.textLink} href="#ablauf">So funktioniert’s <span aria-hidden="true">↓</span></a></div>
          <p className={styles.startNote}><span aria-hidden="true">✓</span> Analyse ohne Anmeldung · Termin mit Konto</p>
        </div>
        <figure className={styles.heroFigure}>
          <div className={styles.figureLabel}><span>Projekttext einfügen</span><span aria-hidden="true">→</span><span>Match erhalten</span></div>
          <Image src="/images/landing/project-match.webp" alt="Eine Projektbeschreibung wird mit einer Auswahl von Freelancer-Profilen verbunden." width={1536} height={1024} sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1260px) 48vw, 570px" loading="eager" fetchPriority="high" />
          <figcaption>Aus Ihrer Ausschreibung wird eine konkrete Freelancer-Empfehlung.</figcaption>
        </figure>
      </header>

      <section className={styles.process} id="ablauf" aria-labelledby="ablauf-title">
        <div className={styles.sectionHead}><p className={styles.eyebrow}>Von der Ausschreibung zum Termin</p><h2 id="ablauf-title">Kopieren. Einfügen. Buchen.</h2></div>
        <ol className={styles.steps}>
          <li><div className={styles.stepTop}><StepIcon kind="brief" /><span>01</span></div><h3>Projekttext kopieren</h3><p>Nehmen Sie die Beschreibung aus Ihrer bestehenden Ausschreibung.</p></li>
          <li><div className={styles.stepTop}><StepIcon kind="profiles" /><span>02</span></div><h3>Bei XPORTAL einfügen</h3><p>XPORTAL erkennt Anforderungen und schlägt passende Profile vor.</p></li>
          <li><div className={styles.stepTop}><StepIcon kind="conversation" /><span>03</span></div><h3>Erstgespräch buchen</h3><p>Passendes Profil prüfen und bei vorhandenem Terminlink einen freien Slot wählen.</p></li>
        </ol>
      </section>

      <section className={styles.evidence} id="begruendung" aria-labelledby="begruendung-title">
        <div className={styles.explanation}><p className={styles.eyebrow}>Mehr als eine Ergebnisliste</p><h2 id="begruendung-title">Sehen, warum<br />es passen könnte.</h2><p>XPORTAL stellt Ihre Anforderungen den Profilangaben gegenüber. Passende Skills und fehlende Informationen werden sichtbar.</p><Link className={styles.textLink} href={MARKETING_PAGE.matching.path}>Mehr zum KI-Matching <span aria-hidden="true">↗</span></Link></div>
        <figure className={styles.example}>
          <figcaption>So lesen Sie ein Ergebnis <span>Illustratives Beispiel · kein reales Profil</span></figcaption>
          <div className={styles.brief}><span>Ihr Projekt</span><p>„React-Entwicklung, remote.<br />Start im Oktober.“</p></div>
          <div className={styles.connector} aria-hidden="true">↓</div>
          <div className={styles.profile}><div className={styles.profileHead}><span className={styles.avatar} aria-hidden="true">R</span><div><strong>React-Entwicklung</strong><span>Beispielprofil</span></div></div><dl><div><dt>React</dt><dd className={styles.match}><span aria-hidden="true">✓</span> Im Profil genannt</dd></div><div><dt>Remote</dt><dd className={styles.match}><span aria-hidden="true">✓</span> Arbeitsmodus passt</dd></div><div><dt>Start im Oktober</dt><dd className={styles.open}><span aria-hidden="true">?</span> Noch zu klären</dd></div></dl></div>
        </figure>
      </section>

      <section className={styles.fields} aria-labelledby="felder-title"><div><p className={styles.eyebrow}>Zum Beispiel für</p><h2 id="felder-title">Was möchten Sie umsetzen?</h2></div><ul><li>Softwareentwicklung</li><li>SAP &amp; Integration</li><li>KI &amp; Automatisierung</li><li>Anforderungen &amp; Prozesse</li></ul><Link className={styles.textLink} href={MARKETING_PAGE.it.path}>IT-Projekt konkretisieren <span aria-hidden="true">↗</span></Link></section>

      <section className={styles.conversation} aria-labelledby="auswahl-title"><Image src="/images/landing/project-conversation.webp" alt="Auftraggeber und Freelancer besprechen gemeinsam eine Projektbeschreibung am Tisch." width={1536} height={1024} sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1260px) 44vw, 520px" loading="lazy" /><div className={styles.explanation}><p className={styles.eyebrow}>Vom Match ins Gespräch</p><h2 id="auswahl-title">Passendes Profil gefunden?<br />Termin direkt buchen.</h2><p>Nach der Anmeldung öffnen Sie bei Profilen mit Terminlink die externe Terminseite und wählen selbst einen freien Slot. Erfahrung, Honorar und Verfügbarkeit klären Sie anschließend gemeinsam.</p><ProjectLink>Projekt jetzt einfügen</ProjectLink></div></section>

      <section className={styles.faq} id="fragen" aria-labelledby="fragen-title"><div><p className={styles.eyebrow}>Kurz beantwortet</p><h2 id="fragen-title">Noch Fragen?</h2><Link className={styles.textLink} href={MARKETING_PAGE.how.path}>Alle Details zum Ablauf <span aria-hidden="true">↗</span></Link></div><Questions items={[
        { question: "Kann ich ohne Anmeldung starten?", answer: <p>Ja. Beschreiben Sie Ihr Projekt als Gast. Für das dauerhafte Speichern und weitere Schritte mit einem ausgewählten Profil können Sie anschließend ein Konto erstellen.</p> },
        { question: "Was kostet die Suche?", answer: <p>Der Gaststart enthält {CREDIT_PLANS.guest.monthlyCredits} Credits. Eine Projektanalyse verbraucht {BRIEF_ANALYSIS_CREDITS} Credits. Kontingente und weitere Aktionen finden Sie in der <Link href={MARKETING_PAGE.how.path + "#kosten"}>Kostenübersicht</Link>. Freelancer-Honorare sind separat.</p> },
        { question: "Ist ein passender Freelancer garantiert?", answer: <p>Nein. Ergebnisse hängen von Ihren Anforderungen und den vorhandenen Profilen ab. Profilangaben sind nicht automatisch unabhängig geprüft. Verfügbarkeit, Honorar und offene Fragen klären Sie vor einer Zusammenarbeit. Auch kein passendes Ergebnis wird ausgewiesen.</p> },
        { question: "Was bedeutet „direkt buchen“?", answer: <p>Nach der Anmeldung öffnen Sie bei einem Profil mit Terminlink den hinterlegten Buchungskalender und wählen selbst einen freien Slot. Ohne Terminlink ist die direkte Buchung derzeit nicht verfügbar. Der Termin ist ein Erstgespräch und noch keine Beauftragung.</p> },
      ]} /></section>
      <section className={styles.closing} aria-labelledby="start-title"><div><h2 id="start-title">Projektanzeige schon fertig?</h2><p>Kopieren, einfügen und passende Freelancer sehen.</p></div><ProjectLink>Projekt jetzt einfügen</ProjectLink></section>
    </main>
  );
}
