"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";

import type { FreelancerProfileResult } from "@/components/chat-contract";
import { appPath } from "@/lib/app-path";
import type { ProfileDossier as Dossier } from "@/lib/profile/dossier";
import { monogramTone, PROFILE_FIELD_LABELS, type ProfileField } from "@/lib/profile/identity";

import { Modal } from "../chat/dialogs";
import { initials } from "../chat/shared";
import { ProfileDossier } from "./ProfileDossier";

/**
 * Das Seitenpanel für ein Profil: Wer im Chat eine Karte anklickt, forscht
 * hier weiter, ohne den Chat zu verlassen. Rechts angedockt, auf dem Handy
 * von unten. Der Kopf steht sofort aus den Kartendaten da, der Rest kommt
 * vom Server (`/api/freelancers/<id>`).
 */

export type ProfileSheetVia = "shortcut" | "results" | "saved" | "link";

export type ProfileSheetRequest = {
  id: string;
  via: ProfileSheetVia;
  /** Was die Karte schon weiß, für den Kopf während des Ladens. */
  header?: { displayName: string; role: string; avatarUrl: string | null; field: ProfileField | null };
  /** Aus dem Suchergebnis: für die Anfrage aus dem Panel heraus. */
  result?: FreelancerProfileResult;
};

/** Öffnet das Panel. Ohne Anbieter (etwa im Bewerbungsformular) bleibt die Karte ein Link. */
export const ProfileSheetContext = createContext<((request: ProfileSheetRequest) => void) | null>(null);

const pending = new Map<string, Promise<Dossier | null>>();

function loadDossier(id: string, via: ProfileSheetVia): Promise<Dossier | null> {
  const known = pending.get(id);
  if (known) return known;
  const loading = fetch(appPath(`/api/freelancers/${encodeURIComponent(id)}?via=${via}`), { credentials: "same-origin" })
    .then((response) => (response.ok ? (response.json() as Promise<{ dossier: Dossier }>) : null))
    .then((payload) => payload?.dossier ?? null)
    .catch(() => null)
    .then((dossier) => {
      if (!dossier) pending.delete(id);
      return dossier;
    });
  pending.set(id, loading);
  return loading;
}

function SheetSkeleton({ request, failed }: { request: ProfileSheetRequest; failed: boolean }) {
  const header = request.header;
  return (
    <div className="dossier" aria-busy="true">
      <header className="dossier-hero">
        <div className="pband" data-field={header?.field ?? "none"}>
          <span className="pband-label">{header?.field ? PROFILE_FIELD_LABELS[header.field] : "Profil"}</span>
        </div>
        <div className="dossier-head">
          <span className="profile-avatar pid" data-tone={header ? monogramTone(header.displayName) : 0} aria-hidden="true">
            {header ? initials(header.displayName) : null}
          </span>
          <div>
            <h2 id={`dossier-${request.id}`}>{header?.displayName ?? "Profil wird geladen"}</h2>
            {header ? <p>{header.role}</p> : null}
          </div>
        </div>
      </header>
      {failed ? null : <p className="dossier-loading">Profil wird geladen …</p>}
    </div>
  );
}

export function ProfileSheet({
  request,
  initial = null,
  onClose,
  actions,
}: {
  request: ProfileSheetRequest;
  /** Vorschau und Tests: ein fertiges Profil statt des Abrufs. */
  initial?: Dossier | null;
  onClose: () => void;
  actions: ReactNode;
}) {
  const [loaded, setLoaded] = useState<{ id: string; dossier: Dossier | null } | null>(null);
  const [shownAt] = useState(() => new Date());

  useEffect(() => {
    if (initial) return;
    let active = true;
    void loadDossier(request.id, request.via).then((dossier) => {
      if (active) setLoaded({ id: request.id, dossier });
    });
    return () => {
      active = false;
    };
  }, [initial, request.id, request.via]);

  const dossier = initial ?? (loaded?.id === request.id ? loaded.dossier : null);
  const failed = !initial && loaded?.id === request.id && !loaded.dossier;

  return (
    <Modal titleId={`dossier-${request.id}`} onClose={onClose} variant="sheet">
      <div className="profile-sheet">
        {dossier ? (
          <ProfileDossier dossier={dossier} now={shownAt} />
        ) : (
          <>
            <SheetSkeleton request={request} failed={failed} />
            {failed ? (
              <p className="dossier-loading" role="alert">
                Das Profil lässt sich gerade nicht laden.{" "}
                <a href={appPath(`/profil/${request.id}`)} target="_blank" rel="noopener noreferrer">
                  Profilseite öffnen
                </a>
              </p>
            ) : null}
          </>
        )}
        <footer className="profile-sheet-actions">{actions}</footer>
      </div>
    </Modal>
  );
}
