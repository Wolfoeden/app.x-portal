import type { Metadata } from "next";
import Link from "next/link";

import { ContactPerson } from "@/components/marketing/ContactPerson";
import { PublicFooter, PublicFrame, PublicHeader } from "@/components/public/PublicChrome";
import { actionClass } from "@/components/ui/actions";
import { IMPRINT_EMAIL } from "@/lib/legal/policy";
import { phoneHref, SALES_CONTACT } from "@/lib/sales/sales-contact-model";

import styles from "./danke.module.css";

/**
 * Die Seite nach einer Terminbuchung (19.10.2026). Calendly leitet nach der
 * Buchung hierher weiter, ohne Name oder Adresse in der Adresse. Google Ads
 * zählt den Aufruf von /danke als Conversion „Termin gebucht“ — das geht ohne
 * eigenen Code, weil das Google-Tag nach Einwilligung auf allen öffentlichen
 * Seiten läuft. Statisch und nicht in der Suche.
 */
export const metadata: Metadata = {
  title: "Termin gebucht | XPORTAL",
  description: "Ihr Erstgespräch mit XPORTAL ist gebucht.",
  robots: { index: false, follow: false },
};

const PREPARATION = [
  "Welche wiederkehrende Arbeit soll wegfallen? Ein Beispiel aus dem Alltag genügt.",
  "Welche Systeme sind beteiligt, etwa E-Mail, ERP, CRM oder Ablage?",
  "Wenn vorhanden: zwei, drei typische Dokumente oder Anfragen als Beispiel.",
] as const;

export default function ThanksPage() {
  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">Zum Inhalt</a>
      <PublicHeader framed />
      <PublicFrame>
        <main id="main-content" tabIndex={-1} className={styles.main}>
          <section className={styles.wrap} aria-labelledby="danke-titel">
            <div className={styles.grid}>
              <div className={styles.copy}>
                <p className={styles.eyebrow}>Termin gebucht</p>
                <h1 id="danke-titel">Danke. Wir sprechen uns bald.</h1>
                <p className={styles.lead}>
                  Die Bestätigung mit dem Link zum Gespräch kommt per E-Mail. In 30 Minuten
                  klären wir, wo KI bei Ihnen Zeit spart und was die erste Automatisierung kostet.
                </p>
                <div className={styles.prep}>
                  <h2>So holen Sie das meiste heraus</h2>
                  <ul>
                    {PREPARATION.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div className={styles.actions}>
                  <Link href="/#demo" prefetch={false} className={actionClass("primary")}>Live-Demo ansehen</Link>
                  <Link href="/" prefetch={false} className={actionClass("secondary")}>Zur Startseite</Link>
                </div>
              </div>
              <aside className={styles.card} aria-label="Ansprechpartner">
                <ContactPerson photoUrl={SALES_CONTACT.photo.small} note="" />
                <p className={styles.small}>Termin verschieben oder etwas vorab klären?</p>
                <dl className={styles.reach}>
                  <dt>Telefon</dt>
                  <dd><a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a></dd>
                  <dt>E-Mail</dt>
                  <dd><a href={`mailto:${IMPRINT_EMAIL}`}>{IMPRINT_EMAIL}</a></dd>
                </dl>
              </aside>
            </div>
          </section>
        </main>
      </PublicFrame>
      <PublicFooter framed />
    </div>
  );
}
