"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { appPath } from "@/lib/app-path";
import { PLACEMENT_TERMS, placementFeeCents } from "@/lib/placement/config";
import type { PlacementRequestRow } from "@/lib/placement/requests";

import styles from "./vermittlungen.module.css";

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

const FEE_STATUS: Record<NonNullable<NonNullable<PlacementRequestRow["engagement"]>["feeStatus"]>, string> = {
  open: "Honorar offen",
  invoiced: "Rechnung gestellt",
  paid: "Bezahlt",
  waived: "Erlassen",
};

async function post(requestId: string, body: Record<string, unknown>) {
  const response = await fetch(appPath(`/api/admin/introductions/${requestId}`), {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) return null;
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error ?? `Fehler ${response.status}.`;
}

/**
 * Nach der Vorstellung: Beauftragung erfassen, daraus das Honorar, dann
 * Rechnung und Zahlung. Der Betrag wird hier nur vorgerechnet; maßgeblich ist
 * die Berechnung auf dem Server mit der Fassung, der der Kunde zugestimmt hat.
 */
export function EngagementPanel({ row }: { row: PlacementRequestRow }) {
  const router = useRouter();
  const [dayRate, setDayRate] = useState("");
  const [projectDays, setProjectDays] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = Number.parseFloat(dayRate.replace(",", "."));
  const days = Number.parseInt(projectDays, 10);
  const preview = Number.isFinite(rate) && Number.isFinite(days) ? placementFeeCents(Math.round(rate * 100), days) : 0;

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const problem = await post(row.id, body);
    setBusy(false);
    if (problem) setError(problem);
    else router.refresh();
  }

  const engagement = row.engagement;
  if (engagement) {
    return (
      <div className={styles.engagement}>
        <dl className={styles.facts}>
          <div><dt>Vermittlungshonorar</dt><dd className={styles.fee}>{euro.format((engagement.feeMinor ?? 0) / 100)} netto</dd></div>
          <div><dt>Tagessatz · Tage</dt><dd>{euro.format((engagement.dayRateMinor ?? 0) / 100)} · {engagement.projectDays ?? "–"} Tage</dd></div>
          <div><dt>Start</dt><dd>{engagement.startsOn ? date.format(new Date(`${engagement.startsOn}T00:00:00`)) : "–"}</dd></div>
          <div>
            <dt>Rechnung</dt>
            <dd>
              <span className={styles.status} data-status={engagement.feeStatus === "paid" ? "completed" : "manual_review"}>
                {engagement.feeStatus ? FEE_STATUS[engagement.feeStatus] : "–"}
              </span>
              {engagement.invoiceReference ? ` Nr. ${engagement.invoiceReference}` : ""}
            </dd>
          </div>
        </dl>
        {engagement.feeStatus === "open" ? (
          <div className={styles.inline}>
            <label className={styles.reason}>
              <span>Rechnungsnummer</span>
              <input id={`invoice-${row.id}`} value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} />
            </label>
            <button type="button" className={styles.primary} disabled={busy || !reference.trim()} onClick={() => void act({ action: "invoiced", reference: reference.trim() })}>
              Rechnung gestellt
            </button>
          </div>
        ) : null}
        {engagement.feeStatus === "open" || engagement.feeStatus === "invoiced" ? (
          <div className={styles.buttons}>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void act({ action: "paid" })}>
              Als bezahlt markieren
            </button>
          </div>
        ) : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <form
      className={styles.engagement}
      onSubmit={(event) => {
        event.preventDefault();
        void act({ action: "record_engagement", dayRate: rate, projectDays: days, startsOn });
      }}
    >
      <p className={styles.formTitle}>
        {row.outcome === "no_engagement"
          ? "Kein Auftrag festgehalten. Kam es doch dazu, hier erfassen:"
          : "Beauftragung erfassen"}
      </p>
      <div className={styles.inline}>
        <label className={styles.reason}>
          <span>Tagessatz netto (€)</span>
          <input id={`rate-${row.id}`} inputMode="decimal" value={dayRate} onChange={(event) => setDayRate(event.target.value)} required />
        </label>
        <label className={styles.reason}>
          <span>Projekttage, erste {PLACEMENT_TERMS.feeMonths} Monate</span>
          <input id={`days-${row.id}`} inputMode="numeric" value={projectDays} onChange={(event) => setProjectDays(event.target.value)} required />
        </label>
        <label className={styles.reason}>
          <span>Start</span>
          <input id={`start-${row.id}`} type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} required />
        </label>
      </div>
      <p className={styles.preview}>
        {preview > 0
          ? `Honorar voraussichtlich ${euro.format(preview / 100)} netto (${PLACEMENT_TERMS.feePercent} %, höchstens ${PLACEMENT_TERMS.maxFeeDays} Tage).`
          : "Tagessatz und Tage eintragen, dann steht hier das Honorar."}
      </p>
      <div className={styles.buttons}>
        <button type="submit" className={styles.primary} disabled={busy || preview <= 0 || !startsOn}>
          {busy ? "Wird gespeichert …" : "Beauftragung speichern"}
        </button>
        {row.outcome !== "no_engagement" ? (
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => void act({ action: "no_engagement" })}>
            Kein Auftrag
          </button>
        ) : null}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </form>
  );
}

/** Die fälligen Nachfragen per Klick verschicken. */
export function FollowUpsButton({ due }: { due: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(appPath("/api/admin/introductions/follow-ups"), {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => ({}))) as { sent?: number; failed?: number; error?: string };
      setResult(
        response.ok
          ? `${payload.sent ?? 0} Mails verschickt${payload.failed ? `, ${payload.failed} nicht zugestellt` : ""}.`
          : payload.error ?? `Fehler ${response.status}.`,
      );
      router.refresh();
    } catch {
      setResult("Der Versand ist abgebrochen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.followUps}>
      <span>
        {due
          ? `${due} Nachfrage${due === 1 ? "" : "n"} fällig (14 und 45 Tage nach der Vorstellung)`
          : "Keine Nachfrage fällig"}
      </span>
      <button type="button" className={styles.primary} disabled={busy || due === 0} onClick={() => void send()}>
        {busy ? "Wird verschickt …" : "Nachfragen senden"}
      </button>
      {result ? <span role="status">{result}</span> : null}
    </div>
  );
}
