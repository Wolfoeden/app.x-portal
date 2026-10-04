"use client";

import { useEffect, useState, type FormEvent } from "react";

import { appPath } from "@/lib/app-path";
import {
  PLACEMENT_TERMS,
  PLACEMENT_TERMS_PATH,
  placementRequestsEnabled,
  placementTermsSummary,
} from "@/lib/placement/config";
import { MANDATE_CONFIRMATION } from "@/lib/placement/mandate-model";

import { IconCheck } from "../icons";
import { trackFunnelEvent } from "./funnel-events";

type View =
  | { kind: "closed" }
  | { kind: "form" }
  | { kind: "done"; message: string };

/**
 * „XPORTAL sucht für Sie“: der Suchauftrag unter einem Ergebnis.
 *
 * Wer als Gast sucht, ein Ergebnis sieht und geht, war bisher verloren —
 * ohne Adresse gab es keinen Weg zurück. Diese Karte bietet den nächsten
 * Schritt an, der nichts kostet: XPORTAL stellt passende Freelancer
 * persönlich vor. Mit Treffern heißt das „diese Profile vorstellen lassen“,
 * ohne Treffer „für Sie suchen“.
 *
 * Erst ein Klick öffnet das Formular; zugeklappt ist die Karte eine Zeile und
 * konkurriert nicht mit den Profilen darüber.
 */
