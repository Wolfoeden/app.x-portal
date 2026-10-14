import type { Metadata } from "next";
import Link from "next/link";

import { CaptchaField } from "@/components/CaptchaField";
import { ContactPerson } from "@/components/marketing/ContactPerson";
import { PublicFooter, PublicHeader } from "@/components/public/PublicChrome";
import { ActionButton, FormField, Notice } from "@/components/ui/Primitives";
import { actionClass } from "@/components/ui/actions";
import {
  CONTACT_TOPICS,
  CONTACT_WAYS,
  isContactWay,
  topicsFromQuery,
  type ContactTopicKey,
  type ContactWay,
} from "@/lib/contact/topics";
import { CONTACT_RESPONSE_PROMISE, IMPRINT_EMAIL } from "@/lib/legal/policy";
import { salesCalendarUrl } from "@/lib/sales/sales-call-model";
import { salesCallUrl } from "@/lib/sales/sales-call";
import { salesContactPhotoUrl } from "@/lib/sales/sales-contact";
import { phoneHref, SALES_CONTACT } from "@/lib/sales/sales-contact-model";
import { CONTACT_PAGE, pageMetadata } from "@/lib/seo";

import styles from "./contact.module.css";

export const metadata: Metadata = pageMetadata(CONTACT_PAGE);

type Status = "sent" | "error" | "invalid";
type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function statusOf(value: string | undefined): Status | null {
  return value === "sent" || value === "error" || value === "invalid" ? value : null;
}

