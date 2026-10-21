"use client";

import { useState, type FormEvent } from "react";

import { appPath } from "@/lib/app-path";
import {
  MANDATE_RESPONSE_HOURS,
  SEARCH_MANDATE_CONSENT_VERSION,
} from "@/lib/placement/mandate-model";

import { Modal } from "./dialogs";
import { trackFunnelEvent } from "./funnel-events";

const FAILED = "Das hat gerade nicht geklappt. Versuchen Sie es bitte noch einmal.";

/** Steht im Suchauftrag, damit der Betreiber weiß, um wen es ging. */
export function guestRequestNote(profile: { id: string; name: string }): string {
  return `Anfrage zu Profil ${profile.name} (${profile.id}).`.slice(0, 1_000);
}

/**
 * „Freelancer anfragen“ ohne Konto (21.10.2026).
 *
 * Bisher führte der Knopf Gäste in die Registrierung; 18 von 30 Suchenden
 * wollten anfragen, 5 schafften die Registrierung. Jetzt genügen E-Mail und
 * Firma: Die Anfrage wird ein Suchauftrag zum Projekt (dieselbe Route wie die
 * Karte „Weitersuchen“), mit dem Profil als Notiz, und der Betreiber stellt
 * beide Seiten per E-Mail vor. Wer lieber ein Konto anlegt, kann das weiter.
 */
export function GuestRequestDialog({
  projectId,
  profile,
  onClose,
  onPreferAccount,
}: {
  projectId: string;
  profile: { id: string; name: string };
  onClose: () => void;
  onPreferAccount: () => void;
}) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(appPath("/api/search-mandates"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          projectId,
          consentVersion: SEARCH_MANDATE_CONSENT_VERSION,
          note: guestRequestNote(profile),
          guestContact: {
            email,
            ...(company.trim() ? { company } : {}),
            ...(name.trim() ? { name } : {}),
            ...(phone.trim() ? { phone } : {}),
            ...(website ? { website } : {}),
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string; created?: boolean };
      if (!response.ok) {
        setError(body.error ?? FAILED);
        return;
      }
      if (body.created) trackFunnelEvent("mandate_submitted", "profile_request");
      setDone(body.message ?? `Danke. Wir melden uns innerhalb von ${MANDATE_RESPONSE_HOURS} Stunden.`);
    } catch {
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal titleId="guest-request-title" onClose={onClose}>
      {done ? (
        <div className="project-dialog">
          <span className="dialog-eyebrow">Anfrage gesendet</span>
          <h2 id="guest-request-title">{profile.name} angefragt</h2>
          <p aria-live="polite">{done}</p>
          <div className="dialog-actions">
            <button className="primary-action" type="button" onClick={onClose}>Schließen</button>
          </div>
        </div>
      ) : (
        <form className="project-dialog" onSubmit={submit}>
          <span className="dialog-eyebrow">Ohne Konto, ohne Karte</span>
          <h2 id="guest-request-title">{profile.name} anfragen</h2>
          <p>
            Wir fragen die Verfügbarkeit an und stellen Sie beide per E-Mail vor, in der Regel innerhalb von{" "}
            {MANDATE_RESPONSE_HOURS} Stunden. Kostenlos und ohne Provision.
          </p>
          <label htmlFor="guest-request-email">Geschäftliche E-Mail</label>
          <input id="guest-request-email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} data-autofocus />
          <label htmlFor="guest-request-company">Firma (optional)</label>
          <input id="guest-request-company" autoComplete="organization" maxLength={200} value={company} onChange={(event) => setCompany(event.target.value)} />
          <label htmlFor="guest-request-name">Ihr Name (optional)</label>
          <input id="guest-request-name" autoComplete="name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
          <label htmlFor="guest-request-phone">Telefon für Rückfragen (optional)</label>
          <input id="guest-request-phone" type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} />
          {/* Für Menschen unsichtbar; ein Bot, der alles ausfüllt, verrät sich hier. */}
          <input className="placement-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(event) => setWebsite(event.target.value)} />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <p className="mandate-consent">
            Mit dem Absenden darf XPORTAL Sie zu dieser Anfrage per E-Mail oder Telefon kontaktieren.{" "}
            <a href="/privacy#suchauftrag" target="_blank" rel="noopener noreferrer">Datenschutz</a>
          </p>
          <div className="dialog-actions split-actions">
            <button className="secondary-action" type="button" onClick={onPreferAccount} disabled={busy}>Lieber mit Konto</button>
            <button className="primary-action" type="submit" disabled={busy || !email.trim()}>{busy ? "Wird gesendet …" : "Anfrage senden"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
