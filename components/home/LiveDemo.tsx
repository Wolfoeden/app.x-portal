"use client";

import { useState } from "react";

import { matchCountLabel, type DemoScenario } from "@/lib/marketing/live-demo";

import { DemoPersonCard } from "./DemoPersonCard";
import { CheckIcon } from "./icons";
import styles from "./home.module.css";

/**
 * Die Live-Demo oben auf der Startseite: ein Fenster des Talent Index mit
 * drei Beispielanfragen zum Umschalten. Ohne JavaScript steht die erste da;
 * das Umschalten ist nur Zustand im Browser, es geht nichts an den Server.
 */
export function LiveDemo({ scenarios, profiles }: { scenarios: readonly DemoScenario[]; profiles: number | null }) {
  const [active, setActive] = useState(scenarios[0]!.key);
  const scenario = scenarios.find((item) => item.key === active) ?? scenarios[0]!;
  const steps = ["Anfrage gelesen", "Anforderungen erkannt", profiles ? `${profiles} Profile geprüft` : "Alle Profile geprüft"];

  return (
    <div className={styles.window}>
      <div className={styles.windowBar}>
        <span className={styles.windowDots} aria-hidden="true"><span /><span /><span /></span>
        <strong>XPORTAL · Talent Index</strong>
        <span className={styles.liveBadge}><span aria-hidden="true" />Live-Demo · echte Profile</span>
      </div>
      <div className={styles.tabs}>
        <span>Probieren Sie es aus:</span>
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
      <div id="live-demo-panel" className={styles.demoGrid} aria-live="polite">
        <div className={styles.demoInput}>
          <div>
            <p className={styles.label}>Anfrage</p>
            <p className={styles.request}>„{scenario.request}“</p>
          </div>
          <div className={styles.recognized}>
            <p className={styles.label}>Von der KI erkannt</p>
            <div className={styles.reqRow}>
              <span>Muss</span>
              {scenario.must.map((item) => <span key={item} className={styles.chipMust}>{item}</span>)}
            </div>
            <div className={styles.reqRow}>
              <span>Wünschenswert</span>
              {scenario.nice.map((item) => <span key={item} className={styles.chipNice}>{item}</span>)}
            </div>
            <dl className={styles.facts}>
              {scenario.facts.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </div>
        </div>
        <div className={styles.demoResults}>
          <ol className={styles.steps}>
            {steps.map((step) => (
              <li key={step}><span aria-hidden="true"><CheckIcon size={12} /></span>{step}</li>
            ))}
          </ol>
          <p className={styles.count}>{matchCountLabel(scenario.people.length)} <span>· sortiert nach Passung</span></p>
          {scenario.people.map((person) => <DemoPersonCard key={person.name} person={person} />)}
        </div>
      </div>
    </div>
  );
}
