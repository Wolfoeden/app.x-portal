"use client";

import { useCallback, useEffect, useState } from "react";

type ContactStatus = {
  status: string;
  commercialModel: string;
  emailDelivery?: string | null;
  deliveryNeedsRetry?: boolean;
  contact?: { email: string; name: string; bookingUrl: string | null } | null;
};

/** Private data is loaded through the owner-scoped API, never from public profiles. */
export function RecruitingContactDetails({ projectId, profileId, introductionsPath }: {
  projectId: string; profileId: string; introductionsPath: string;
}) {
  const [record, setRecord] = useState<ContactStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({ projectId, profileId });
    const response = await fetch(`${introductionsPath}?${params}`, {
      credentials: "same-origin", cache: "no-store", signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Der Kontaktstatus konnte nicht geladen werden.");
    const body = await response.json();
    return (body.introduction ?? null) as ContactStatus | null;
  }, [introductionsPath, profileId, projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(result => {
      if (!controller.signal.aborted) setRecord(result);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Der Kontaktstatus konnte nicht geladen werden.");
    });
    return () => controller.abort();
  }, [load]);

  const update = async (retry: boolean) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (retry) {
        const response = await fetch(introductionsPath, {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ projectId, profileId, idempotencyKey: `contact:${projectId}:${profileId}`, contactConsent: true, retryDelivery: true }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || (response.status === 402
            ? "Zum erneuten Zustellen benötigen Sie eine aktive Testphase oder einen berechtigten Tarif."
            : "Die Benachrichtigung konnte nicht erneut zugestellt werden."));
        }
      }
      setRecord(await load());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bitte versuchen Sie es erneut."); }
    finally { setBusy(false); }
  };
  const active = record?.commercialModel === "no_fee" && record.status !== "cancelled";
  const contact = active ? record.contact : null;
  const retry = active && (record.deliveryNeedsRetry || record.emailDelivery === "failed" || record.emailDelivery === "pending");
  return <div className="conversation-note" aria-label="Privater Kontaktstatus" aria-busy={busy}>
    <div aria-live="polite">
      {contact ? <p><strong>Freigegebener Kontakt: {contact.name}</strong><br />
        <a href={`mailto:${encodeURIComponent(contact.email)}`}>{contact.email}</a><br />
        Interesse, Verfügbarkeit und Einsatzbedingungen bitte direkt abstimmen.
      </p> : active ? <p>Eine private Kontaktadresse ist noch nicht freigegeben.</p> : null}
      {retry ? <p>Eine Benachrichtigung ist noch offen oder fehlgeschlagen. Sie können die Zustellung erneut versuchen. Dadurch entsteht keine neue Anfrage.</p> : null}
      {active && !retry && record.emailDelivery === "sent" ? <p>Benachrichtigung versandt. Das bestätigt noch keine Antwort oder Zusage.</p> : null}
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="dialog-actions">
      <button className="secondary-action" type="button" disabled={busy} onClick={() => void update(false)}>Kontaktstatus aktualisieren</button>
      {retry ? <button className="secondary-action" type="button" disabled={busy} onClick={() => void update(true)}>{busy ? "Zustellung prüfen …" : "Benachrichtigung erneut zustellen"}</button> : null}
    </div>
  </div>;
}
