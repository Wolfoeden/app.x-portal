"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { appPath } from "@/lib/app-path";

import styles from "./demand.module.css";

/**
 * Der Knopf an einem Nachfrageprofil.
 *
 * Er steht in der Spalte „Empfehlung", weil er die Empfehlung ausführt: Wo
 * „Beschaffen" steht, soll man beschaffen können, ohne die Seite zu wechseln.
 *
 * Zwei Klicks, nicht einer. Der erste öffnet die Wahl — mit Adressen? mit
 * Versand? —, der zweite löst aus. Ein einzelner Klick, der Menschen
 * anschreibt, wäre zu leicht danebengegriffen.
 */

type RunResult = {
  found: number;
  addressable: number;
  imported: number;
  addressed: number;
  invited: number;
  alreadyRanToday: boolean;
  skippedSkills: string[];
  people: {
    name: string;
    email: string | null;
    addressVerdict: string | null;
    invite: string | null;
    note: string | null;
  }[];
};

const VERDICT_LABELS: Record<string, string> = {
  usable: "Adresse gefunden",
  usable_team: "Firmenadresse, ihm gehörend",
  vorhanden: "Adresse lag schon vor",
  third_party_mailbox: "nur fremdes Postfach",
  wrong_purpose: "nur Postfach für anderen Zweck",
  foreign_domain: "Adresse auf fremder Domain",
  no_site_found: "keine eigene Seite gefunden",
  no_imprint: "kein Impressum gefunden",
  no_address: "Impressum ohne Adresse",
  no_usable_address: "keine benutzbare Adresse",
  provider_unavailable: "Suche nicht erreichbar",
};

const INVITE_LABELS: Record<string, string> = {
  sent: "eingeladen",
  failed: "Versand gescheitert",
  suppressed: "Widerspruch",
  skipped: "nicht eingeladen",
};

export function SourcingButton({
  profileKey,
  profileLabel,
  skills,
  workMode,
  location,
}: {
  profileKey: string;
  profileLabel: string;
  skills: string[];
  workMode: "remote" | "on_site" | "hybrid" | "unknown";
  location: string | null;
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [adressen, setAdressen] = useState(true);
  const [versand, setVersand] = useState(false);
  const [ergebnis, setErgebnis] = useState<RunResult | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function starten() {
    setLaeuft(true);
    setFehler(null);
    setErgebnis(null);
    try {
      const antwort = await fetch(appPath("/api/admin/sourcing/run"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          profileKey,
          profileLabel,
          skills: skills.slice(0, 8),
          workMode,
          location,
          resolveAddresses: adressen,
          sendInvites: versand,
        }),
      });
      const nutzlast = (await antwort.json()) as RunResult & { error?: string };
      if (!antwort.ok) {
        setFehler(nutzlast.error ?? `Fehler ${antwort.status}.`);
        return;
      }
      setErgebnis(nutzlast);
      router.refresh();
    } catch {
      setFehler("Die Verbindung ist abgebrochen.");
    } finally {
      setLaeuft(false);
    }
  }

  if (!offen) {
    return (
      <button
        className={styles.sourcingTrigger}
        onClick={() => setOffen(true)}
        type="button"
      >
        Beschaffen
      </button>
    );
  }

  return (
    <div className={styles.sourcingPanel}>
      <label>
        <input
          checked={adressen}
          disabled={laeuft}
          onChange={(event) => setAdressen(event.target.checked)}
          type="checkbox"
        />
        Adressen suchen <span>(~5 ct je Person)</span>
      </label>
      <label>
        <input
          checked={versand}
          disabled={laeuft}
          onChange={(event) => setVersand(event.target.checked)}
          type="checkbox"
        />
        Einladungen verschicken
      </label>

      <div className={styles.sourcingActions}>
        <button disabled={laeuft} onClick={starten} type="button">
          {laeuft ? "läuft…" : versand ? "Suchen und anschreiben" : "Suchen"}
        </button>
        <button
          disabled={laeuft}
          onClick={() => {
            setOffen(false);
            setErgebnis(null);
            setFehler(null);
          }}
          type="button"
        >
          Schließen
        </button>
      </div>

      {laeuft ? (
        <p className={styles.sourcingNote}>
          Sucht bei freelancermap, dann je Person eine Adresse. Das dauert eine
          knappe Minute.
        </p>
      ) : null}

      {fehler ? <p className={styles.sourcingError}>{fehler}</p> : null}

      {ergebnis ? (
        <div className={styles.sourcingResult}>
          <p>
            {ergebnis.found} gefunden · {ergebnis.addressable} ansprechbar ·{" "}
            {ergebnis.imported} neu angelegt · {ergebnis.addressed} mit Adresse
            {versand ? ` · ${ergebnis.invited} eingeladen` : ""}
          </p>
          {ergebnis.alreadyRanToday ? (
            <p>Für dieses Profil lief heute schon ein Lauf — kein zweiter Eintrag.</p>
          ) : null}
          {ergebnis.skippedSkills.length > 0 ? (
            <p>Ohne Liste bei der Quelle: {ergebnis.skippedSkills.join(", ")}</p>
          ) : null}
          <ul>
            {ergebnis.people.map((person) => (
              <li key={`${person.name}-${person.email ?? "ohne"}`}>
                <strong>{person.name}</strong>
                {person.email ? ` · ${person.email}` : ""}
                {person.addressVerdict
                  ? ` · ${VERDICT_LABELS[person.addressVerdict] ?? person.addressVerdict}`
                  : ""}
                {person.invite ? ` · ${INVITE_LABELS[person.invite] ?? person.invite}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
