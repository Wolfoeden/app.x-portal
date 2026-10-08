"use client";
import { useEffect, useState, type FormEvent } from "react";
import { appPath } from "@/lib/app-path";
import { placementTermsSummary } from "@/lib/placement/config";
import type { FreelancerProfileResult } from "../chat-contract";
import { IconArrowRight, IconCheck } from "../icons";
import { Modal } from "./dialogs";
import { RecruitingContactDetails } from "./recruiting-contact-details";
import { initials } from "./shared";
type Introduction = { id: string; status: string; commercialModel?: string; emailDelivery?: string };
type View = "loading" | "form" | "waiting" | "introduced" | "declined" | "no_project" | "login" | "error";
export function contactRequestView(introduction: Introduction | null): View {
  if (!introduction) return "form";
  if (introduction.status === "cancelled") return "declined";
  if (["ready_to_book", "booked", "completed"].includes(introduction.status)) return "introduced";
  return "waiting";
}
export function PlacementDialog({ profile, projectId, introductionsPath, preview = false, guest = false, onRequested, onClose }: { profile: FreelancerProfileResult; projectId: string | null; introductionsPath: string; preview?: boolean; guest?: boolean; onRequested?: () => void; onClose: () => void }) {
  const [view, setView] = useState<View>(guest ? "login" : projectId ? preview ? "form" : "loading" : "no_project");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<Introduction | null>(null);
  useEffect(() => {
    if (!projectId || preview || guest) return;
    let alive = true;
    const params = new URLSearchParams({ projectId, profileId: profile.id });
    void fetch(`${introductionsPath}?${params}`, { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Der Stand Ihrer Anfrage ist gerade nicht abrufbar.");
      const body = await response.json();
      if (alive) { setRecord(body.introduction ?? null); setView(contactRequestView(body.introduction ?? null)); }
    }).catch(cause => { if (alive) { setError(cause.message); setView("error"); } });
    return () => { alive = false; };
  }, [guest, introductionsPath, preview, profile.id, projectId]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !accepted || busy || guest) return;
    if (preview) { setView("waiting"); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(introductionsPath, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ projectId, profileId: profile.id, idempotencyKey: `contact:${projectId}:${profile.id}`, contactConsent: true }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Die Kontaktanfrage konnte nicht gesendet werden.");
      if (!body.introduction) throw new Error("Der Anfragestatus konnte nicht bestätigt werden. Bitte aktualisieren Sie Ihre Gespräche.");
      const introduction = { ...body.introduction, emailDelivery: body.emailDelivery ?? body.introduction.emailDelivery };
      setRecord(introduction); setView(contactRequestView(introduction)); onRequested?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Die Kontaktanfrage konnte nicht gesendet werden."); }
    finally { setBusy(false); }
  };
  const historical = record?.commercialModel === "legacy_placement";
  return <Modal titleId="placement-title" onClose={onClose} size="large"><div className="contact-dialog placement-dialog">
    <div className="contact-dialog-header"><div className={`contact-profile-avatar ${profile.avatarUrl ? "has-image" : ""}`} style={profile.avatarUrl ? { backgroundImage: `url(${JSON.stringify(profile.avatarUrl)})` } : undefined} aria-hidden="true">{profile.avatarUrl ? null : initials(profile.displayName)}</div><div><span className="dialog-eyebrow">Kontakt bewusst anfragen</span><h2 id="placement-title">{profile.displayName} anfragen</h2><p>{profile.role}</p></div></div>
    {historical ? <p className="placement-status">Historischer Vorgang. Die damals vereinbarten <a href="/vermittlungsbedingungen">Vermittlungsbedingungen</a> bleiben unverändert. Diese Anzeige erzeugt keine neue Anfrage.</p> : null}
    {view === "loading" ? <p className="placement-status" role="status">Anfragestatus laden …</p> : null}
    {view === "login" ? <p className="placement-status">Für neue Kontaktanfragen benötigen Sie ein bestätigtes Konto mit aktivem Trial oder bezahltem Tarif. <a href="/preise#tarife">Tarif wählen</a></p> : null}
    {view === "no_project" ? <p className="placement-status">Öffnen Sie Ihr Projekt und fragen Sie dort an. So bleibt der konkrete Projektbezug erhalten.</p> : null}
    {view === "form" ? <form className="placement-form" onSubmit={submit}>
      <ul className="placement-terms">{placementTermsSummary().map(line => <li key={line}><span aria-hidden="true"><IconCheck size={13} /></span>{line}</li>)}</ul>
      <p className="placement-next"><strong>So geht es weiter:</strong> XPORTAL sendet eine einzelne Anfrage an den freigegebenen Kontaktweg. {profile.displayName} entscheidet selbst über die Kontaktfreigabe. Interesse und aktuelle Verfügbarkeit sind bis zur ausdrücklichen Bestätigung offen.</p>
      <label className="placement-consent"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Ich möchte diese Kontaktanfrage senden und erlaube, nach der Freigabe meinen Namen, meine Konto-E-Mail-Adresse und den Projekttitel an {profile.displayName} zu übermitteln. <a href="/privacy" target="_blank" rel="noopener noreferrer">Datenschutzhinweise</a></span></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}<div className="dialog-actions"><button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Abbrechen</button><button className="primary-action" type="submit" disabled={busy || !accepted}>{busy ? "Anfrage senden …" : "Kontaktanfrage senden"}</button></div>
    </form> : null}
    {view === "waiting" ? <div className="confirmation-state" role="status"><span aria-hidden="true"><IconCheck size={16} /></span><h3>Kontaktanfrage gespeichert</h3><p>{record?.emailDelivery === "failed" ? "Die E-Mail konnte noch nicht zugestellt werden. Eine Freigabe liegt noch nicht vor. Den Status sehen Sie unter Gespräche." : "Die Kontaktfreigabe steht noch aus. Der Freelancer entscheidet selbst; Interesse und Verfügbarkeit sind nicht bestätigt."}</p><a className="booking-link-action" href={appPath("/gespraeche")}>Zu Ihren Gesprächen <IconArrowRight size={13} /></a></div> : null}
    {view === "introduced" ? <div className="confirmation-state" role="status"><span aria-hidden="true"><IconCheck size={16} /></span><h3>{historical ? "Sie wurden vorgestellt" : "Kontaktweg freigegeben"}</h3><p>Nutzen Sie den freigegebenen Kontaktweg für den weiteren Austausch. Bestätigen Sie Verfügbarkeit, Honorar und Einsatzbedingungen direkt miteinander. Die Kontaktfreigabe ist noch keine Zusage für den Einsatz.</p>{profile.bookingUrl ? <a className="booking-link-action" href={appPath(`/api/freelancers/${profile.id}/book`)} target="_blank" rel="noopener noreferrer">Termin wählen <IconArrowRight size={13} /></a> : <p>Die freigegebenen Kontaktdaten werden per E-Mail übermittelt.</p>}</div> : null}
    {!historical && !preview && !guest && projectId && (view === "waiting" || view === "introduced") ? <RecruitingContactDetails projectId={projectId} profileId={profile.id} introductionsPath={introductionsPath} /> : null}
    {view === "declined" ? <div className="placement-status" role="status"><p>Die Kontaktanfrage wurde abgelehnt oder beendet. Sie können weitere Profile prüfen oder Ihre Kriterien bearbeiten.</p><a href="/chat">Projekt weiterbearbeiten</a></div> : null}
    {view === "error" && error ? <p className="form-error" role="alert">{error}</p> : null}
  </div></Modal>;
}