export function MandateCard({
  projectId,
  hasMatches,
  guest,
  preview = false,
}: {
  projectId: string | null;
  hasMatches: boolean;
  guest: boolean;
  preview?: boolean;
}) {
  const [view, setView] = useState<View>({ kind: "closed" });
  const [contact, setContact] = useState({ email: "", company: "", name: "", phone: "", website: "" });
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Liegt zu diesem Projekt schon ein Auftrag, steht das gleich da.
  useEffect(() => {
    if (!projectId || preview || !placementRequestsEnabled()) return;
    let active = true;
    void fetch(appPath(`/api/search-mandates?projectId=${encodeURIComponent(projectId)}`), { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { mandate?: { message?: string } | null } | null) => {
        if (active && body?.mandate) setView({ kind: "done", message: body.mandate.message ?? MANDATE_CONFIRMATION });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [preview, projectId]);

  if (!projectId || !placementRequestsEnabled()) return null;

  const title = hasMatches ? "Diese Profile persönlich vorstellen lassen" : "XPORTAL sucht für Sie";
  const lead = hasMatches
    ? "XPORTAL prüft Verfügbarkeit und Honorar der passenden Freelancer und stellt Sie per E-Mail vor."
    : "Kein Profil passt genug? XPORTAL sucht im Netzwerk weiter und stellt Ihnen passende Freelancer persönlich vor.";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    if (preview) {
      setView({ kind: "done", message: MANDATE_CONFIRMATION });
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(appPath("/api/search-mandates"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          projectId,
          placementTermsVersion: PLACEMENT_TERMS.version,
          ...(note.trim() ? { note } : {}),
          ...(guest
            ? {
                guestContact: {
                  email: contact.email,
                  company: contact.company,
                  ...(contact.name.trim() ? { name: contact.name } : {}),
                  ...(contact.phone.trim() ? { phone: contact.phone } : {}),
                  ...(contact.website ? { website: contact.website } : {}),
                },
              }
            : {
                accountContact: {
                  ...(contact.company.trim() ? { company: contact.company } : {}),
                  ...(contact.phone.trim() ? { phone: contact.phone } : {}),
                },
              }),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string; created?: boolean };
      if (!response.ok) {
        setError(body.error ?? "Der Suchauftrag konnte gerade nicht gesendet werden. Bitte versuchen Sie es erneut.");
        return;
      }
      if (body.created) trackFunnelEvent("mandate_submitted", hasMatches ? "with_matches" : "no_match");
      setView({ kind: "done", message: body.message ?? MANDATE_CONFIRMATION });
    } catch {
      setError("Der Suchauftrag konnte gerade nicht gesendet werden. Bitte versuchen Sie es erneut.");
    } finally {
      setBusy(false);
    }
  };

  if (view.kind === "done") {
    return (
      <section className="mandate-card is-done" aria-live="polite">
        <span className="mandate-icon" aria-hidden="true"><IconCheck size={15} /></span>
        <div>
          <strong>Suchauftrag liegt vor</strong>
          <p>{view.message}</p>
        </div>
      </section>
    );
  }

  if (view.kind === "closed") {
    return (
      <section className="mandate-card" aria-labelledby="mandate-title">
        <div>
          <strong id="mandate-title">{title}</strong>
          <p>{lead} Kostenlos bis zur Beauftragung.</p>
        </div>
        <button className="primary-action" type="button" onClick={() => setView({ kind: "form" })}>
          {hasMatches ? "Vorstellen lassen" : "Suchauftrag geben"}
        </button>
      </section>
    );
  }

  return (
    <section className="mandate-card is-open" aria-labelledby="mandate-title">
      <div>
        <strong id="mandate-title">{title}</strong>
        <p>{lead}</p>
      </div>
      <form className="placement-form" onSubmit={submit}>
        <ul className="placement-terms">
          {placementTermsSummary().map((line) => (
            <li key={line}><span aria-hidden="true"><IconCheck size={13} /></span>{line}</li>
          ))}
        </ul>
        <div className="placement-fields">
          {guest ? (
            <label>
              <span>Geschäftliche E-Mail</span>
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={320}
                value={contact.email}
                onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
          ) : null}
          <label>
            <span>Firma {guest ? null : <small>(optional)</small>}</span>
            <input
              type="text"
              autoComplete="organization"
              required={guest}
              minLength={guest ? 2 : undefined}
              maxLength={200}
              value={contact.company}
              onChange={(event) => setContact((current) => ({ ...current, company: event.target.value }))}
            />
          </label>
          {guest ? (
            <label>
              <span>Ihr Name <small>(optional)</small></span>
              <input
                type="text"
                autoComplete="name"
                maxLength={120}
                value={contact.name}
                onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
          ) : null}
          <label>
            <span>Telefon <small>(optional, für Rückfragen)</small></span>
            <input
              type="tel"
              autoComplete="tel"
              maxLength={40}
              value={contact.phone}
              onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))}
            />
          </label>
          <label className="placement-field-wide">
            <span>Was ist besonders wichtig? <small>(optional)</small></span>
            <textarea
              maxLength={1000}
              rows={3}
              value={note}
              placeholder="z. B. Start im November, Tagessatz bis 900 €, Erfahrung mit AI Agents im Kundenservice"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {/* Für Menschen unsichtbar; ein Bot, der alles ausfüllt, verrät sich hier. */}
          <input
            className="placement-trap"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={contact.website}
            onChange={(event) => setContact((current) => ({ ...current, website: event.target.value }))}
          />
        </div>
        <p className="placement-privacy">
          XPORTAL nutzt Ihre Angaben, um passende Freelancer vorzustellen. Bei einer Vorstellung erhält der Freelancer
          Ihren Namen, Ihre E-Mail-Adresse und den Titel Ihres Projekts.{guest ? " Ein Konto brauchen Sie dafür nicht." : ""}
        </p>
        <label className="placement-consent">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required />
          <span>
            Ich stimme den{" "}
            <a href={appPath(PLACEMENT_TERMS_PATH)} target="_blank" rel="noopener noreferrer">Vermittlungsbedingungen</a>{" "}
            zu.
          </span>
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="secondary-action" type="button" onClick={() => setView({ kind: "closed" })} disabled={busy}>
            Abbrechen
          </button>
          <button
            className="primary-action"
            type="submit"
            disabled={busy || !accepted || (guest && (!contact.email.trim() || contact.company.trim().length < 2))}
          >
            {busy ? "Wird gesendet …" : "Suchauftrag senden"}
          </button>
        </div>
      </form>
    </section>
  );
}
