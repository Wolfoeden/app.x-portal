"use client";

import { useEffect, useState, type FormEvent } from "react";

import { appPath } from "@/lib/app-path";
import {
  MANDATE_CONFIRMATION,
  MANDATE_RESPONSE_HOURS,
  SEARCH_MANDATE_CONSENT_VERSION,
} from "@/lib/placement/mandate-model";

import { IconCheck } from "../icons";
import { trackFunnelEvent } from "./funnel-events";

type View =
  | { kind: "closed" }
  | { kind: "form" }
  | { kind: "done"; message: string };

/**
 * „XPORTAL sucht für Sie“: der Suchauftrag, provisionsfrei.
 *
 * Zwei Stellen, ein Baustein:
 * - `no_match`: unter einer Analyse, in der kein Profil genug passt
 *   (60 % aller Suchen im Herbst 2026).
 * - `paywall`: unter dem Hinweis, dass ein Gast ohne Guthaben nicht
 *   analysieren kann. Dann geht der eingefügte Text mit; ein Projekt entsteht
 *   erst auf dem Server.
 *
 * Zugeklappt ist die Karte eine Zeile und konkurriert nicht mit dem Rest.
 */
export function MandateCard({
  variant,
  projectId = null,
  brief = "",
  guest,
  preview = false,
}: {
  variant: "no_match" | "paywall";
  projectId?: string | null;
  brief?: string;
  guest: boolean;
  preview?: boolean;
}) {
  // An der Bezahlschranke steht der Auftrag als zweite Möglichkeit im selben
  // Hinweis, nicht als zweiter Kasten in anderer Farbe darunter.
  const embedded = variant === "paywall";
  const [view, setView] = useState<View>({ kind: "closed" });
  const [contact, setContact] = useState({ email: "", company: "", phone: "", website: "" });
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Liegt zu diesem Projekt schon ein Auftrag, steht das gleich da.
  useEffect(() => {
    if (!projectId || preview) return;
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

  const fromDraft = variant === "paywall";
  if (fromDraft ? brief.trim().length < 20 : !projectId) return null;

  const title = fromDraft ? "Oder: XPORTAL sucht für Sie" : "XPORTAL sucht für Sie";
  const lead = fromDraft
    ? `Ohne Konto und ohne Karte: Wir lesen Ihre Beschreibung, suchen passende Freelancer und melden uns innerhalb von ${MANDATE_RESPONSE_HOURS} Stunden per E-Mail.`
    : `Im Bestand passt noch niemand genug. Wir suchen gezielt weiter und schicken Ihnen innerhalb von ${MANDATE_RESPONSE_HOURS} Stunden passende Profile per E-Mail.`;

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
          ...(fromDraft ? { brief: brief.trim() } : { projectId }),
          consentVersion: SEARCH_MANDATE_CONSENT_VERSION,
          ...(note.trim() ? { note } : {}),
          ...(guest
            ? {
                guestContact: {
                  email: contact.email,
                  ...(contact.company.trim() ? { company: contact.company } : {}),
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
      if (body.created) trackFunnelEvent("mandate_submitted", variant);
      setView({ kind: "done", message: body.message ?? MANDATE_CONFIRMATION });
    } catch {
      setError("Der Suchauftrag konnte gerade nicht gesendet werden. Bitte versuchen Sie es erneut.");
    } finally {
      setBusy(false);
    }
  };

  const cardClass = `mandate-card${embedded ? " is-embedded" : ""}`;

  if (view.kind === "done") {
    return (
      <section className={`${cardClass} is-done`} aria-live="polite">
        <span className="mandate-icon" aria-hidden="true"><IconCheck size={15} /></span>
        <div>
          <strong>Suchauftrag liegt vor</strong>
          <p>{view.message}</p>
        </div>
      </section>
    );
  }

  if (view.kind === "closed" && embedded) {
    return (
      <div className="mandate-inline">
        <p>
          <strong>Oder ohne Konto und ohne Karte:</strong> XPORTAL sucht für Sie und meldet sich innerhalb von{" "}
          {MANDATE_RESPONSE_HOURS} Stunden per E-Mail. Kostenlos, ohne Provision.
        </p>
        <button className="composer-signup is-secondary" type="button" onClick={() => setView({ kind: "form" })}>
          Suchauftrag geben
        </button>
      </div>
    );
  }

  if (view.kind === "closed") {
    return (
      <section className={cardClass} aria-labelledby="mandate-title">
        <div>
          <strong id="mandate-title">{title}</strong>
          <p>{lead} Kostenlos, ohne Provision.</p>
        </div>
        <button className="primary-action" type="button" onClick={() => setView({ kind: "form" })}>
          Suchauftrag geben
        </button>
      </section>
    );
  }

  return (
    <section className={`${cardClass} is-open`} aria-labelledby="mandate-title">
      <div>
        <strong id="mandate-title">{title}</strong>
        <p>{lead}</p>
      </div>
      <form className="placement-form" onSubmit={submit}>
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
            <span>Firma <small>(optional)</small></span>
            <input
              type="text"
              autoComplete="organization"
              maxLength={200}
              value={contact.company}
              onChange={(event) => setContact((current) => ({ ...current, company: event.target.value }))}
            />
          </label>
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
              placeholder="z. B. Start im November, Tagessatz bis 900 €, remote"
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
        <label className="placement-consent">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required />
          <span>
            XPORTAL darf mich zu diesem Suchauftrag per E-Mail{contact.phone.trim() ? " und telefonisch" : ""} kontaktieren.
            Die Angaben dienen nur diesem Auftrag (<a href="/privacy#suchauftrag" target="_blank" rel="noopener noreferrer">Datenschutz</a>).
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
            disabled={busy || !accepted || (guest && !contact.email.trim())}
          >
            {busy ? "Wird gesendet …" : "Suchauftrag senden"}
          </button>
        </div>
      </form>
    </section>
  );
}