/** Ein Icon im Stil der übrigen Seiten: 16er Raster, Strich 1,5. */
function Icon({ paths, size = 22 }: { paths: readonly string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

const ICON = {
  chat: ["M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"],
  sales: ["M2.5 12.5 6 9l2.5 2.5 5-5.5", "M10 6h3.5v3.5"],
  data: ["M2.5 13.5h11", "M3.5 10.5 6.5 7l2.5 2 3.5-5"],
  book: ["M2.5 3h4.5a1 1 0 0 1 1 1v9.5a1.5 1.5 0 0 0-1.5-1.5h-4z", "M13.5 3H9a1 1 0 0 0-1 1v9.5a1.5 1.5 0 0 1 1.5-1.5h4z"],
  warehouse: ["M2 6.5 8 3l6 3.5V14H2z", "M5 14V9.5h6V14M5 11.5h6"],
  plus: ["M8 3v10M3 8h10"],
  school: ["M1.5 6 8 3l6.5 3L8 9z", "M4 7.3V11c1 1.3 2.4 2 4 2s3-.7 4-2V7.3"],
  list: ["M3.5 2.5h9v11h-9z", "M5.5 5.5h5M5.5 8h5M5.5 10.5h3"],
  shield: ["M8 1.5 13.5 3.5v4c0 3.3-2.3 5.8-5.5 7-3.2-1.2-5.5-3.7-5.5-7v-4z", "m5.5 8 1.8 1.8L10.5 6.5"],
  calendar: ["M2.5 3.5h11v10h-11z", "M2.5 6.5h11M5.5 2v3M10.5 2v3"],
  phone: ["M3 2.5h2.5l1 3-1.5 1a7 7 0 0 0 3.5 3.5l1-1.5 3 1V12a1.5 1.5 0 0 1-1.5 1.5A10.5 10.5 0 0 1 2.5 4 1.5 1.5 0 0 1 3 2.5z"],
} as const;

/** Die bekannten Einsatzfälle aus dem Telefonleitfaden. */
const USE_CASES: readonly {
  topic: ContactTopicKey;
  icon: keyof typeof ICON;
  title: string;
  text: string;
  points: readonly string[];
  start: string;
}[] = [
  {
    topic: "kundenservice",
    icon: "chat",
    title: "Kundenservice automatisieren",
    text: "Anfragen per E-Mail, Formular oder Chat werden gelesen, sortiert und beantwortet, wenn die Antwort feststeht.",
    points: ["Standardfragen sofort beantworten", "Tickets nach Thema und Dringlichkeit vorsortieren", "Übergabe an Mitarbeiter mit Zusammenfassung"],
    start: "das Postfach mit den häufigsten Fragen",
  },
  {
    topic: "vertrieb",
    icon: "sales",
    title: "Vertrieb automatisieren",
    text: "Der Agent bereitet vor, was Ihr Vertrieb sonst von Hand sucht, schreibt und nachhält.",
    points: ["Leads recherchieren und anreichern", "Erstansprache und Nachfassen vorbereiten", "Angebote aus Vorlagen entwerfen"],
    start: "das Nachfassen offener Angebote",
  },
  {
    topic: "daten",
    icon: "data",
    title: "Daten auswerten, auf Störungen reagieren",
    text: "Kennzahlen und Meldungen werden laufend gelesen. Weicht etwas ab, informiert der Agent die richtige Person mit einem Vorschlag.",
    points: ["Berichte automatisch erstellen", "Abweichungen und Störungen früh erkennen", "Maßnahmen nach Ihren Regeln anstoßen"],
    start: "ein Bericht, der heute von Hand entsteht",
  },
  {
    topic: "wissen",
    icon: "book",
    title: "Mitarbeiterwissen zentralisieren",
    text: "Handbücher, Tickets und Dokumente werden zu einer Auskunft, die mit Quelle antwortet.",
    points: ["Antworten aus Ihren eigenen Unterlagen", "Schnellere Einarbeitung neuer Kollegen", "Wissen bleibt, wenn Erfahrene gehen"],
    start: "die Fragen, die immer bei denselben Kollegen landen",
  },
  {
    topic: "lager",
    icon: "warehouse",
    title: "Lagerhallen optimieren",
    text: "Bestände, Lagerplätze und Aufträge im Blick, damit weniger gesucht und umgelagert wird.",
    points: ["Lagerplätze nach Umschlag vorschlagen", "Engpässe und Nachbestellungen früh melden", "Kommissionierwege planen"],
    start: "die Artikel mit dem höchsten Umschlag",
  },
];

const STEPS = [
  { label: "1 · 30 Minuten", title: "Erstgespräch", text: "Wir sprechen über einen konkreten Ablauf und was er Ihr Team heute an Zeit kostet." },
  { label: "2", title: "Prüfung", text: "Daten, Systeme, Datenschutz und Sicherheit: Was ist nötig, was ist erlaubt?" },
  { label: "3", title: "Pilot", text: "Ein Agent für einen Ablauf, mit einer Messgröße, an der Sie den Nutzen sehen." },
  { label: "4", title: "Betrieb oder Übergabe", text: "Wir betreuen den Agenten weiter oder schulen Ihr Team, ihn selbst zu führen." },
] as const;

const COMPETENCES: readonly {
  id: string;
  topic: ContactTopicKey;
  icon: keyof typeof ICON;
  title: string;
  text: string;
  tags: readonly string[];
  action: string;
}[] = [
  {
    id: "ki-schulungen",
    topic: "schulung",
    icon: "school",
    title: "KI-Schulungen",
    text: "Für Teams und Führungskräfte: sicherer Umgang mit KI-Werkzeugen, gute Arbeitsanweisungen, Grenzen und Datenschutz. Unterstützt die Pflicht zur KI-Kompetenz nach Art. 4 der KI-Verordnung.",
    tags: ["Webinar", "Workshop vor Ort", "Führungskräfte"],
    action: "Schulung anfragen",
  },
  {
    id: "cybersecurity",
    topic: "cybersecurity",
    icon: "list",
    title: "Cybersecurity-Anforderungsmanagement",
    text: "Sicherheitsanforderungen aus Gesetzen, Normen und Kundenverträgen erfassen, bewerten und bis zur Umsetzung nachverfolgen, etwa aus NIS2 oder Lieferantenaudits.",
    tags: ["NIS2", "Lieferantenaudits", "Anforderungskatalog"],
    action: "Anforderungen besprechen",
  },
  {
    id: "iso-27001",
    topic: "iso27001",
    icon: "shield",
    title: "ISMS und ISO/IEC 27001",
    text: "Ein Informationssicherheits-Managementsystem aufbauen oder verbessern, auf die Zertifizierung vorbereiten und interne Audits begleiten.",
    tags: ["ISMS-Aufbau", "Zertifizierungsreife", "Interne Audits"],
    action: "Compliance Check anfragen",
  },
];

function topicHref(topic: ContactTopicKey): string {
  return `/contact?thema=${topic}#anfrage`;
}

/**
 * Die Kontaktseite, gebaut wie der Telefonleitfaden: Wer wir sind und was
 * ein Agent abnimmt, die bekannten Einsatzfälle, der Ablauf, die Kompetenzen
 * rund um sichere KI und zuletzt das Formular. Nach einem Anruf führt ein
 * Link mit `?thema=` direkt dorthin, mit dem besprochenen Thema angehakt.
 *
 * Das Formular bleibt ein gewöhnliches HTML-Formular an /api/contact, ohne
 * eigenes JavaScript. Es ist zugleich der Kontaktweg aus dem Impressum;
 * Fragen zu Portal, Daten oder Vertrag laufen über „Etwas anderes“.
 */
export default async function ContactPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const status = statusOf(first(params.status));
  const picked = new Set(topicsFromQuery(params.thema, params.betreff));
  const requestedWay = first(params.weg);
  const way: ContactWay = isContactWay(requestedWay) ? requestedWay : "email";
  const calendarBase = salesCallUrl();
  const calendarHref = calendarBase ? salesCalendarUrl(calendarBase) : null;
  const photoUrl = await salesContactPhotoUrl();

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">Zum Inhalt</a>
      <PublicHeader />

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="kontakt-titel">
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={styles.heroMain}>
              <p className={styles.eyebrow}>KI-Agenten · KI-Schulungen · Informationssicherheit</p>
              <h1 id="kontakt-titel">
                Weniger Routinearbeit. <span>Mit KI-Agenten, die mitarbeiten.</span>
              </h1>
              <p className={styles.lead}>
                Wir sind auf KI-Agenten spezialisiert, die Ihrem Team wiederkehrende Arbeit abnehmen: im Kundenservice, im
                Vertrieb, bei Auswertungen und im Lager. Ist das ein Thema für Sie? Dann sprechen wir 30 Minuten über einen
                Ihrer Abläufe.
              </p>
              <div className={styles.heroActions}>
                {calendarHref ? (
                  <a href={calendarHref} target="_blank" rel="noopener noreferrer" className={actionClass("primary", { className: styles.bigAction })}>
                    Erstgespräch vereinbaren
                  </a>
                ) : (
                  <a href="#anfrage" className={actionClass("primary", { className: styles.bigAction })}>Erstgespräch vereinbaren</a>
                )}
                <Link href="/contact?weg=rueckruf#anfrage" className={actionClass("secondary", { className: styles.bigAction })}>
                  Rückruf anfordern
                </Link>
              </div>
              <p className={styles.small}>Unverbindlich · Antwort in der Regel innerhalb eines Werktags</p>
            </div>

            <aside className={styles.contactCard} aria-label="Ansprechpartner">
              <p className={styles.cardEyebrow}>Wir haben telefoniert?</p>
              <p className={styles.cardText}>
                Dann wählen Sie unten den Bereich, über den wir gesprochen haben, oder buchen Sie direkt einen Termin.
              </p>
              <ContactPerson photoUrl={photoUrl} note="" className={styles.person} />
              <dl className={styles.reach}>
                <dt>Telefon</dt>
                <dd><a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a></dd>
                <dt>E-Mail</dt>
                <dd><a href={`mailto:${IMPRINT_EMAIL}`}>{IMPRINT_EMAIL}</a></dd>
              </dl>
              {calendarHref ? (
                <a href={calendarHref} target="_blank" rel="noopener noreferrer" className={styles.bookButton}>
                  <Icon paths={ICON.calendar} size={18} />
                  Termin direkt buchen · 30 Min.
                </a>
              ) : null}
            </aside>
          </div>
        </section>

        <section id="ki-agenten" className={`${styles.wrap} ${styles.section}`} aria-labelledby="faelle-titel">
          <p className={styles.eyebrow}>Bekannte Einsatzfälle</p>
          <h2 id="faelle-titel">Wo KI-Agenten Ihrem Team Arbeit abnehmen.</h2>
          <p className={styles.sectionLead}>
            Ein Agent erledigt die wiederkehrenden Schritte eines Ablaufs. Entscheidungen und Ausnahmen bleiben bei Ihrem Team.
          </p>
          <div className={styles.cases}>
            {USE_CASES.map((useCase) => (
              <article key={useCase.topic} className={styles.case}>
                <span className={styles.caseIcon}><Icon paths={ICON[useCase.icon]} /></span>
                <h3>{useCase.title}</h3>
                <p>{useCase.text}</p>
                <ul>
                  {useCase.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
                <p className={styles.start}><strong>Typischer Einstieg:</strong> {useCase.start}</p>
                <Link href={topicHref(useCase.topic)} className={styles.textLink}>Darüber sprechen →</Link>
              </article>
            ))}
            <article className={`${styles.case} ${styles.caseDark}`}>
              <span className={styles.caseIcon}><Icon paths={ICON.plus} /></span>
              <h3>Ihr Ablauf ist nicht dabei?</h3>
              <p>Beschreiben Sie ihn in zwei Sätzen. Wir sagen ehrlich, ob sich ein Agent lohnt oder ob ein einfacheres Werkzeug reicht.</p>
              <a href="#anfrage" className={styles.textLink}>Ablauf beschreiben →</a>
            </article>
          </div>
        </section>

        <section className={`${styles.wrap} ${styles.section}`} aria-labelledby="ablauf-titel">
          <h2 id="ablauf-titel">So läuft es ab</h2>
          <ol className={styles.steps}>
            {STEPS.map((step) => (
              <li key={step.title}>
                <span>{step.label}</span>
                <strong>{step.title}</strong>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="informationssicherheit" className={styles.dark} aria-labelledby="kompetenzen-titel">
          <div className={`${styles.wrap} ${styles.section}`}>
            <p className={styles.eyebrow}>Weitere Kompetenzen</p>
            <h2 id="kompetenzen-titel">Damit KI im Unternehmen sicher läuft.</h2>
            <p className={styles.sectionLead}>
              Ein Agent, der mit Kunden- oder Betriebsdaten arbeitet, braucht klare Regeln und ein Team, das damit umgehen kann.
              Beides gehört bei uns dazu.
            </p>
            <div className={styles.competences}>
              {COMPETENCES.map((item) => (
                <article key={item.id} id={item.id} className={styles.competence}>
                  <span className={styles.caseIcon}><Icon paths={ICON[item.icon]} /></span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <ul className={styles.tags}>
                    {item.tags.map((tag) => <li key={tag}>{tag}</li>)}
                  </ul>
                  <Link href={topicHref(item.topic)} className={styles.textLink}>{item.action} →</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.wrap} ${styles.bridge}`} aria-labelledby="selbst-titel">
          <div>
            <h2 id="selbst-titel">Lieber selbst umsetzen?</h2>
            <p>Im Talent Index beschreiben Sie Ihr Projekt und sehen passende KI- und IT-Freelancer, jede Anforderung gegen ihr Profil geprüft.</p>
          </div>
          <Link href="/chat" prefetch={false} className={actionClass("secondary")}>Zum Talent Index</Link>
        </section>

        <section id="anfrage" className={styles.request} aria-labelledby="anfrage-titel">
          <div className={`${styles.wrap} ${styles.requestGrid}`}>
            <form className={styles.form} action="/api/contact" method="post">
              <div>
                <p className={styles.eyebrow}>Anfrage</p>
                <h2 id="anfrage-titel">Ist das ein Thema für Sie?</h2>
                <p className={styles.muted}>Zwei Sätze genügen. Wir melden uns mit einem Terminvorschlag.</p>
              </div>

              {status === "sent" ? (
                <Notice title="Eingegangen" tone="success" role="status">
                  <p>
                    Danke, Ihre Anfrage ist angekommen. {CONTACT_RESPONSE_PROMISE} Eine Bestätigung mit Ihrer Nachricht geht an
                    Ihre E-Mail-Adresse.
                    {calendarHref ? <> Lieber gleich einen Termin? <a href={calendarHref} target="_blank" rel="noopener noreferrer">Termin wählen</a></> : null}
                  </p>
                </Notice>
              ) : null}
              {status === "invalid" ? (
                <Notice title="Bitte prüfen" tone="warning" role="alert">
                  <p>
                    Bitte Name (ab 2 Zeichen) und eine gültige E-Mail-Adresse angeben, dazu ein Thema oder ein paar Worte zu Ihrem
                    Anliegen. Die Telefonnummer darf nur Ziffern, Leerzeichen und + ( ) / - enthalten.
                  </p>
                </Notice>
              ) : null}
              {status === "error" ? (
                <Notice title="Nicht gespeichert" tone="error" role="alert">
                  <p>
                    Die Anfrage konnte gerade nicht entgegengenommen werden. Bitte versuchen Sie es später erneut, rufen Sie an
                    unter <a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a> oder schreiben Sie an{" "}
                    <a href={`mailto:${IMPRINT_EMAIL}`}>{IMPRINT_EMAIL}</a>.
                  </p>
                </Notice>
              ) : null}

              <fieldset className={styles.fieldset}>
                <legend>Worum geht es? <span>Mehrfachauswahl</span></legend>
                <div className={styles.chips}>
                  {CONTACT_TOPICS.map((topic) => (
                    <label key={topic.key} className={styles.chip}>
                      <input type="checkbox" name="topic" value={topic.key} defaultChecked={picked.has(topic.key)} />
                      {topic.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className={styles.fields}>
                <FormField label="Name">
                  <input name="fullName" autoComplete="name" minLength={2} maxLength={100} required />
                </FormField>
                <FormField label="Unternehmen">
                  <input name="company" autoComplete="organization" maxLength={120} />
                </FormField>
                <FormField label="E-Mail-Adresse">
                  <input name="email" type="email" autoComplete="email" maxLength={160} required />
                </FormField>
                <FormField label="Telefon (optional, für den Rückruf)">
                  <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
                </FormField>
              </div>

              <FormField label="Welcher Ablauf soll leichter werden?">
                <textarea
                  name="message"
                  rows={4}
                  maxLength={3000}
                  placeholder="Zum Beispiel: Wir beantworten jeden Tag viele E-Mails zu Lieferterminen und suchen die Antwort in drei Systemen zusammen."
                />
              </FormField>

              <fieldset className={styles.fieldset}>
                <legend>Wie sollen wir uns melden?</legend>
                <div className={styles.ways}>
                  {CONTACT_WAYS.map((option) => (
                    <label key={option.key}>
                      <input type="radio" name="way" value={option.key} defaultChecked={option.key === way} />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className={styles.honeypot} aria-hidden="true">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <CaptchaField />

              <div className={styles.submitRow}>
                <ActionButton type="submit" className={styles.bigAction}>Anfrage senden</ActionButton>
                <span className={styles.small}>Antwort in der Regel innerhalb eines Werktags</span>
              </div>
              <p className={styles.small}>
                Wir verarbeiten Ihre Angaben ausschließlich, um diese Anfrage zu bearbeiten. Rechtsgrundlage ist Art. 6 Abs. 1
                lit. b DSGVO bei einem vertraglichen Anliegen, sonst Art. 6 Abs. 1 lit. f DSGVO. Einzelheiten in Abschnitt 7 der{" "}
                <Link href="/privacy">Datenschutzhinweise</Link>. Bitte senden Sie über dieses Formular keine besonderen
                Kategorien personenbezogener Daten.
              </p>
            </form>

            <aside className={styles.next} aria-label="So geht es weiter">
              <div className={styles.nextBox}>
                <h3>So geht es weiter</h3>
                <ol>
                  <li>Wir lesen Ihre Anfrage am selben oder nächsten Werktag.</li>
                  <li>Sie bekommen einen Rückruf oder einen Terminvorschlag.</li>
                  <li>Im Erstgespräch klären wir, ob sich ein Agent lohnt und wo Sie anfangen.</li>
                </ol>
              </div>
              <div className={styles.nextNote}>
                <strong>Frage zum Portal, zu Daten oder einem Vertrag?</strong>
                <p>Wählen Sie „Etwas anderes“. Das Formular ist weiter der Weg für alle Anliegen.</p>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
