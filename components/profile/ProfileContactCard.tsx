"use client";

import { useState, type ReactNode } from "react";

import type { FreelancerProfileResult } from "@/components/chat-contract";
import { actionClass } from "@/components/ui/actions";
import { appPath } from "@/lib/app-path";
import type { ProfilePageAction } from "@/lib/profile/profile-link";

import { PlacementDialog } from "../chat/placement-dialog";
import { IconCheck } from "../icons";

import styles from "./public-profile.module.css";

/**
 * Der Kontaktkasten neben dem Profil auf `/profil/<id>`: Termin, Anfrage,
 * Link kopieren. Was ein Klick tatsächlich öffnet, entscheiden wie bisher
 * `profilePageAction` und die Routen dahinter (Tarif, Vorstellung); dieser
 * Kasten zeigt nur die Wege. `children` sind die Unterlagen (Lebenslauf,
 * LinkedIn, GitHub), die der Server rendert.
 */
export function ProfileContactCard({
  firstName,
  profile,
  action,
  bookingHref,
  shareUrl,
  cvHref,
  children,
}: {
  firstName: string;
  profile: FreelancerProfileResult;
  action: ProfilePageAction;
  /** Der Termin-Knopf, wenn ein Kalender hinterlegt ist. */
  bookingHref: string | null;
  shareUrl: string;
  /** Lebenslauf-Knopf neben „Link kopieren“, wenn einer vorliegt. */
  cvHref: string | null;
  children?: ReactNode;
}) {
  const [requestOpen, setRequestOpen] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  // Ohne Kalender ist die Anfrage der Hauptweg, sonst der zweite Knopf.
  const requestPrimary = !bookingHref;
  const requestLabel = action.kind === "request" ? action.label : "Anfrage über XPORTAL senden";
  const request =
    action.kind === "request" ? (
      <button type="button" className={actionClass(requestPrimary ? "primary" : "secondary", { block: true })} onClick={() => setRequestOpen(true)}>
        {requestLabel}
      </button>
    ) : action.kind === "link" ? (
      <a className={actionClass(requestPrimary ? "primary" : "secondary", { block: true })} href={appPath(action.href)}>
        {requestLabel}
      </a>
    ) : action.kind === "booking" && requestPrimary ? (
      <a className={actionClass("primary", { block: true })} href={appPath(action.href)} target="_blank" rel="noopener noreferrer">
        {action.label}
      </a>
    ) : action.kind === "none" && requestPrimary ? (
      <button type="button" className={actionClass("primary", { block: true })} disabled>{action.label}</button>
    ) : null;

  return (
    <aside className={styles.contact} aria-labelledby="profil-kontakt">
      <h2 id="profil-kontakt">{firstName} kennenlernen</h2>
      {bookingHref ? (
        <a
          className={`${actionClass("primary", { block: true })} ${styles.bookButton}`}
          href={appPath(bookingHref)}
          {...(action.kind === "booking" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></svg>
          Termin buchen
        </a>
      ) : null}
      {request}
      <div className={cvHref ? styles.contactPair : undefined}>
        <button type="button" className={actionClass("secondary", { block: true, compact: true })} onClick={() => void copyLink()}>
          {copy === "copied" ? <><IconCheck size={13} /> Link kopiert</> : "Link kopieren"}
        </button>
        {cvHref ? (
          <a className={actionClass("secondary", { block: true, compact: true })} href={appPath(cvHref)}>Lebenslauf</a>
        ) : null}
      </div>
      {copy === "failed" ? (
        <p className={styles.small}>Kopieren ging nicht. Der Link: <span className={styles.url}>{shareUrl}</span></p>
      ) : null}
      {children}
      <p className={styles.small}>{action.hint.replace(/\.$/u, "")}. E-Mail-Adresse und Telefonnummer bleiben privat.</p>
      {requestOpen && action.kind === "request" ? (
        <PlacementDialog
          profile={profile}
          projectId={action.projectId}
          introductionsPath={appPath("/api/introductions")}
          onClose={() => setRequestOpen(false)}
        />
      ) : null}
    </aside>
  );
}
