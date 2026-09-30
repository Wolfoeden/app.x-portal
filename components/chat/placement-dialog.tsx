"use client";

import { useEffect, useState, type FormEvent } from "react";

import { appPath } from "@/lib/app-path";
import {
  PLACEMENT_TERMS,
  PLACEMENT_TERMS_PATH,
  placementTermsSummary,
} from "@/lib/placement/config";

import type { FreelancerProfileResult } from "../chat-contract";
import { IconArrowRight, IconCheck } from "../icons";
import { Modal } from "./dialogs";
import { initials } from "./shared";

type Introduction = {
  id: string;
  status: string;
  requestedAt?: string;
  confirmedAt?: string | null;
};

type View =
  | { kind: "loading" }
  | { kind: "form" }
  | { kind: "waiting" }
  | { kind: "introduced" }
  | { kind: "declined" }
  | { kind: "no_project" }
  | { kind: "error"; message: string };

function viewFor(introduction: Introduction | null): View {
  if (!introduction) return { kind: "form" };
  if (introduction.status === "cancelled") return { kind: "declined" };
  if (["ready_to_book", "booked", "completed"].includes(introduction.status)) return { kind: "introduced" };
  return { kind: "waiting" };
}

/**
 * „Freelancer anfragen“ im Vermittlungsmodell.
 *
 * Ersetzt mit dem Schalter den Kontaktdialog, der direkt in den Kalender
 * führte. Der Kunde sieht die drei Sätze der Vermittlungsbedingungen, stimmt
 * mit einem Häkchen zu und schickt die Anfrage. Danach zeigt der Dialog den
 * Stand: wartet, vorgestellt (mit Kalender), oder abgelehnt.
 */
