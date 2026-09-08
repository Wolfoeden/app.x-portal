"use client";

import { useState } from "react";

import type { WantedProfile } from "@/lib/sourcing/wanted-profile";

import styles from "./demand.module.css";

/**
 * Der Knopf an einem Nachfrageprofil.
 *
 * Hier stand einmal ein Beschaffungslauf, der bei freelancermap suchte. Das
 * war ein Missverständnis meinerseits: Gewollt ist nicht, dass die
 * Nachfrageseite selbst Menschen sucht, sondern dass sie **beschreibt**, wer
 * gesucht werden soll. Die Suche danach ist ein eigener Weg.
 *
 * Deshalb rechnet dieser Knopf nichts nach und ruft nichts auf. Das
 * Wunschprofil steht bereits fest, sobald die Seite geladen ist — es entsteht
 * aus denselben Zahlen, die in der Zeile daneben stehen. Ein Klick klappt es
 * auf, ein zweiter legt den Text in die Zwischenablage.
 */

const ARBEITSFORM: Record<WantedProfile["workMode"], string> = {
  remote: "remote",
  on_site: "vor Ort",
  hybrid: "hybrid",
  unknown: "nicht festgelegt",
};

export function WantedProfileButton({
  profil,
  text,
}: {
  profil: WantedProfile;
  /** Dieselbe Beschreibung als Fließtext, fertig zum Kopieren. */
  text: string;
}) {
  const [offen, setOffen] = useState(false);
  const [kopiert, setKopiert] = useState(false);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2_000);
    } catch {
      // Ohne Zwischenablage-Recht bleibt der Text im Kasten sichtbar und
      // lässt sich von Hand markieren. Eine Fehlermeldung hülfe nicht.
      setKopiert(false);
    }
  }

  if (!offen) {
    return (
      <button
        className={styles.sourcingTrigger}
        onClick={() => setOffen(true)}
        type="button"
      >
        Wunschprofil
      </button>
    );
  }

  return (
    <div className={styles.sourcingPanel}>
      <p className={styles.wantedRole}>{profil.roleTitle}</p>

      <dl className={styles.wantedList}>
        <div>
          <dt>Muss können</dt>
          <dd>{profil.mustHave.join(", ") || "—"}</dd>
        </div>
        {profil.niceToHave.length > 0 ? (
          <div>
            <dt>Von Vorteil</dt>
            <dd>{profil.niceToHave.join(", ")}</dd>
          </div>
        ) : null}
        <div>
          <dt>Arbeitsform</dt>
          <dd>
            {ARBEITSFORM[profil.workMode]}
            {profil.location ? ` · ${profil.location}` : ""}
          </dd>
        </div>
        {profil.languages.length > 0 ? (
          <div>
            <dt>Sprache</dt>
            <dd>{profil.languages.join(", ")}</dd>
          </div>
        ) : null}
        {profil.criticalGaps.length > 0 ? (
          <div>
            <dt>Daran scheiterte es</dt>
            <dd>{profil.criticalGaps.join(", ")}</dd>
          </div>
        ) : null}
        <div>
          <dt>Belegte Nachfrage</dt>
          <dd>{profil.evidence}</dd>
        </div>
      </dl>

      <div className={styles.sourcingActions}>
        <button onClick={kopieren} type="button">
          {kopiert ? "Kopiert" : "Text kopieren"}
        </button>
        <button onClick={() => setOffen(false)} type="button">
          Schließen
        </button>
      </div>
    </div>
  );
}
