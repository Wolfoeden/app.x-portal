"use client";

import { useEffect, useState } from "react";
import "@/app/styles/legal.css";

import {
  PublicDocumentIntro,
  PublicFooter,
  PublicHeader,
} from "@/components/public/PublicChrome";
import { completeEmailAuthSession } from "@/lib/auth/browser";
import {
  emailAuthFailurePath,
  parseEmailAuthCompletion,
} from "@/lib/auth/email-completion";

export default function CompleteEmailAuthPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const completion = parseEmailAuthCompletion(window.location.href);

    // Query codes and fragment tokens are credentials. Remove them from the
    // visible URL before creating the authenticated browser session.
    window.history.replaceState({}, "", completion.sanitizedPath);

    const fail = () => {
      if (!active) return;
      setFailed(true);
      window.location.replace(emailAuthFailurePath(completion.destination));
    };

    if (completion.hasProviderError) {
      fail();
      return () => {
        active = false;
      };
    }

    void completeEmailAuthSession(completion)
      .then(({ claimWarning }) => {
        if (!active) return;
        const destination = new URL(
          completion.destination,
          window.location.origin,
        );
        if (claimWarning) {
          destination.searchParams.set("claim_warning", "transfer_pending");
        }
        window.location.replace(`${destination.pathname}${destination.search}`);
      })
      .catch(fail);

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="xlegal" lang="de" aria-live="polite" aria-busy={!failed}>
      <PublicHeader context="Zugang" />
      <main className="xlegal-document xlegal-document-compact">
        <PublicDocumentIntro
          eyebrow="Sicherer Zugang"
          title={failed ? "Link konnte nicht bestätigt werden." : "Zugang wird bestätigt."}
          signal={{
            label: "Status",
            value: failed ? "Neuen Link anfordern" : "Prüfung läuft",
          }}
        >
          <p>
            {failed
              ? "Sie werden sicher zur Anmeldung zurückgeführt. Fordern Sie dort bei Bedarf einen neuen Link an."
              : "Einen Moment bitte. Danach können Sie Ihr Passwort sicher festlegen."}
          </p>
        </PublicDocumentIntro>

        <section className="auth-transition" data-state={failed ? "failed" : "loading"}>
          <span className="auth-transition-mark" aria-hidden="true">
            {failed ? "!" : "↗"}
          </span>
          <div>
            <h2>{failed ? "Zurück zur Anmeldung" : "Verschlüsselter Übergang"}</h2>
            <p>
              {failed
                ? "Der fehlerhafte Link wird verworfen; es werden keine Zugangsdaten übernommen."
                : "Zugangsdaten werden aus der sichtbaren Adresse entfernt, bevor die Sitzung erstellt wird."}
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
