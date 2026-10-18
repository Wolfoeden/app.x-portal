import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";

import { CaptchaField } from "@/components/CaptchaField";
import { ContactPerson } from "@/components/marketing/ContactPerson";
import { CalendarLink } from "@/components/public/CalendarLink";
import { PublicFooter, PublicFrame, PublicHeader } from "@/components/public/PublicChrome";
import { ActionButton, FormField, Notice } from "@/components/ui/Primitives";
import { actionClass } from "@/components/ui/actions";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CONTACT_TOPICS, topicsFromQuery, type ContactTopicKey } from "@/lib/contact/topics";
import { CONTACT_RESPONSE_PROMISE, IMPRINT_EMAIL } from "@/lib/legal/policy";
import { SALES_CALENDAR_PATH, isSalesCallEntry } from "@/lib/sales/sales-call-model";
import { readSalesCallToken, salesCallUrl } from "@/lib/sales/sales-call";
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
function Icon({ paths, size = 20 }: { paths: readonly string[]; size?: number }) {
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
  school: ["M1.5 6 8 3l6.5 3L8 9z", "M4 7.3V11c1 1.3 2.4 2 4 2s3-.7 4-2V7.3"],
  list: ["M3.5 2.5h9v11h-9z", "M5.5 5.5h5M5.5 8h5M5.5 10.5h3"],
  shield: ["M8 1.5 13.5 3.5v4c0 3.3-2.3 5.8-5.5 7-3.2-1.2-5.5-3.7-5.5-7v-4z", "m5.5 8 1.8 1.8L10.5 6.5"],
} as const;

/** Was wir übernehmen: eine Zeile je Angebot, in der Reihenfolge des Leitfadens. */
const OFFERS: readonly { topic: ContactTopicKey; icon: keyof typeof ICON; title: string; text: string }[] = [
  { topic: "kundenservice", icon: "chat", title: "Kundenservice", text: "Anfragen sortieren und Standardfragen sofort beantworten." },
  { topic: "vertrieb", icon: "sales", title: "Vertrieb", text: "Leads recherchieren, Nachfassen und Angebote vorbereiten." },
  { topic: "daten", icon: "data", title: "Daten und Störungen", text: "Berichte erstellen, Abweichungen früh melden." },
  { topic: "wissen", icon: "book", title: "Mitarbeiterwissen", text: "Antworten aus Ihren eigenen Unterlagen, mit Quelle." },
  { topic: "lager", icon: "warehouse", title: "Lager und Logistik", text: "Lagerplätze, Engpässe und Kommissionierwege." },
  { topic: "schulung", icon: "school", title: "KI-Schulungen", text: "Für Teams und Führungskräfte, passend zu Art. 4 KI-Verordnung." },
  { topic: "cybersecurity", icon: "list", title: "Cybersecurity-Anforderungen", text: "Aus NIS2, Normen und Verträgen erfassen und nachverfolgen." },
  { topic: "iso27001", icon: "shield", title: "ISMS und ISO 27001", text: "Aufbauen, Zertifizierung vorbereiten, Audits begleiten." },
];

/**
 * Der Kopf passt sich an, wenn jemand über „KI-Schulungen“ oder
 * „Cybersecurity & ISO 27001“ im Menü kommt (`?thema=`). So steht oben, was
 * gesucht war, und niemand landet mitten auf der Seite. „Gespräch
 * vereinbaren“ auf den Seiten zum Talent Index kommt mit `thema=freelancer`.
 */
const HEROES: Record<"agent" | "schulung" | "security" | "freelancer", { eyebrow: string; title: string; accent: string; lead: string }> = {
  agent: {
    eyebrow: "KI-Agenten · KI-Schulungen · Informationssicherheit",
    title: "Weniger Routinearbeit.",
    accent: "Mit KI-Agenten, die mitarbeiten.",
    lead: "Wir bauen KI-Agenten, die Ihrem Team wiederkehrende Arbeit abnehmen. Ist das ein Thema für Sie?",
  },
  schulung: {
    eyebrow: "KI-Schulungen",
    title: "KI sicher im Alltag nutzen.",
    accent: "Schulungen für Teams und Führungskräfte.",
    lead: "Als Webinar oder vor Ort, passend zur Pflicht aus Art. 4 der KI-Verordnung.",
  },
  security: {
    eyebrow: "Cybersecurity · ISMS · ISO 27001",
    title: "Informationssicherheit,",
    accent: "die Audits standhält.",
    lead: "Anforderungen aus NIS2 und Kundenverträgen im Griff, ISMS aufgebaut, Zertifizierung vorbereitet.",
  },
  freelancer: {
    eyebrow: "Talent Index · Freelancer finden",
    title: "Sprechen wir über Ihr Projekt.",
    accent: "Passende Freelancer, provisionsfrei.",
    lead: "In 30 Minuten wissen Sie, ob wir passende KI-, Software- oder Digital-Freelancer für Ihr Vorhaben haben.",
  },
};

