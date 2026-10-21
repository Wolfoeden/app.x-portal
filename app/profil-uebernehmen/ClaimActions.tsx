"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";

import { AuthDialog } from "@/components/chat/dialogs";
import type { AuthDialogMode } from "@/components/chat/shared";
import { appPath } from "@/lib/app-path";

import styles from "@/app/bewerber-portal/apply/apply.module.css";

export type ClaimState = "signed_out" | "ready" | "has_profile";

const CLAIM_AUTH_COPY = {
  title: "Konto anlegen und Profil übernehmen",
  body: "Nach der Bestätigung kommen Sie hierher zurück und übernehmen Ihr Profil mit einem Klick.",
  afterConfirmation: "Danach übernehmen Sie Ihr Profil mit einem Klick.",
};

/** Anmelden, dann mit einem Klick übernehmen. */
export function ClaimActions({ token, state, destination }: { token: string; state: ClaimState; destination: string }) {
  const [dialogMode, setDialogMode] = useState<AuthDialogMode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentSearchIndex, setConsentSearchIndex] = useState(false);
  const [consentMarketStats, setConsentMarketStats] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state === "has_profile") {
    return (
      <p className={styles.callout}>
        Ihr Konto hat bereits ein Profil. Schreiben Sie uns über das <Link href="/contact">Kontaktformular</Link>, dann führen wir beide zusammen.
      </p>
    );
  }

  if (state === "signed_out") {
    return (
      <>
        <div className={styles.actions}>
          <button type="button" className={styles.submit} onClick={() => setDialogMode("register")}>Mit Konto übernehmen<span aria-hidden="true">→</span></button>
          <button type="button" className={styles.textButton} onClick={() => setDialogMode("login")}>Schon registriert? Anmelden</button>
        </div>
        {notice ? <p className={styles.importNote} role="status">{notice}</p> : null}
        {dialogMode ? createPortal(
          <AuthDialog
            initialMode={dialogMode}
            audience="freelancer"
            freelancerCopy={CLAIM_AUTH_COPY}
            destination={destination}
            onClose={() => setDialogMode(null)}
            onAuthenticated={() => window.location.reload()}
            showToast={(message) => setNotice(message)}
          />,
          document.body,
        ) : null}
      </>
    );
  }

  const claim = async () => {
    if (!consent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(appPath("/api/freelancer/claim"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, consent, consentSearchIndex, consentMarketStats }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Das Profil konnte gerade nicht übernommen werden.");
        return;
      }
      window.location.assign(appPath("/bewerber-portal/apply"));
    } catch {
      setError("Keine Verbindung zum Server. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.claimForm}>
      <label className={styles.consent}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Das ist mein Profil. Ich stimme den <Link href="/terms">AGB</Link> zu; das Profil bleibt für Unternehmen im Matching sichtbar.</span></label>
      <label className={styles.consent}><input type="checkbox" checked={consentSearchIndex} onChange={(event) => setConsentSearchIndex(event.target.checked)} /><span>Mein Profil darf in Suchmaschinen wie Google erscheinen, ohne Kontaktdaten. <span className={styles.optional}>Freiwillig</span></span></label>
      <label className={styles.consent}><input type="checkbox" checked={consentMarketStats} onChange={(event) => setConsentMarketStats(event.target.checked)} /><span>Honorar, Kompetenzen und Verfügbarkeit dürfen anonymisiert in Marktstatistiken einfließen, nie einzeln erkennbar. <span className={styles.optional}>Freiwillig</span></span></label>
      {error ? <p className={styles.formError} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.submit} disabled={!consent || busy} onClick={() => void claim()}>{busy ? "Wird übernommen …" : "Profil übernehmen"}<span aria-hidden="true">→</span></button>
      </div>
    </div>
  );
}
