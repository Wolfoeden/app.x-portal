"use client";

import { useEffect, useState } from "react";

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
    <main className="auth-completion-page" aria-live="polite">
      <section className="auth-completion-card">
        <span className="auth-completion-mark">X</span>
        <p className="auth-completion-kicker">XPORTAL</p>
        <h1>
          {failed ? "Link konnte nicht bestätigt werden" : "Zugang wird bestätigt"}
        </h1>
        <p>
          {failed
            ? "Sie werden sicher zur Anmeldung zurückgeführt. Fordern Sie dort bei Bedarf einen neuen Link an."
            : "Einen Moment bitte. Danach können Sie Ihr Passwort sicher festlegen."}
        </p>
      </section>
    </main>
  );
}
