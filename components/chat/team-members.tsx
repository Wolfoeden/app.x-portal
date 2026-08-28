"use client";

/**
 * Teammitglieder eines gekauften Plans.
 *
 * Eingeladen wird nur, wer bereits ein Konto hat. Das ist keine technische
 * Einschränkung, die sich wegprogrammieren liesse: geteilt werden Guthaben
 * und eine Merkliste, und beides braucht ein Konto, an dem es hängt. Wer
 * keines hat, wird als solcher gemeldet — mit der Aufforderung an den
 * Einladenden, die Person selbst anzuschreiben.
 */

import { useState, type FormEvent } from "react";

import type { PlanTeamSnapshot } from "../chat-contract";
import { IconCheck, IconSpark } from "../icons";

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "–" : dateFormat.format(parsed);
}

export function TeamMembersPanel({
  team,
  planLabel,
  busy,
  notice,
  onInvite,
  onRemove,
}: {
  team: PlanTeamSnapshot | null;
  planLabel: string;
  busy: boolean;
  notice: { tone: "error" | "success"; message: string } | null;
  onInvite: (email: string) => void;
  onRemove: (memberUserId: string) => void;
}) {
  const [email, setEmail] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    onInvite(value);
    setEmail("");
  };

  if (!team) {
    return <p className="account-credit-muted">Team wird geladen …</p>;
  }

  // Ein eingeladenes Konto verwaltet nichts, es sieht nur, woran es hängt.
  if (!team.isOwner) {
    return (
      <section className="account-team" aria-label="Team">
        <h3>Ihr Team</h3>
        <p className="account-credit-muted">
          Sie gehören zum Plan von{" "}
          <strong>{team.ownerEmail ?? "einem anderen Konto"}</strong>. Ist Ihr
          eigenes Monatsguthaben aufgebraucht, laufen weitere Suchen über
          dieses Guthaben. Die Merkliste des Teams können Sie ansehen.
        </p>
      </section>
    );
  }

  return (
    <section className="account-team" aria-label="Teammitglieder">
      <h3>Teammitglieder</h3>
      <p className="account-credit-muted">
        Mitglieder nutzen zuerst ihr eigenes Guthaben und danach Ihren{" "}
        {planLabel}-Pool. Ihre Merkliste können sie ansehen, aber nicht ändern.
      </p>

      {team.members.length ? (
        <ul className="account-team-list">
          {team.members.map((member) => (
            <li key={member.userId}>
              <span>
                <strong>{member.email ?? "Konto ohne Adresse"}</strong>
                <small>seit {formatDate(member.invitedAt)}</small>
              </span>
              <button
                type="button"
                onClick={() => onRemove(member.userId)}
                disabled={busy}
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="account-credit-muted">
          Noch niemand eingeladen.
        </p>
      )}

      <form className="account-team-invite" onSubmit={submit}>
        <label htmlFor="team-invite-email">
          Teammitglied hinzufügen
        </label>
        <div>
          <input
            id="team-invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="name@firma.de"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !email.trim()}>
            <IconSpark size={13} /> Hinzufügen
          </button>
        </div>
      </form>

      {notice ? (
        <p
          className={
            notice.tone === "error"
              ? "account-team-notice is-error"
              : "account-team-notice is-success"
          }
          role="status"
        >
          {notice.tone === "success" ? <IconCheck size={12} /> : null}
          {notice.message}
        </p>
      ) : null}
    </section>
  );
}
