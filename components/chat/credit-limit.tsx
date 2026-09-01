"use client";

import { useState, type FormEvent } from "react";

import { appPath } from "@/lib/app-path";

import { IconCheck, IconInfo } from "../icons";

/**
 * Die selbst gesetzte Obergrenze.
 *
 * Enterprise wird nach Verbrauch abgerechnet. Wer das bucht, will vorher
 * wissen, wie hoch die Rechnung hoechstens ausfaellt — und zwar selbst
 * einstellbar, ohne anzurufen.
 *
 * Ein leeres Feld heisst "kein Limit" und ist etwas anderes als eine 0. Die
 * Null waere ein Konto, das nichts mehr darf; wer das Feld nur leert, meint
 * fast immer das Gegenteil. Beides bleibt deshalb unterscheidbar.
 */
export function CreditLimitSetting({
  limit,
  maxCredits,
  maxEuro,
  onSaved,
}: {
  limit: number | null;
  maxCredits: number;
  maxEuro: number;
  onSaved: (limit: number | null) => void;
}) {
  const [value, setValue] = useState(limit === null ? "" : String(limit));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state === "saving") return;

    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maxCredits)) {
      setError(`Bitte eine ganze Zahl zwischen 0 und ${maxCredits} — oder das Feld leeren.`);
      setState("error");
      return;
    }

    setState("saving");
    setError(null);
    try {
      const response = await fetch(appPath("/api/ai/credits"), {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: parsed }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Das Limit konnte nicht gespeichert werden.");
      }
      setState("saved");
      onSaved(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das Limit konnte nicht gespeichert werden.");
      setState("error");
    }
  };

  return (
    <form className="credit-limit" onSubmit={submit}>
      <label htmlFor="credit-limit-input">Eigenes Limit</label>
      <div className="credit-limit-row">
        <input
          id="credit-limit-input"
          type="number"
          inputMode="numeric"
          min={0}
          max={maxCredits}
          step={1}
          value={value}
          placeholder={`kein Limit (bis ${maxCredits})`}
          onChange={(event) => {
            setValue(event.target.value);
            setState("idle");
          }}
        />
        <button type="submit" disabled={state === "saving"}>
          {state === "saving" ? "Wird gespeichert …" : "Speichern"}
        </button>
      </div>

      {/* Die Zahl allein sagt niemandem, was sie kostet. */}
      <p className="credit-limit-hint">
        <span aria-hidden="true"><IconInfo size={11} /></span>
        {maxCredits} Credits kosten höchstens {maxEuro} €. Ein niedrigeres Limit
        senkt die Rechnung entsprechend — abgerechnet wird nur, was Sie
        tatsächlich verbrauchen.
      </p>

      <p className="credit-limit-hint">
        Feld leer lassen heißt: kein eigenes Limit, es gilt Ihr volles
        Kontingent.
      </p>

      {state === "saved" ? (
        <p className="credit-limit-status is-ok" role="status">
          <span aria-hidden="true"><IconCheck size={11} /></span> Gespeichert.
        </p>
      ) : null}
      {error ? (
        <p className="credit-limit-status is-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
