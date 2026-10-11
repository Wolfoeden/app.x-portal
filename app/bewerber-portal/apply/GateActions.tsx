"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { AuthDialog } from "@/components/chat/dialogs";
import type { AuthDialogMode } from "@/components/chat/shared";
import { actionClass } from "@/components/ui/actions";

import styles from "./applicant-landing.module.css";

type Notice = { message: string; tone: "success" | "error" } | null;

/**
 * „Kostenlos Profil anlegen“ und „Anmelden“ für abgemeldete Besucher: im
 * Seitenkopf, im ersten Bildschirm und im Abschluss. Beide öffnen denselben
 * Anmeldedialog; der Rest des Einstiegs rendert auf dem Server.
 */
export function GateActions({ variant }: { variant: "header" | "hero" | "closing" }) {
  const [dialogMode, setDialogMode] = useState<AuthDialogMode | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const compact = variant === "header";
  const register = (
    <button className={actionClass("primary", { compact })} type="button" onClick={() => setDialogMode("register")}>
      Kostenlos Profil anlegen
    </button>
  );
  const login = (
    <button
      className={variant === "hero" ? styles.loginLink : variant === "closing" ? styles.loginOnDark : actionClass("secondary", { compact })}
      type="button"
      onClick={() => setDialogMode("login")}
    >
      {variant === "hero" ? "Schon registriert? Anmelden" : "Anmelden"}
    </button>
  );
  return (
    <>
      <div className={styles.gateActions}>
        {variant === "header" ? <>{login}{register}</> : <>{register}{login}</>}
      </div>
      {notice && variant !== "header" ? (
        <p className={notice.tone === "error" ? styles.noticeError : styles.notice} role="status">{notice.message}</p>
      ) : null}
      {/* Ins Seitenende gehängt: Im Seitenkopf würde dessen Unschärfe-Effekt
          (backdrop-filter) das feste Fenster auf die Kopfhöhe beschneiden. */}
      {dialogMode ? createPortal(
        <AuthDialog
          initialMode={dialogMode}
          audience="freelancer"
          // Nach der Bestätigung per E-Mail zurück zum Formular, nicht in den Chat.
          destination="/bewerber-portal/apply"
          onClose={() => setDialogMode(null)}
          onAuthenticated={() => window.location.reload()}
          showToast={(message, tone) => setNotice({ message, tone: tone === "error" ? "error" : "success" })}
        />,
        document.body,
      ) : null}
    </>
  );
}
