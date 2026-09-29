"use client";

import { useState } from "react";

import { appPath } from "@/lib/app-path";
import {
  PLACEMENT_OUTCOME_LABELS,
  PLACEMENT_OUTCOMES,
  type PlacementOutcome,
} from "@/lib/placement/follow-up-rules";

/**
 * Drei Antworten, eine davon aus der Mail vorgewählt. Gespeichert wird erst
 * mit dem Klick auf „Antwort senden“, nicht schon beim Aufruf der Seite.
 */
export function AnswerForm({
  token,
  preselected,
  role,
}: {
  token: string;
  preselected: PlacementOutcome | null;
  role: "client" | "freelancer";
}) {
  const [answer, setAnswer] = useState<PlacementOutcome | null>(preselected);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function send() {
    if (!answer) return;
    setState("busy");
    try {
      const response = await fetch(appPath("/api/placement/answer"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, answer }),
      });
      setState(response.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="xlegal-warning" role="status">
        <strong>Danke, notiert.</strong>
        <p>
          {answer === "engaged"
            ? role === "client"
              ? "Wir melden uns mit den Einzelheiten zum Vermittlungshonorar."
              : "Danke für die Meldung. Für Sie ändert sich nichts; die Vermittlung bleibt kostenlos."
            : "Sie können dieses Fenster schließen."}
        </p>
      </div>
    );
  }

  return (
    <form
      className="placement-answer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <fieldset>
        <legend>Kam es zur Zusammenarbeit?</legend>
        {PLACEMENT_OUTCOMES.map((value) => (
          <label key={value}>
            <input
              id={`answer-${value}`}
              type="radio"
              name="answer"
              value={value}
              checked={answer === value}
              onChange={() => setAnswer(value)}
            />
            <span>{PLACEMENT_OUTCOME_LABELS[value]}</span>
          </label>
        ))}
      </fieldset>
      {state === "error" ? (
        <p role="alert">Die Antwort konnte gerade nicht gespeichert werden. Bitte versuchen Sie es erneut.</p>
      ) : null}
      <button type="submit" className="booking-continue" disabled={!answer || state === "busy"}>
        {state === "busy" ? "Wird gesendet …" : "Antwort senden"}
      </button>
    </form>
  );
}
