"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { appPath } from "@/lib/app-path";
import {
  MANDATE_CONFIRMATION,
  MANDATE_RESPONSE_HOURS,
  SEARCH_MANDATE_CONSENT_VERSION,
} from "@/lib/placement/mandate-model";

import { IconSpark } from "../icons";
import { trackFunnelEvent } from "./funnel-events";

type Step =
  | { kind: "ask" }
  | { kind: "email" }
  | { kind: "sending" }
  | { kind: "error"; message: string }
  | { kind: "done"; message: string; echo: boolean }
  | { kind: "dismissed" };

const FAILED = "Das hat gerade nicht geklappt. Versuchen Sie es bitte noch einmal.";

function AssistantLine({ children }: { children: ReactNode }) {
  return (
    <article className="message-row assistant-message mandate-ask" aria-label="Nachricht von XPORTAL">
      <div className="message-avatar" aria-hidden="true"><IconSpark size={15} /></div>
      <div className="message-content">
        <div className="message-author">XPORTAL</div>
        {children}
      </div>
    </article>
  );
}

/**
 * Suchauftrag als Teil des Gesprächs: Passt im Bestand niemand, fragt XPORTAL
 * in einer eigenen Antwort, ob es weitersuchen soll. Ein Klick genügt; mit
 * Konto gilt die Adresse des Kontos, ohne Konto fragt die Antwort nach der
 * E-Mail. Kein Formular, kein eigener Kasten.
 */
export function MandateCard({
  projectId,
  guest,
  preview = false,
}: {
  projectId: string | null;
  guest: boolean;
  preview?: boolean;
}) {
  const [step, setStep] = useState<Step>({ kind: "ask" });
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");

  // Liegt zu diesem Projekt schon ein Auftrag, sagt XPORTAL das gleich.
  useEffect(() => {
    if (!projectId || preview) return;
    let active = true;
    void fetch(appPath(`/api/search-mandates?projectId=${encodeURIComponent(projectId)}`), { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { mandate?: { message?: string } | null } | null) => {
        if (active && body?.mandate) setStep({ kind: "done", message: body.mandate.message ?? MANDATE_CONFIRMATION, echo: false });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [preview, projectId]);

  if (!projectId || step.kind === "dismissed") return null;

  const create = async () => {
    setStep({ kind: "sending" });
    if (preview) {
      setStep({ kind: "done", message: MANDATE_CONFIRMATION, echo: true });
      return;
    }
    try {
      const response = await fetch(appPath("/api/search-mandates"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          projectId,
          consentVersion: SEARCH_MANDATE_CONSENT_VERSION,
          ...(guest ? { guestContact: { email, ...(website ? { website } : {}) } } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string; created?: boolean };
      if (!response.ok) {
        setStep({ kind: "error", message: body.error ?? FAILED });
        return;
      }
      if (body.created) trackFunnelEvent("mandate_submitted", "no_match");
      setStep({ kind: "done", message: body.message ?? MANDATE_CONFIRMATION, echo: true });
    } catch {
      setStep({ kind: "error", message: FAILED });
    }
  };

  const submitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (email.trim()) void create();
  };

  if (step.kind === "done") {
    return (
      <>
        {step.echo ? (
          <article className="message-row user-message mandate-echo" aria-label="Ihre Nachricht">
            <div className="message-content"><p>Ja, bitte weitersuchen.</p></div>
          </article>
        ) : null}
        <AssistantLine>
          <p aria-live="polite">{step.message}</p>
        </AssistantLine>
      </>
    );
  }

  return (
    <AssistantLine>
      <p>
        Kein passendes Profil gefunden? Ich lege einen Suchauftrag an und suche automatisch weiter.
        Passende Profile kommen innerhalb von {MANDATE_RESPONSE_HOURS} Stunden per E-Mail, kostenlos und ohne Provision.
      </p>
      {step.kind === "email" || (step.kind === "error" && guest) || (step.kind === "sending" && guest) ? (
        <form className="mandate-reply" onSubmit={submitEmail}>
          <label className="sr-only" htmlFor={`mandate-email-${projectId}`}>E-Mail-Adresse</label>
          <input
            id={`mandate-email-${projectId}`}
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            placeholder="Ihre geschäftliche E-Mail"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={step.kind === "sending"}
          />
          {/* Für Menschen unsichtbar; ein Bot, der alles ausfüllt, verrät sich hier. */}
          <input className="placement-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(event) => setWebsite(event.target.value)} />
          <button type="submit" className="is-primary" disabled={step.kind === "sending" || !email.trim()}>
            {step.kind === "sending" ? "Wird angelegt …" : "Weitersuchen"}
          </button>
        </form>
      ) : (
        <div className="mandate-reply" role="group" aria-label="Antworten">
          <button
            type="button"
            className="is-primary"
            disabled={step.kind === "sending"}
            onClick={() => (guest ? setStep({ kind: "email" }) : void create())}
          >
            <IconSpark size={13} /> {step.kind === "sending" ? "Wird angelegt …" : "Suchauftrag erstellen"}
          </button>
          <button type="button" onClick={() => setStep({ kind: "dismissed" })} disabled={step.kind === "sending"}>
            Nein, danke
          </button>
        </div>
      )}
      {step.kind === "error" ? <p className="mandate-error" role="alert">{step.message}</p> : null}
      <p className="mandate-consent">
        Mit dem Klick darf XPORTAL Sie zu diesem Suchauftrag per E-Mail kontaktieren.{" "}
        <a href="/privacy#suchauftrag" target="_blank" rel="noopener noreferrer">Datenschutz</a>
      </p>
    </AssistantLine>
  );
}
