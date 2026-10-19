"use client";

import Image from "next/image";
import { useState } from "react";

import { matchCountLabel, type DemoScenario } from "@/lib/marketing/live-demo";

import { CheckIcon } from "./icons";
import styles from "./start.module.css";

/**
 * Die Live-Demo der Startseite: drei Beispielanfragen zum Umschalten, darunter
 * was die KI erkannt hat und die passenden Profile. Ohne JavaScript steht die
 * erste da; das Umschalten ist nur Zustand im Browser, es geht nichts an den
 * Server.
 */
export function LiveDemo({ scenarios, profiles }: { scenarios: readonly DemoScenario[]; profiles: number | null }) {
  const [active, setActive] = useState(scenarios[0]!.key);
  const scenario = scenarios.find((item) => item.key === active) ?? scenarios[0]!;
  const steps = ["Anfrage gelesen", "Anforderungen erkannt", profiles ? `${profiles} Profile geprüft` : "Alle Profile geprüft"];

  return (
    <div>
      <div className={styles.tabs} role="group" aria-label="Beispielanfragen">
        {scenarios.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={item.key === scenario.key}
            aria-controls="live-demo-panel"
            onClick={() => setActive(item.key)}
          >
            {item.tab}
          </button>
        ))}
      </div>
      <div id="live-demo-panel" aria-live="polite">
        <div className={styles.request}>
          <p>„{scenario.request}“</p>
          <dl>
            {scenario.facts.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </div>
        <div className={styles.analysis}>
          <ol>
            {steps.map((step) => (
              <li key={step}><CheckIcon size={12} />{step}</li>
            ))}
          </ol>
          <p>
            <span>Muss:</span>
            {scenario.must.map((item) => <span key={item} className={styles.chip}>{item}</span>)}
            <span>Wunsch:</span>
            {scenario.nice.map((item) => <span key={item} className={styles.chip} data-kind="nice">{item}</span>)}
          </p>
          <p><strong>{matchCountLabel(scenario.people.length)}</strong> · sortiert nach Passung</p>
        </div>
        <ul className={styles.people}>
          {scenario.people.map((person) => (
            <li key={person.name}>
              <article className={styles.card}>
                <div className={styles.cardHead}>
                  <Image src={person.avatar} alt="" width={48} height={48} unoptimized />
                  <div>
                    <p className={styles.cardName}>
                      <strong>{person.name}</strong>
                      {person.verified ? (
                        <span className={styles.verified}><CheckIcon size={12} />geprüft</span>
                      ) : (
                        <span className={styles.unverified}>Angaben laut Profil</span>
                      )}
                    </p>
                    <p className={styles.cardRole}>{person.role}</p>
                  </div>
                </div>
                <p className={styles.cardMeta}>
                  <span>{person.where}</span>
                  <strong>{person.rate}</strong>
                </p>
                <p className={styles.cardMeta}>
                  <span className={styles.available} data-available={person.available ? "true" : undefined}>{person.availability}</span>
                </p>
                <ul className={styles.chips} aria-label="Anforderungen">
                  {person.hits.map((hit) => (
                    <li key={hit.label} className={styles.chip} data-state={hit.state}>{hit.label}</li>
                  ))}
                </ul>
                <p className={styles.why}><strong>Warum:</strong> {person.why}</p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