function heroFor(topic: ContactTopicKey | undefined) {
  if (topic === "schulung") return HEROES.schulung;
  if (topic === "cybersecurity" || topic === "iso27001") return HEROES.security;
  if (topic === "freelancer") return HEROES.freelancer;
  return HEROES.agent;
}

/**
 * Die Kontaktseite: oben, worum es geht, und wie man uns erreicht; darunter
 * die Angebote in einer Zeile je Kachel und das Formular. Bewusst kurz
 * (Rückmeldung vom 14.10.: zu viel Text, zu viele Häkchen).
 *
 * Zugleich die Seite hinter jedem „Gespräch vereinbaren“: Seit 14.10.2026
 * gibt es dafür keine zweite Seite mehr (/gespraech leitet hierher). Der
 * Aufruf zählt im Umsatzweg als „Kontaktseite aufgerufen“, mit `?von=` als
 * Herkunft; der Kalenderknopf öffnet Calendly direkt und zählt den Klick
 * nebenher. Nur „Termin wählen“ nach dem Absenden geht über /contact/termin,
 * das den Kalender mit Name und Adresse aus der Anfrage vorausfüllt.
 *
 * Das Formular bleibt ein gewöhnliches HTML-Formular an /api/contact, ohne
 * eigenes JavaScript. Es ist zugleich der Kontaktweg aus dem Impressum;
 * Fragen zu Portal, Daten oder Vertrag laufen über „Etwas anderes“.
 */
