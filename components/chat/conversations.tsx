"use client";

import { useState } from "react";

import { appPath } from "@/lib/app-path";

import type { ConversationAnswer, ConversationItem } from "../chat-contract";
import { IconArrowRight, IconCheck } from "../icons";

/**
 * „Gespräche“: was aus jeder Anfrage geworden ist, und die Frage, ob es zur
 * Beauftragung kam.
 *
 * Kunde und Freelancer sehen dieselbe Anfrage aus ihrer Sicht. Die Frage
 * erscheint 14 Tage nach der Vorstellung (und nach 45 Tagen noch einmal, wenn
 * es noch offen war). Den Stand kann jede Seite auch vorher melden.
 */

export const CONVERSATION_ANSWERS: ReadonlyArray<{ value: ConversationAnswer; label: string }> = [
  { value: "engaged", label: "Ja, beauftragt" },
  { value: "talking", label: "Noch im Gespräch" },
  { value: "no_engagement", label: "Nein" },
];

const ANSWER_LABELS: Readonly<Record<ConversationAnswer, string>> = {
  engaged: "Ja, beauftragt",
  talking: "Noch im Gespräch",
  no_engagement: "Keine Zusammenarbeit",
};

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function day(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

function question(item: ConversationItem): string {
  return item.role === "client"
    ? `Haben Sie ${item.counterpartName} beauftragt?`
    : `Hat ${item.counterpartName} Sie beauftragt?`;
}

function Steps({ item }: { item: ConversationItem }) {
  const newContact = item.commercialModel === "no_fee";
  const requested = day(item.requestedAt);
  const introduced = day(item.introducedAt);
  const done = item.engagementRecorded || item.answer === "engaged";
  const steps = [
    { label: item.role === "client" ? "Angefragt" : "Anfrage erhalten", detail: requested, state: "done" },
    item.stage === "declined"
      ? { label: "Nicht vorgestellt", detail: null, state: "stopped" }
      : { label: newContact ? "Kontaktfreigabe" : "Vorgestellt", detail: introduced ?? (newContact ? "Freelancer entscheidet" : "wird geprüft"), state: introduced ? "done" : "current" },
    {
      label: "Beauftragung",
      detail: item.engagementRecorded
        ? "erfasst"
        : item.answer
          ? ANSWER_LABELS[item.answer]
          : item.stage === "introduced"
            ? "offen"
            : null,
      state: done ? "done" : item.stage === "introduced" ? "current" : "todo",
    },
  ];
  return (
    <ol className="conversation-steps">
      {steps.map((step) => (
        <li key={step.label} data-state={step.state}>
          <span aria-hidden="true">{step.state === "done" ? <IconCheck size={11} /> : null}</span>
          <strong>{step.label}</strong>
          {step.detail ? <small>{step.detail}</small> : null}
        </li>
      ))}
    </ol>
  );
}

function AnswerButtons({
  item,
  busy,
  onAnswer,
}: {
  item: ConversationItem;
  busy: boolean;
  onAnswer: (item: ConversationItem, answer: ConversationAnswer) => void;
}) {
  return (
    <div className="conversation-answers" role="group" aria-label={question(item)}>
      {CONVERSATION_ANSWERS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === "engaged" ? "primary-action" : "secondary-action"}
          aria-pressed={item.answer === option.value}
          disabled={busy}
          onClick={() => onAnswer(item, option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ConversationCard({
  item,
  busy,
  onAnswer,
}: {
  item: ConversationItem;
  busy: boolean;
  onAnswer: (item: ConversationItem, answer: ConversationAnswer) => void;
}) {
  const settled = item.engagementRecorded || item.answer === "engaged" || item.answer === "no_engagement";
  const canReport = item.stage === "introduced" && !item.engagementRecorded;
  const newContact = item.commercialModel === "no_fee";
  return (
    <article className={`conversation-card${item.question ? " has-question" : ""}`} aria-label={`Gespräch mit ${item.counterpartName}`}>
      <header>
        <div>
          <span className="conversation-role">{item.role === "client" ? "Ihre Anfrage" : "Anfrage an Sie"}</span>
          <h2>{item.counterpartName}</h2>
          {item.counterpartDetail ? <p>{item.counterpartDetail}</p> : null}
        </div>
        {item.projectTitle ? <p className="conversation-project">{item.projectTitle}</p> : null}
      </header>

      <Steps item={item} />

      {item.question ? (
        <div className="conversation-question">
          <p>
            <strong>{question(item)}</strong>{" "}
            {item.question === 1
              ? "Die Vorstellung ist gut zwei Wochen her."
              : "Die Vorstellung ist gut sechs Wochen her."}
          </p>
          <AnswerButtons item={item} busy={busy} onAnswer={onAnswer} />
          {newContact ? <small>Neue Beauftragungen sind provisionsfrei.</small> : item.role === "client" ? (
            <small>Kostenlos bis zur Beauftragung. Erst dann fällt das Vermittlungshonorar an.</small>
          ) : (
            <small>Für Sie bleibt die Vermittlung kostenlos.</small>
          )}
        </div>
      ) : settled ? (
        <p className="conversation-note">
          {item.engagementRecorded
            ? "Die Beauftragung ist erfasst. Danke!"
            : newContact ? "Ihre Rückmeldung ist gespeichert. Es entsteht keine Vermittlungsgebühr." : item.answer === "engaged"
              ? item.role === "client"
                ? "Danke! XPORTAL meldet sich wegen der Einzelheiten zur Rechnung."
                : "Danke! XPORTAL klärt die Einzelheiten mit dem Kunden."
              : "Danke für Ihre Rückmeldung."}
        </p>
      ) : canReport ? (
        <details className="conversation-report">
          <summary>Stand melden</summary>
          <AnswerButtons item={item} busy={busy} onAnswer={onAnswer} />
        </details>
      ) : item.stage === "requested" ? (
        <p className="conversation-note">{newContact ? "Kontaktfreigabe ausstehend. Der Freelancer entscheidet selbst. Interesse und aktuelle Verfügbarkeit sind nicht bestätigt." : "Historischer Vorgang: XPORTAL prüft die Verfügbarkeit und stellt Sie per E-Mail vor."}</p>
      ) : item.stage === "declined" ? (
        <p className="conversation-note">Eine Vorstellung war diesmal nicht möglich. Die Details stehen in unserer E-Mail.</p>
      ) : null}

      {item.role === "client" && item.stage === "introduced" && item.hasCalendar && !settled ? (
        <a
          className="booking-link-action"
          href={appPath(`/api/freelancers/${item.profileId}/book`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Termin wählen <IconArrowRight size={13} />
        </a>
      ) : null}
    </article>
  );
}

export function ConversationsPage({
  items,
  loading,
  error,
  linkInvalid,
  isAccountUser,
  onAnswer,
  onSignup,
}: {
  items: ConversationItem[];
  loading: boolean;
  error: string | null;
  linkInvalid: boolean;
  isAccountUser: boolean;
  onAnswer: (item: ConversationItem, answer: ConversationAnswer) => Promise<void>;
  onSignup: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const answer = async (item: ConversationItem, value: ConversationAnswer) => {
    setBusyId(item.id);
    try {
      await onAnswer(item, value);
    } finally {
      setBusyId(null);
    }
  };
  const hasGuestRequests = !isAccountUser && items.some((item) => item.role === "client");

  return (
    <section className="team-page conversations-page" aria-label="Gespräche">
      <header className="team-page-header">
        <h1>Gespräche</h1>
        <p>
          Der Stand Ihrer Anfragen: angefragt, vorgestellt, beauftragt. Wenn XPORTAL nachfragt, ob es zur
          Beauftragung kam, antworten Sie hier mit einem Klick.
        </p>
      </header>

      {linkInvalid ? (
        <p className="form-error" role="alert">Dieser Link ist ungültig oder abgelaufen. Melden Sie sich an, um Ihre Gespräche zu sehen.</p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {loading ? (
        <p className="placement-status" aria-busy="true">Gespräche werden geladen …</p>
      ) : items.length === 0 ? (
        <div className="empty-projects">
          <p>Noch keine Gespräche</p>
          <small>
            Fragen Sie im Chat einen passenden Freelancer an. Hier sehen Sie dann, wann XPORTAL Sie vorstellt und
            wie es weitergeht. Als Freelancer erscheinen hier Anfragen, sobald XPORTAL Sie vorgestellt hat.
          </small>
        </div>
      ) : (
        <div className="conversation-list">
          {items.map((item) => (
            <ConversationCard key={`${item.role}:${item.id}`} item={item} busy={busyId === item.id} onAnswer={answer} />
          ))}
        </div>
      )}

      {hasGuestRequests ? (
        <p className="conversation-note">
          Ihre Anfragen hängen an diesem Browser.{" "}
          <button type="button" onClick={onSignup}>Konto anlegen</button>, um sie auf jedem Gerät zu sehen.
        </p>
      ) : null}
    </section>
  );
}
