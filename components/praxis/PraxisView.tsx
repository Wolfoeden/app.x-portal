"use client";

/* eslint-disable @next/next/no-img-element -- das Foto kommt über die eigene Profilbild-Route, schon in passender Größe. */
import { useState } from "react";

import { DemoPersonCard } from "@/components/home/DemoPersonCard";
import { AnswerVisual, InboxVisual } from "@/components/home/MiniVisuals";
import { ProofLinks } from "@/components/home/ProofLinks";
import { ArrowIcon, CheckIcon, PhoneIcon } from "@/components/home/icons";
import home from "@/components/home/home.module.css";
import { appPath } from "@/lib/app-path";
import { DEMO_SCENARIOS } from "@/lib/marketing/live-demo";
import { joinGerman, praxisInterestLabel, type PraxisCase, type PraxisInterest } from "@/lib/marketing/praxis-cases";
import { calendarBookingUrl, type CallSlot } from "@/lib/sales/call-slots-model";
import { phoneHref, SALES_CONTACT } from "@/lib/sales/sales-contact-model";

import styles from "./praxis.module.css";

type Props = {
  cases: readonly PraxisCase[];
  slots: readonly CallSlot[];
  calendarBase: string | null;
  token: string | null;
  photoUrl: string;
};

/** Zählt Interesse und Kalenderklicks; ein Fehler ändert nichts an der Seite. */
function track(body: Record<string, unknown>) {
  void fetch(appPath("/api/praxis/event"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function CaseVisual({ kind }: { kind: PraxisCase["visual"] }) {
  if (kind === "monitor") {
    return <InboxVisual rows={[{ text: "Datenquelle Anlage 3", tag: "geprüft 14:05", done: true }, { text: "Störung an Anlage 2", tag: "Ticket angelegt" }, { text: "Wartung fällig", tag: "Service informiert" }]} />;
  }
  if (kind === "answer") {
    return <AnswerVisual question="Fehler E-217 an Anlage 2, was tun?" answer="Sensor an Achse 2 prüfen, dann Referenzfahrt." source="Servicehandbuch, S. 88" />;
  }
  const scenario = DEMO_SCENARIOS[0]!;
  return (
    <div className={home.window}>
      <div className={home.windowBar}>
        <span className={home.windowDots} aria-hidden="true"><span /><span /><span /></span>
        <strong>XPORTAL · Talent Index</strong>
      </div>
      <div className={styles.miniDemo}>
        <p className={home.request}>„{scenario.request}“</p>
        <p className={styles.miniChips}>
          {scenario.must.map((item) => <span key={item} className={home.chipMust}>{item}</span>)}
          {scenario.nice.map((item) => <span key={item} className={home.chipNice}>{item}</span>)}
        </p>
        {scenario.people.slice(0, 2).map((person) => <DemoPersonCard key={person.name} person={person} compact />)}
      </div>
    </div>
  );
}

/**
 * Die Praxisseite: für alle Firmen gleich, die nach einem Telefonat die Mail
 * mit dem Link bekommen. Oben die Terminkarte mit drei freien Zeiten aus dem
 * Kalender, darunter drei Beispiele mit Quelle, jedes mit „Das will ich
 * auch“. Was angeklickt ist, steht im Termin (als Notiz im Kalender) und im
 * Admin. Gebucht wird im Kalender selbst, in einem neuen Tab.
 */
export function PraxisView({ cases, slots, calendarBase, token, photoUrl }: Props) {
  const [picked, setPicked] = useState<readonly PraxisInterest[]>([]);
  const [slot, setSlot] = useState<string | null>(slots[0]?.start ?? null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [opened, setOpened] = useState(false);

  const labels = picked.map(praxisInterestLabel);
  const interestText = labels.length ? `Wir sprechen über: ${joinGerman(labels)}.` : "Markieren Sie unten, was Sie interessiert.";
  const note = labels.length ? `Interesse: ${joinGerman(labels)}` : undefined;
  const bookingHref = calendarBookingUrl(calendarBase, { start: slot, name, email, note });
  const anyTimeHref = calendarBookingUrl(calendarBase, { name, email, note });

  function toggle(key: PraxisInterest) {
    const next = picked.includes(key) ? picked.filter((item) => item !== key) : [...picked, key];
    setPicked(next);
    track({ t: token, kind: "interest", interests: next });
  }

  function calendarOpened(withSlot: boolean) {
    setOpened(true);
    track({ t: token, kind: "calendar", slot: withSlot, interests: picked });
  }

  return (
    <>
      <section className={styles.hero} aria-labelledby="praxis-title">
        <div className={`${home.wrap} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.heroPerson}>
              <img src={photoUrl} alt="" width={52} height={52} />
              <span><strong>{SALES_CONTACT.name}</strong> · XPORTAL<br />Danke für unser Telefonat.</span>
            </p>
            <div>
              <p className={styles.greeting}>Guten Tag,</p>
              <h1 id="praxis-title">so arbeiten andere Unternehmen schon mit KI.</h1>
            </div>
            <p className={styles.lead}>Drei Beispiele aus der Praxis. Im Erstgespräch zeigen wir, was davon in Ihrem Unternehmen Zeit spart.</p>
            <ul className={styles.caseChips}>
              {cases.map((item) => (
                <li key={item.mark}><a href="#beispiele"><strong>{item.mark}</strong><span>{praxisInterestLabel(item.interest)}</span></a></li>
              ))}
            </ul>
          </div>

          <aside id="termin" className={styles.booking} aria-labelledby="booking-title">
            <div className={styles.bookingHead}>
              <img src={photoUrl} alt="" width={48} height={48} />
              <div>
                <p id="booking-title"><strong>Erstgespräch mit {SALES_CONTACT.name}</strong></p>
                <p>30 Minuten · Telefon oder Video · kostenlos</p>
              </div>
            </div>
            {slots.length ? (
              <div className={styles.slots} role="radiogroup" aria-label="Freie Zeiten">
                {slots.map((item) => (
                  <button key={item.start} type="button" role="radio" aria-checked={slot === item.start} onClick={() => setSlot(item.start)}>
                    {item.label} Uhr
                  </button>
                ))}
              </div>
            ) : null}
            {anyTimeHref ? (
              <a className={styles.anyTime} href={anyTimeHref} target="_blank" rel="noopener noreferrer nofollow" onClick={() => calendarOpened(false)}>
                {slots.length ? "Andere Zeit wählen" : "Alle freien Zeiten ansehen"}
              </a>
            ) : null}
            <div className={styles.fields}>
              <label>Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Vor- und Nachname" maxLength={100} /></label>
              <label>E-Mail<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="name@firma.de" maxLength={160} /></label>
            </div>
            <p className={styles.interest}>{interestText}</p>
            {bookingHref ? (
              <a className={home.buttonPrimary} href={bookingHref} target="_blank" rel="noopener noreferrer nofollow" onClick={() => calendarOpened(Boolean(slot))}>
                {slots.length ? "Termin bestätigen" : "Termin wählen"}
              </a>
            ) : null}
            {opened ? (
              <p className={styles.opened} role="status"><CheckIcon size={14} /> Der Kalender ist in einem neuen Tab offen. Dort bestätigen Sie den Termin mit einem Klick.</p>
            ) : null}
            <p className={styles.callInstead}>Lieber anrufen? <a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a></p>
          </aside>
        </div>
      </section>

      <section id="beispiele" className={styles.cases} aria-labelledby="cases-title">
        <div className={home.wrap}>
          <div className={styles.casesHead}>
            <p className={home.eyebrow}>Aus der Praxis</p>
            <h2 id="cases-title">Drei Beispiele aus der Praxis</h2>
          </div>
          <div className={styles.caseList}>
            {cases.map((item) => {
              const on = picked.includes(item.interest);
              return (
                <article key={item.mark} className={styles.case}>
                  <div className={styles.caseMain}>
                    <p className={styles.caseMark}><strong>{item.mark}</strong><span>{item.tag}</span></p>
                    <h3>{item.headline}</h3>
                    {item.stats ? (
                      <dl className={styles.stats}>
                        {item.stats.map((stat) => <div key={stat.label}><dt>{stat.value}</dt><dd>{stat.label}</dd></div>)}
                      </dl>
                    ) : null}
                    {item.uses ? (
                      <div className={styles.uses}>
                        <p>{item.uses.label}</p>
                        <ul>{item.uses.items.map((use) => <li key={use}><CheckIcon size={13} />{use}</li>)}</ul>
                      </div>
                    ) : null}
                    {item.quote ? (
                      <figure className={styles.quote}>
                        <blockquote>{item.quote.text}</blockquote>
                        <figcaption>{item.quote.by}</figcaption>
                      </figure>
                    ) : null}
                    <p className={styles.source}>
                      <a href={item.source.href} {...(item.source.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{item.source.label} <ArrowIcon /></a>
                    </p>
                  </div>
                  <div className={styles.caseSide}>
                    <CaseVisual kind={item.visual} />
                    <div className={styles.transfer}>
                      <p>Übertragen auf Ihr Unternehmen</p>
                      <p>{item.transfer}</p>
                    </div>
                    <button type="button" className={styles.interestButton} aria-pressed={on} onClick={() => toggle(item.interest)}>
                      {on ? <><CheckIcon size={14} /> Vorgemerkt fürs Gespräch</> : "Das will ich auch"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <p className={styles.casesNote}>Fremde Fälle mit Quelle, unser eigener live zum Ausprobieren.</p>
        </div>
      </section>

      <section className={styles.person} aria-label="Ihr Ansprechpartner">
        <div className={`${home.wrap} ${styles.personGrid}`}>
          <img src={photoUrl} alt={SALES_CONTACT.name} width={120} height={120} />
          <div className={styles.personQuote}>
            <p>„Im Erstgespräch zeige ich Ihnen, was davon in Ihrem Unternehmen Zeit spart.“</p>
            <p><strong>{SALES_CONTACT.name}</strong> · XPORTAL · <a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a></p>
          </div>
          <div className={styles.personProof}>
            <p>Thesen aus meinen Studienarbeiten, belegt durch</p>
            <ProofLinks small />
          </div>
        </div>
      </section>

      <section className={home.closing} aria-label="Termin">
        <div className={home.wrap}>
          <div className={home.closingCard}>
            <p className={styles.closingText}>Ich freue mich auf unser Gespräch.</p>
            <div className={home.closingActions}>
              <a href="#termin" className={home.buttonWhite}>Termin wählen</a>
              <a href={phoneHref(SALES_CONTACT.phone)} className={home.closingPhone}><PhoneIcon />{SALES_CONTACT.phone}</a>
            </div>
          </div>
          <p className={styles.footnote}>Diese Seite ist nicht in Suchmaschinen gelistet.</p>
        </div>
      </section>
    </>
  );
}
