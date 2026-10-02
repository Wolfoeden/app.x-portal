"use client";

import { useState } from "react";

import type { FreelancerProfileResult } from "@/components/chat-contract";
import { appPath } from "@/lib/app-path";
import type { ProfilePageAction } from "@/lib/profile/profile-link";

import { PlacementDialog } from "../chat/placement-dialog";
import { IconArrowRight, IconCheck } from "../icons";

import styles from "./public-profile.module.css";

/**
 * Die Knöpfe unter dem Profil auf `/profil/<id>`: anfragen oder einen Termin
 * vereinbaren (je nach `profilePageAction`) und den Link kopieren. Das Profil
 * darüber rendert der Server; nur dieser Teil braucht den Browser.
 */
export function ProfilePageActions({
  profile,
  action,
  shareUrl,
}: {
  profile: FreelancerProfileResult;
  action: ProfilePageAction;
  shareUrl: string;
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

  return (
    <footer className={styles.footer}>
      <div className={styles.actions}>
        {action.kind === "booking" || action.kind === "link" ? (
          <a
            className={styles.primary}
            href={appPath(action.href)}
            {...(action.kind === "booking" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {action.label} <IconArrowRight size={13} />
          </a>
        ) : action.kind === "request" ? (
          <button type="button" className={styles.primary} onClick={() => setRequestOpen(true)}>
            {action.label} <IconArrowRight size={13} />
          </button>
        ) : (
          <button type="button" className={styles.primary} disabled>{action.label}</button>
        )}
        <button type="button" className={styles.secondary} onClick={() => void copyLink()}>
          {copy === "copied" ? <><IconCheck size={13} /> Link kopiert</> : "Link kopieren"}
        </button>
      </div>
      <p className={styles.hint}>{action.hint}</p>
      {copy === "failed" ? (
        <p className={styles.hint}>Kopieren ging nicht. Der Link: <span className={styles.url}>{shareUrl}</span></p>
      ) : null}
      {requestOpen && action.kind === "request" ? (
        <PlacementDialog
          profile={profile}
          projectId={action.projectId}
          introductionsPath={appPath("/api/introductions")}
          onClose={() => setRequestOpen(false)}
        />
      ) : null}
    </footer>
  );
}
