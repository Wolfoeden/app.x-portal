/* eslint-disable @next/next/no-img-element -- das Foto liegt als kleine Datei in passender Größe unter /public. */
import Link from "next/link";

import { CalendarLink } from "@/components/public/CalendarLink";
import { DEMO_SCENARIOS } from "@/lib/marketing/live-demo";
import { JsonLd } from "@/components/JsonLd";
import { HOME_SERVICES } from "@/lib/marketing/home-services";
import { AUTOMATION_OFFER } from "@/lib/marketing/offers";
import { PROOF_SOURCES } from "@/lib/marketing/proof-sources";
import { phoneHref, SALES_CONTACT } from "@/lib/sales/sales-contact-model";
import { homeServicesStructuredData } from "@/lib/structured-data";

import { ArrowIcon, PhoneIcon } from "./icons";
import { InboxPreview } from "./InboxPreview";
import { LiveDemo } from "./LiveDemo";
import styles from "./start.module.css";

const STEPS = [
  { title: "Erstgespräch", text: "30 Minuten, kostenlos. Wir finden den Ablauf, bei dem KI Ihnen am meisten Zeit spart." },
  { title: `Umsetzung ${AUTOMATION_OFFER.price}`, text: "Ein Ablauf, fester Einstiegspreis, kurzes Zeitfenster bis zur Abgabe." },
  { title: "Weiter auf Stundenbasis", text: "Wir kennen Ihr Unternehmen dann. Jede weitere Automatisierung geht schneller." },
] as const;

/**
 * Die Startseite (Entwurf „Klarsicht“, 19.10.2026). Oben steht, was man kauft
 * und was es kostet, daneben ein Postfach als Beispiel dafür. Darunter folgen
 * die Belege, die vier Leistungen mit Preis, die Live-Demo des Talent Index
 * mit echten Profilen, der Ablauf und der Termin. Ein Ziel: das Erstgespräch.
 */
export function HomeLanding({ profiles }: { profiles: number | null }) {
  const { small, large } = SALES_CONTACT.photo;
  return (
    <main id="main-content" tabIndex={-1} className={styles.main}>
      <JsonLd data={homeServicesStructuredData()} />
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={`${styles.wrap} ${styles.heroInner}`}>
          <a href="#leistungen" className={styles.pill}>
            <span>Neu</span>
            {AUTOMATION_OFFER.name} {AUTOMATION_OFFER.price} <ArrowIcon />
          </a>
          <h1 id="home-title">KI-Agenten für Ihre Routine.</h1>
          <p className={styles.lead}>Anfragen, Angebote, Auswertungen: Wir automatisieren einen Ablauf in Ihrem Unternehmen. In kurzer Zeit umgesetzt, danach auf Stundenbasis.</p>
          <div className={styles.actions}>
            <CalendarLink entry="hero" className={styles.buttonPrimary}>Erstgespräch buchen</CalendarLink>
            <a href="#demo" className={styles.buttonSecondary}>Live-Demo ansehen</a>
          </div>
          <p className={styles.person}>
            <img src={small} alt="" width={32} height={32} />
            <span>30 Minuten mit {SALES_CONTACT.name} · kostenlos · unverbindlich</span>
          </p>
          <InboxPreview />
        </div>
      </section>

      <section className={`${styles.wrap} ${styles.proof}`} aria-label="Belege">
        <p>Thesen aus meinen Studienarbeiten zu KI im Unternehmen, belegt durch Studien von</p>
        <ul>
          {PROOF_SOURCES.map((source) => (
            <li key={source.name}>
              <a href={source.href} target="_blank" rel="noopener noreferrer" title={source.title}>{source.name.toUpperCase()}</a>
            </li>
          ))}
        </ul>
      </section>

      <section id="leistungen" className={styles.services} aria-labelledby="services-title">
        <div className={`${styles.wrap} ${styles.sectionPad}`}>
          <div className={styles.sectionHead}>
            <h2 id="services-title" className={styles.h2}>Leistungen und Preise.</h2>
            <p>Sie sehen den Preis, bevor Sie anrufen. Im Erstgespräch klären wir, was davon bei Ihnen am meisten bringt.</p>
          </div>
          <ol className={styles.serviceList}>
            {HOME_SERVICES.map((service, index) => (
              <li key={service.title}>
                <Link href={service.href} prefetch={false} className={styles.service} data-highlight={service.highlight ? "true" : undefined}>
                  <span className={styles.serviceNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.serviceTitle}>{service.title}</span>
                  <span className={styles.serviceText}>{service.text}</span>
                  <span className={styles.servicePrice}>
                    {service.price}
                    <span className={styles.serviceArrow} aria-hidden="true"><ArrowIcon size={18} /></span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="demo" aria-labelledby="demo-title" className={`${styles.wrap} ${styles.sectionPad}`}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Live-Demo · Talent Index</p>
            <h2 id="demo-title" className={styles.h2}>Anfrage rein. Passende Leute raus.</h2>
          </div>
          <p>{profiles ? `Echte, freigegebene Profile: ${profiles} sind im Talent Index.` : "Echte, freigegebene Profile aus dem Talent Index."} Namen gekürzt, Bilder gezeichnet.</p>
        </div>
        <LiveDemo scenarios={DEMO_SCENARIOS} profiles={profiles} />
        <p className={styles.demoFoot}>
          <span>Dieselbe Technik bauen wir für Ihre Abläufe.</span>
          <Link href="/fuer-unternehmen" prefetch={false}>Mit eigenem Projekt ausprobieren <ArrowIcon /></Link>
        </p>
      </section>

      <section id="ablauf" className={styles.process} aria-labelledby="steps-title">
        <div className={`${styles.wrap} ${styles.sectionPad} ${styles.processGrid}`}>
          <div>
            <h2 id="steps-title" className={styles.h2}>Drei Schritte. Ein Ansprechpartner.</h2>
            <CalendarLink entry="process" className={styles.buttonPrimary}>Erstgespräch buchen</CalendarLink>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span aria-hidden="true">{index + 1}</span>
                <div><strong>{step.title}</strong><p>{step.text}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="termin" className={styles.closing} aria-labelledby="closing-title">
        <div className={`${styles.wrap} ${styles.sectionPad} ${styles.closingGrid}`}>
          <div className={styles.closingCopy}>
            <h2 id="closing-title" className={styles.h2}>30 Minuten. Danach wissen Sie, wo KI bei Ihnen Zeit spart.</h2>
            <p>Kostenlos und unverbindlich, per Telefon oder Video.</p>
            <div className={styles.closingActions}>
              <CalendarLink entry="closing" className={styles.buttonLight}>Erstgespräch buchen</CalendarLink>
              <a href={phoneHref(SALES_CONTACT.phone)} className={styles.buttonOutline}><PhoneIcon />{SALES_CONTACT.phone}</a>
            </div>
          </div>
          <figure id="ueber" className={styles.closingPerson}>
            <img src={large} alt={SALES_CONTACT.name} width={140} height={156} loading="lazy" decoding="async" />
            <figcaption>
              <blockquote>„In 30 Minuten zeige ich Ihnen, wo KI bei Ihnen Zeit spart. Und wo nicht.“</blockquote>
              <strong>{SALES_CONTACT.name}</strong>
              <span>XPORTAL · nimmt sich die Zeit selbst</span>
            </figcaption>
          </figure>
        </div>
      </section>
    </main>
  );
}
