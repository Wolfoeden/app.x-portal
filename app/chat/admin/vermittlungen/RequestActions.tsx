"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { appPath } from "@/lib/app-path";

import styles from "./vermittlungen.module.css";

type Outcome = {
  freelancerReachable?: boolean;
  freelancerNotified?: boolean;
  clientNotified?: boolean;
  hasCalendar?: boolean;
};

/**
 * Vorstellen oder ablehnen, mit einer Bestätigung im selben Feld.
 *
 * Beides verschickt Mails und lässt sich nicht zurücknehmen. Ein zweiter
 * Klick auf „Wirklich vorstellen“ ist der bewusste Moment dafür.
 */
export function RequestActions({
  requestId,
  freelancerName,
  freelancerReachable,
}: {
  requestId: string;
  freelancerName: string;
  freelancerReachable: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"approve" | "decline" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  async function run(action: "approve" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(appPath(`/api/admin/introductions/${requestId}`), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "approve" ? { action } : { action, reason: reason.trim() || null }),
      });
      const payload = (await response.json().catch(() => ({}))) as Outcome & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? `Fehler ${response.status}.`);
        return;
      }
      if (action === "approve") {
        setOutcome(
          [
            payload.clientNotified ? "Kunde per Mail vorgestellt." : "Mail an den Kunden ging nicht raus.",
            payload.freelancerNotified
              ? `${freelancerName} hat die Anfrage per Mail.`
              : `${freelancerName} hat keine Mail bekommen. Bitte selbst informieren.`,
          ].join(" "),
        );
      } else {
        setOutcome(payload.clientNotified ? "Abgelehnt, Kunde informiert." : "Abgelehnt. Mail an den Kunden ging nicht raus.");
      }
      setConfirm(null);
      router.refresh();
    } catch {
      setError("Die Aktion ist abgebrochen.");
    } finally {
      setBusy(false);
    }
  }

  if (outcome) return <p className={styles.outcome} role="status">{outcome}</p>;

  return (
    <div className={styles.actions}>
      {confirm === "decline" ? (
        <label className={styles.reason}>
          <span>Grund für den Kunden (optional)</span>
          <input
            id={`decline-reason-${requestId}`}
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            placeholder="z. B. Ist bis Dezember ausgebucht."
          />
        </label>
      ) : null}
      {confirm === "approve" && !freelancerReachable ? (
        <p className={styles.warning}>
          {freelancerName} hat keine E-Mail im System. Informieren Sie ihn vorher selbst,
          der Kunde bekommt die Vorstellung sofort.
        </p>
      ) : null}
      <div className={styles.buttons}>
        {confirm ? (
          <>
            <button
              type="button"
              className={confirm === "approve" ? styles.primary : styles.danger}
              disabled={busy}
              onClick={() => void run(confirm)}
            >
              {busy ? "Wird gesendet …" : confirm === "approve" ? "Wirklich vorstellen" : "Wirklich ablehnen"}
            </button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirm(null)}>
              Abbrechen
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.primary} onClick={() => setConfirm("approve")}>
              Vorstellen
            </button>
            <button type="button" className={styles.secondary} onClick={() => setConfirm("decline")}>
              Ablehnen
            </button>
          </>
        )}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