export function PlacementDialog({
  profile,
  projectId,
  introductionsPath,
  preview = false,
  guest = false,
  onRequested,
  onClose,
}: {
  profile: FreelancerProfileResult;
  projectId: string | null;
  introductionsPath: string;
  preview?: boolean;
  /** Ohne Konto: Der Dialog fragt nach E-Mail und Firma statt nach einer Registrierung. */
  guest?: boolean;
  /** Nach dem Absenden, damit „Gespräche“ die neue Anfrage zeigt. */
  onRequested?: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>(
    projectId ? (preview ? { kind: "form" } : { kind: "loading" }) : { kind: "no_project" },
  );
  const [accepted, setAccepted] = useState(false);
  const [contact, setContact] = useState({ email: "", company: "", name: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || preview) return;
    let alive = true;
    const params = new URLSearchParams({ projectId, profileId: profile.id });
    fetch(`${introductionsPath}?${params.toString()}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as { introduction?: Introduction | null };
        if (alive) setView(viewFor(body.introduction ?? null));
      })
      .catch(() => {
        if (alive) setView({ kind: "error", message: "Der Stand Ihrer Anfrage ist gerade nicht abrufbar. Bitte versuchen Sie es gleich erneut." });
      });
    return () => {
      alive = false;
    };
  }, [introductionsPath, preview, profile.id, projectId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !accepted) return;
    setBusy(true);
    setError(null);
    if (preview) {
      setView({ kind: "waiting" });
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(introductionsPath, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          projectId,
          profileId: profile.id,
          idempotencyKey: `placement:${projectId}:${profile.id}`,
          placementTermsVersion: PLACEMENT_TERMS.version,
          ...(guest
            ? {
                guestContact: {
                  email: contact.email,
                  company: contact.company,
                  ...(contact.name.trim() ? { name: contact.name } : {}),
                  ...(contact.website ? { website: contact.website } : {}),
                },
              }
            : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        introduction?: Introduction;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "Die Anfrage konnte gerade nicht gesendet werden. Bitte versuchen Sie es erneut.");
        return;
      }
      setView(viewFor(body.introduction ?? { id: "", status: "manual_review" }));
      onRequested?.();
    } catch {
      setError("Die Anfrage konnte gerade nicht gesendet werden. Bitte versuchen Sie es erneut.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal titleId="placement-title" onClose={onClose} size="large">
      <div className="contact-dialog placement-dialog">
        <div className="contact-dialog-header">
          <div
            className={`contact-profile-avatar ${profile.avatarUrl ? "has-image" : ""}`}
            style={profile.avatarUrl ? { backgroundImage: `url(${JSON.stringify(profile.avatarUrl)})` } : undefined}
            aria-hidden="true"
          >
            {profile.avatarUrl ? null : initials(profile.displayName)}
          </div>
          <div>
            <span className="dialog-eyebrow">Vermittlung durch XPORTAL</span>
            <h2 id="placement-title">{profile.displayName} anfragen</h2>
            <p>{profile.role}</p>
          </div>
        </div>

        {view.kind === "loading" ? <p className="placement-status" aria-busy="true">Stand wird geladen …</p> : null}

        {view.kind === "no_project" ? (
          <p className="placement-status">
            Öffnen Sie das Projekt, in dem Sie {profile.displayName} gefunden haben, und fragen Sie dort an.
            So weiß {profile.displayName}, worum es geht.
          </p>
        ) : null}

        {view.kind === "error" ? <p className="form-error" role="alert">{view.message}</p> : null}

        {view.kind === "form" ? (
          <form className="placement-form" onSubmit={submit}>
            <ul className="placement-terms">
              {placementTermsSummary().map((line) => (
                <li key={line}><span aria-hidden="true"><IconCheck size={13} /></span>{line}</li>
              ))}
            </ul>
            <p className="placement-next">
              <strong>So geht es weiter:</strong> XPORTAL prüft, ob {profile.displayName} verfügbar ist, und stellt
              Sie beide per E-Mail vor. Danach vereinbaren Sie das Erstgespräch. Den Stand sehen Sie jederzeit unter
              „Gespräche“.
            </p>
            {guest ? (
              <div className="placement-fields">
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
                <label>
                  <span>Firma</span>
                  <input
                    type="text"
                    autoComplete="organization"
                    required
                    minLength={2}
                    maxLength={200}
                    value={contact.company}
                    onChange={(event) => setContact((current) => ({ ...current, company: event.target.value }))}
                  />
                </label>
                <label className="placement-field-wide">
                  <span>Ihr Name <small>(optional)</small></span>
                  <input
                    type="text"
                    autoComplete="name"
                    maxLength={120}
                    value={contact.name}
                    onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))}
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
            ) : null}
            <p className="placement-privacy">
              Bei der Vorstellung erhält {profile.displayName} Ihren Namen, Ihre E-Mail-Adresse und den Titel Ihres Projekts.
              {guest ? " Ein Konto brauchen Sie dafür nicht." : ""}
            </p>
            <label className="placement-consent">
              <input
                id="placement-consent"
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                required
              />
              <span>
                Ich stimme den{" "}
                <a href={appPath(PLACEMENT_TERMS_PATH)} target="_blank" rel="noopener noreferrer">Vermittlungsbedingungen</a>{" "}
                zu.
              </span>
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="dialog-actions">
              <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Abbrechen</button>
              <button
                className="primary-action"
                type="submit"
                disabled={busy || !accepted || (guest && (!contact.email.trim() || contact.company.trim().length < 2))}
              >
                {busy ? "Wird gesendet …" : "Anfrage senden"}
              </button>
            </div>
          </form>
        ) : null}

        {view.kind === "waiting" ? (
          <div className="confirmation-state" role="status">
            <span aria-hidden="true"><IconCheck size={16} /></span>
            <h3>Ihre Anfrage liegt vor</h3>
            <p>
              XPORTAL prüft die Verfügbarkeit von {profile.displayName} und stellt Sie per E-Mail vor. Danach
              vereinbaren Sie das Erstgespräch. Den Stand finden Sie unter „Gespräche“ in der Seitenleiste.
            </p>
            <a className="booking-link-action" href={appPath("/gespraeche")}>
              Zu Ihren Gesprächen <IconArrowRight size={13} />
            </a>
          </div>
        ) : null}

        {view.kind === "introduced" ? (
          <div className="confirmation-state" role="status">
            <span aria-hidden="true"><IconCheck size={16} /></span>
            <h3>Sie wurden vorgestellt</h3>
            <p>
              Wählen Sie jetzt einen Termin für das Erstgespräch. Kostenlos bis zur Beauftragung; kommt es dazu,
              geben Sie uns bitte kurz Bescheid.
            </p>
            {profile.bookingUrl ? (
              <a
                className="booking-link-action"
                href={appPath(`/api/freelancers/${profile.id}/book`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Termin wählen <IconArrowRight size={13} />
              </a>
            ) : (
              <p>{profile.displayName} meldet sich bei Ihnen, um einen Termin zu vereinbaren.</p>
            )}
          </div>
        ) : null}

        {view.kind === "declined" ? (
          <div className="placement-status" role="status">
            <p>
              {profile.displayName} kann für dieses Projekt derzeit nicht vorgestellt werden. Die Details stehen in
              unserer E-Mail an Sie. In Ihrem Projekt finden Sie weitere passende Profile.
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
