"use client";
import { useEffect, useState } from "react";
type RequestView = { projectTitle: string | null; freelancerName: string | null; status: string; commercialModel: string };
export function ConsentForm() {
  const [request, setRequest] = useState<RequestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const token = new URLSearchParams(window.location.search).get("t");
    void fetch(`/api/introductions/consent?t=${encodeURIComponent(token ?? "")}`, { credentials: "same-origin", cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Dieser Link ist ungültig, abgelaufen oder die Anfrage derzeit nicht verfügbar.");
      const body = await response.json(); if (alive) setRequest(body);
    }).catch(cause => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, []);
  const decide = async (decision: "accept" | "decline") => {
    setBusy(true); setError(null);
    try {
      const token = new URLSearchParams(window.location.search).get("t");
      const response = await fetch("/api/introductions/consent", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, decision }) });
      if (!response.ok) throw new Error("Ihre Entscheidung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
      const body = await response.json();
      if (!body.status) throw new Error("Der Status konnte nicht bestätigt werden. Bitte laden Sie die Seite neu.");
      setRequest(current => current ? { ...current, status: body.status } : current);
      setNotice(body.status === "ready_to_book" ? "Kontaktfreigabe gespeichert. Ihre freigegebene E-Mail-Adresse wird der anfragenden Person übermittelt. Ein Projektstart ist damit nicht zugesagt." : body.status === "cancelled" ? "Kontaktanfrage abgelehnt. Ihre Kontaktdaten werden für diese Anfrage nicht freigegeben." : "Diese Anfrage wurde bereits bearbeitet.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ihre Entscheidung konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  };
  return <section><h1>Kontaktanfrage an Sie</h1>{!request && !error ? <p role="status">Anfrage laden …</p> : null}{error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}{request ? <><p><strong>{request.freelancerName}</strong>, ein Recruiter möchte mit Ihnen zu <strong>{request.projectTitle ?? "einem Kundenprojekt"}</strong> Kontakt aufnehmen.</p><p>Die Freigabe übermittelt Ihre dokumentierte Kontakt-E-Mail-Adresse an die anfragende Person. Sie erhalten deren Kontaktdaten für den direkten Austausch. Neue Anfragen sind provisionsfrei. Die Freigabe bestätigt weder Interesse an einer Beauftragung noch aktuelle Verfügbarkeit.</p>{request.status === "requested" ? <div className="dialog-actions"><button type="button" className="primary-action" disabled={busy} onClick={() => void decide("accept")}>{busy ? "Entscheidung speichern …" : "Kontakt für diese Anfrage freigeben"}</button><button type="button" className="secondary-action" disabled={busy} onClick={() => void decide("decline")}>Kontaktanfrage ablehnen</button></div> : <p>Diese Anfrage ist bereits bearbeitet. Status: {request.status === "cancelled" ? "abgelehnt" : request.status === "ready_to_book" ? "Kontakt freigegeben" : "beendet"}.</p>}</> : null}<p><a href="/privacy">Datenschutzhinweise</a></p></section>;
}
