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
  onClose,
}: {
  profile: FreelancerProfileResult;
  projectId: string | null;
  introductionsPath: string;
  preview?: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>(
    projectId ? (preview ? { kind: "form" } : { kind: "loading" }) : { kind: "no_project" },
  );
  const [accepted, setAccepted] = useState(false);
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
            <p className="placement-privacy">
              Bei der Vorstellung erhält {profile.displayName} Ihren Namen, Ihre E-Mail-Adresse und den Titel Ihres Projekts.
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
              <button className="primary-action" type="submit" disabled={busy || !accepted}>
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
              Roman Dering stellt Sie {profile.displayName} vor und schreibt Ihnen per E-Mail, meist innerhalb
              eines Werktags. Danach wählen Sie den Termin für das Erstgespräch.
            </p>
            <button type="button" onClick={onClose}>Verstanden</button>
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