export default async function ContactPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const status = statusOf(first(params.status));
  const topic = topicsFromQuery(params.thema, params.betreff)[0];
  const hero = heroFor(topic);
  // Nach dem Absenden: Kalender mit Name und Adresse aus der Anfrage.
  const token = status === "sent" ? first(params.t) : undefined;
  const bookingQuery = token && readSalesCallToken(token) ? `t=${encodeURIComponent(token)}` : "von=contact";
  const bookingHref = salesCallUrl() ? `${SALES_CALENDAR_PATH}?${bookingQuery}` : null;
  const user = status ? null : await getCurrentUser().catch(() => null);

  if (!status) {
    const via = first(params.von);
    after(() =>
      writeAuditEvent({
        actorUserId: user?.id ?? null,
        action: "sales_call_viewed",
        targetType: "sales_call",
        outcome: "success",
        metadata: {
          via: isSalesCallEntry(via) ? via : "direct",
          topic: topic ?? null,
          account: !user ? "none" : user.isAnonymous ? "guest" : "registered",
        },
      }).catch(() => undefined),
    );
  }

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">Zum Inhalt</a>
      <PublicHeader framed />

      <PublicFrame>
      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="kontakt-titel">
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={styles.heroMain}>
              <p className={styles.eyebrow}>{hero.eyebrow}</p>
              <h1 id="kontakt-titel">
                {hero.title} <span>{hero.accent}</span>
              </h1>
              <p className={styles.lead}>{hero.lead}</p>
              <div className={styles.heroActions}>
                <CalendarLink entry="contact" className={actionClass("primary", { className: styles.bigAction })}>
                  Gespräch vereinbaren
                </CalendarLink>
                <a href="#anfrage" className={actionClass("secondary", { className: styles.bigAction })}>
                  Anfrage schreiben
                </a>
              </div>
            </div>

            <aside className={styles.contactCard} aria-label="Ansprechpartner">
              <ContactPerson photoUrl={SALES_CONTACT.photo.small} note="" />
              <dl className={styles.reach}>
                <dt>Telefon</dt>
                <dd><a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a></dd>
                <dt>E-Mail</dt>
                <dd><a href={`mailto:${IMPRINT_EMAIL}`}>{IMPRINT_EMAIL}</a></dd>
              </dl>
            </aside>
          </div>
        </section>

        <section className={`${styles.wrap} ${styles.section}`} aria-labelledby="angebot-titel">
          <h2 id="angebot-titel">Was wir für Sie übernehmen</h2>
          <ul className={styles.offers}>
            {OFFERS.map((offer) => (
              <li key={offer.topic}>
                <Link href={`/contact?thema=${offer.topic}#anfrage`} className={styles.offer}>
                  <span className={styles.offerIcon}><Icon paths={ICON[offer.icon]} /></span>
                  <strong>{offer.title}</strong>
                  <span>{offer.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section id="anfrage" className={styles.request} aria-labelledby="anfrage-titel">
          <div className={styles.wrap}>
            <form className={styles.form} action="/api/contact" method="post">
              <div>
                <h2 id="anfrage-titel">Ist das ein Thema für Sie?</h2>
                <p className={styles.muted}>Zwei Sätze genügen. {CONTACT_RESPONSE_PROMISE}</p>
              </div>

              {status === "sent" ? (
                <Notice title="Eingegangen" tone="success" role="status">
                  <p>
                    Danke, Ihre Anfrage ist angekommen. Eine Bestätigung geht an Ihre E-Mail-Adresse.
                    {bookingHref ? <> Lieber gleich einen Termin? <a href={bookingHref} target="_blank" rel="noopener noreferrer nofollow">Termin wählen</a></> : null}
                  </p>
                </Notice>
              ) : null}
              {status === "invalid" ? (
                <Notice title="Bitte prüfen" tone="warning" role="alert">
                  <p>Bitte Thema, Name und eine gültige E-Mail-Adresse angeben. Die Telefonnummer darf nur Ziffern, Leerzeichen und + ( ) / - enthalten.</p>
                </Notice>
              ) : null}
              {status === "error" ? (
                <Notice title="Nicht gespeichert" tone="error" role="alert">
                  <p>
                    Die Anfrage konnte gerade nicht entgegengenommen werden. Rufen Sie an unter{" "}
                    <a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a> oder schreiben Sie an{" "}
                    <a href={`mailto:${IMPRINT_EMAIL}`}>{IMPRINT_EMAIL}</a>.
                  </p>
                </Notice>
              ) : null}

              <div className={styles.fields}>
                <FormField label="Thema">
                  {/* `key`: Ein Klick auf eine Kachel ändert nur `?thema=`; ohne neuen
                      Schlüssel behielte das Feld seine alte Auswahl. */}
                  <select key={topic ?? "none"} name="topic" required defaultValue={topic ?? ""}>
                    <option value="" disabled>Bitte wählen</option>
                    {CONTACT_TOPICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </FormField>
                <FormField label="Name">
                  <input name="fullName" autoComplete="name" minLength={2} maxLength={100} required />
                </FormField>
                <FormField label="E-Mail-Adresse">
                  <input name="email" type="email" autoComplete="email" maxLength={160} required />
                </FormField>
                <FormField label="Telefon (für einen Rückruf)">
                  <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
                </FormField>
                <FormField label="Unternehmen (optional)">
                  <input name="company" autoComplete="organization" maxLength={120} />
                </FormField>
              </div>

              <FormField label="Worum geht es? (optional)">
                <textarea name="message" rows={3} maxLength={3000} />
              </FormField>

              <div className={styles.honeypot} aria-hidden="true">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <CaptchaField />

              <div className={styles.submitRow}>
                <ActionButton type="submit" className={styles.bigAction}>Anfrage senden</ActionButton>
                <p className={styles.small}>
                  Mit Telefonnummer rufen wir zurück, sonst antworten wir per E-Mail. Ihre Angaben nutzen wir nur für diese
                  Anfrage (<Link href="/privacy#kontakt">Datenschutzhinweise, Abschnitt 7</Link>).
                </p>
              </div>
            </form>
          </div>
        </section>
      </main>
      </PublicFrame>

      <PublicFooter framed />
    </div>
  );
}
