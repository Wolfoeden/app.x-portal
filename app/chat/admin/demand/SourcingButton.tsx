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
 * **Die Schleife läuft hier, nicht auf dem Server.** Der erste Anlauf rief
 * eine Route, die alles in einem Zug erledigen sollte — fünfundvierzig bis
 * fünfundachtzig Sekunden. Die Plattform beendet eine synchrone Funktion
 * lange vorher; der Knopf blieb hängen und hinterließ nichts. Jetzt arbeitet
 * ein Aufruf zwölf Sekunden, meldet was offen ist, und dieser Knopf ruft ihn
 * erneut. Dasselbe Muster wie `PrepareAllButton` bei den Leads.
 *
 * Zwei Klicks zum Auslösen, nicht einer: Der erste öffnet die Wahl, der zweite
 * startet. Ein einzelner Klick, der Menschen anschreibt, wäre zu leicht
 * danebengegriffen.
 */

/** Sicherheitsnetz gegen eine Schleife, die nicht kleiner wird. */
const MAX_SCHRITTE = 40;

type Cursor = {
  phase: "source" | "address" | "invite" | "done";
  pendingSkills: string[];
  skippedSkills: string[];
  pendingIds: string[];
  found: number;
  addressable: number;
  imported: number;
  addressed: number;
  invited: number;
  searchCalls: number;
  freeAddressHits: number;
};

type Person = {
  name: string;
  email: string | null;
  addressVerdict: string | null;
  invite: string | null;
  note: string | null;
};

type StepAntwort = {
  cursor: Cursor;
  done: boolean;
  didThisStep: string;
  people: Person[];
  importSkipped: { reason: string; profileUrl: string; detail?: string }[];
  error?: string;
  detail?: string;
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

const PHASE_LABELS: Record<Cursor["phase"], string> = {
  source: "sucht Profile",
  address: "sucht Adressen",
  invite: "verschickt Einladungen",
  done: "fertig",
};

export function SourcingButton({
  profileKey,
  profileLabel,
  skills,
  workMode,
  location,
  searches,
  uniqueSeekers,
}: {
  profileKey: string;
  profileLabel: string;
  skills: string[];
  workMode: "remote" | "on_site" | "hybrid" | "unknown";
  location: string | null;
  searches: number;
  uniqueSeekers: number;
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [adressen, setAdressen] = useState(true);
  const [versand, setVersand] = useState(false);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [schritte, setSchritte] = useState(0);
  const [phase, setPhase] = useState<Cursor["phase"] | null>(null);
  const [leute, setLeute] = useState<Person[]>([]);
  const [uebersprungen, setUebersprungen] = useState<StepAntwort["importSkipped"]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  async function starten() {
    setLaeuft(true);
    setFehler(null);
    setLeute([]);
    setUebersprungen([]);
    setCursor(null);
    setSchritte(0);

    let stand: Cursor | null = null;
    try {
      for (let runde = 1; runde <= MAX_SCHRITTE; runde += 1) {
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
            searches,
            uniqueSeekers,
            resolveAddresses: adressen,
            sendInvites: versand,
            cursor: stand,
          }),
        });
        const nutzlast = (await antwort.json()) as StepAntwort;

        if (!antwort.ok) {
          // Der Fehlertext steht jetzt in der Antwort. Vorher gab es „Fehler
          // 500" und im Protokoll nichts — und damit keine Chance zu sehen,
          // woran es lag.
          setFehler(
            [nutzlast.error ?? `Fehler ${antwort.status}.`, nutzlast.detail]
              .filter(Boolean)
              .join(" — "),
          );
          return;
        }

        stand = nutzlast.cursor;
        setCursor(nutzlast.cursor);
        setPhase(nutzlast.cursor.phase);
        setSchritte(runde);
        if (nutzlast.people.length) {
          setLeute((bisher) => [...bisher, ...nutzlast.people]);
        }
        if (nutzlast.importSkipped.length) {
          setUebersprungen((bisher) => [...bisher, ...nutzlast.importSkipped]);
        }

        if (nutzlast.done) break;
      }
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
        Adressen suchen <span>(~1 ct je 6 Personen)</span>
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
            setCursor(null);
            setFehler(null);
            setLeute([]);
          }}
          type="button"
        >
          Schließen
        </button>
      </div>

      {laeuft && phase ? (
        <p className={styles.sourcingNote}>
          Schritt {schritte} · {PHASE_LABELS[phase]}
          {cursor && cursor.pendingSkills.length > 0
            ? ` · noch ${cursor.pendingSkills.length} Skills`
            : ""}
          {cursor && cursor.pendingIds.length > 0
            ? ` · noch ${cursor.pendingIds.length} Personen`
            : ""}
        </p>
      ) : null}

      {fehler ? <p className={styles.sourcingError}>{fehler}</p> : null}

      {cursor && !laeuft ? (
        <div className={styles.sourcingResult}>
          <p>
            {cursor.found} gefunden · {cursor.addressable} ansprechbar ·{" "}
            {cursor.imported} neu angelegt · {cursor.addressed} mit Adresse
            {versand ? ` · ${cursor.invited} eingeladen` : ""}
          </p>
          <p>
            {schritte} Schritte · {cursor.searchCalls} bezahlte Suchen ·{" "}
            {cursor.freeAddressHits} Adressen ohne Websuche
          </p>
          {cursor.skippedSkills.length > 0 ? (
            <p>Ohne Liste bei der Quelle: {cursor.skippedSkills.join(", ")}</p>
          ) : null}
          {uebersprungen.length > 0 ? (
            <p>
              Nicht angelegt:{" "}
              {uebersprungen
                .map((wert) => wert.detail ?? wert.reason)
                .slice(0, 3)
                .join(" · ")}
            </p>
          ) : null}
          <ul>
            {leute.map((person, index) => (
              <li key={`${person.name}-${index}`}>
                <strong>{person.name}</strong>
                {person.email ? ` · ${person.email}` : ""}
                {person.addressVerdict
                  ? ` · ${VERDICT_LABELS[person.addressVerdict] ?? person.addressVerdict}`
                  : ""}
                {person.invite
                  ? ` · ${INVITE_LABELS[person.invite] ?? person.invite}`
                  : ""}
                {person.note ? ` · ${person.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
