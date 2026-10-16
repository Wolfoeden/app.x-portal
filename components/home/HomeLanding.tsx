/* eslint-disable @next/next/no-img-element -- das Foto kommt über die eigene Profilbild-Route, schon in passender Größe. */
import Link from "next/link";

import { DEMO_SCENARIOS } from "@/lib/marketing/live-demo";
import { SALES_CALENDAR_PATH } from "@/lib/sales/sales-call-links";
import { phoneHref, SALES_CONTACT } from "@/lib/sales/sales-contact-model";

import { AgentDiagram } from "./AgentDiagram";
import { ArrowIcon, PhoneIcon } from "./icons";
import { LiveDemo } from "./LiveDemo";
import { ProofLinks } from "./ProofLinks";
import { ServiceTiles } from "./ServiceTiles";
import styles from "./home.module.css";

const FALLBACK_PHOTO = "/api/freelancer/avatar-image/c314d7c4-4428-45ac-ba54-1a657b9f6b62/avatar-84a397c000177b632748345e59baa596.jpg";

function CallButton({ entry, inverted = false }: { entry: "hero" | "closing" | "process"; inverted?: boolean }) {
  return (
    <a
      href={`${SALES_CALENDAR_PATH}?von=${entry}`}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={inverted ? styles.buttonWhite : styles.buttonPrimary}
    >
      Erstgespräch buchen
    </a>
  );
}

/**
 * Die Startseite (Entwurf 3, 16.10.2026). Wer nach dem Anruf von Roman
 * Dering hierher kommt, soll in Sekunden sehen, dass die Technik echt ist:
 * oben die Live-Demo des eigenen Talent Index mit echten Profilen, darunter
 * dieselbe Technik für die eigenen Abläufe, der Ansprechpartner mit Belegen,
 * die vier Leistungen und der Termin. Wenig Text, ein Ziel: das
 * Erstgespräch.
 */
export function HomeLanding({ profiles, photoUrl }: { profiles: number | null; photoUrl: string | null }) {
  const photo = photoUrl ?? FALLBACK_PHOTO;
  return (
    <main id="main-content" tabIndex={-1} className={styles.main}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.wrap}>
          <div className={styles.heroCopy}>
            <a href="#demo" className={styles.livePill}>
              <span className={styles.livePillBadge}><span aria-hidden="true" />Live</span>
              {profiles ? `Demo mit ${profiles} echten Profilen` : "Demo mit echten Profilen"} <ArrowIcon />
            </a>
            <h1 id="home-title">Mit KI effizienter arbeiten.</h1>
            <p className={styles.heroLead}>Sehen Sie live, was unsere KI kann. Dasselbe bauen wir für Ihr Unternehmen.</p>
            <div className={styles.heroActions}>
              <CallButton entry="hero" />
              <a href="#demo" className={styles.buttonSecondary}>Live-Demo ansehen ↓</a>
            </div>
            <p className={styles.personLine}>
              <img src={photo} alt="" width={40} height={40} />
              <span>{SALES_CONTACT.name}, Ihr Ansprechpartner · <a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a></span>
            </p>
          </div>
          <div id="demo" className={styles.demo}>
            <LiveDemo scenarios={DEMO_SCENARIOS} profiles={profiles} />
            <p className={styles.demoNote}>
              <span>Echte, freigegebene Profile aus unserem Talent Index. Namen gekürzt, Bilder gezeichnet.</span>
              <Link href="/fuer-unternehmen" prefetch={false}>Selbst ausprobieren <ArrowIcon /></Link>
            </p>
          </div>
        </div>
      </section>

      <section className={styles.bridge} aria-labelledby="bridge-title">
        <div className={styles.wrap}>
          <div className={styles.centerHead}>
            <p className={styles.eyebrow}>Und bei Ihnen?</p>
            <h2 id="bridge-title">Dieselbe Technik für Ihre Abläufe.</h2>
          </div>
          <AgentDiagram />
          <div className={styles.centerActions}>
            <CallButton entry="process" />
            <span>30 Minuten · kostenlos · unverbindlich</span>
          </div>
        </div>
      </section>

      <section id="ueber" className={styles.trust} aria-label="Ihr Ansprechpartner">
        <div className={`${styles.wrap} ${styles.trustGrid}`}>
          <img src={photo} alt={SALES_CONTACT.name} className={styles.trustPhoto} width={340} height={380} />
          <div className={styles.trustCopy}>
            <blockquote>„In 30 Minuten zeige ich Ihnen, wo KI bei Ihnen Zeit spart. Und wo nicht.“</blockquote>
            <p className={styles.trustName}><strong>{SALES_CONTACT.name}</strong> · XPORTAL · <a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a></p>
            <div className={styles.trustProof}>
              <p>Thesen aus meinen Studienarbeiten zu KI im Unternehmen, belegt durch</p>
              <ProofLinks />
            </div>
          </div>
        </div>
      </section>

      <section id="leistungen" className={styles.services} aria-labelledby="services-title">
        <div className={styles.wrap}>
          <h2 id="services-title">Was wir für Sie umsetzen</h2>
          <ServiceTiles profiles={profiles} />
        </div>
      </section>

      <section id="termin" className={styles.closing} aria-labelledby="closing-title">
        <div className={styles.wrap}>
          <div className={styles.closingCard}>
            <div className={styles.closingCopy}>
              <h2 id="closing-title">30 Minuten. Danach wissen Sie, wo KI bei Ihnen Zeit spart.</h2>
              <p>Kostenlos und unverbindlich, per Telefon oder Video.</p>
              <div className={styles.closingActions}>
                <CallButton entry="closing" inverted />
                <a href={phoneHref(SALES_CONTACT.phone)} className={styles.closingPhone}><PhoneIcon />{SALES_CONTACT.phone}</a>
              </div>
            </div>
            <figure className={styles.closingPerson}>
              <img src={photo} alt={SALES_CONTACT.name} width={112} height={112} />
              <figcaption><strong>{SALES_CONTACT.name}</strong><span>nimmt sich die Zeit selbst</span></figcaption>
            </figure>
          </div>
        </div>
      </section>
    </main>
  );
}
