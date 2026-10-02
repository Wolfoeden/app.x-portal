"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import styles from "@/components/admin/cockpit.module.css";
import { appPath } from "@/lib/app-path";
import {
  CONTACT_STAGES,
  CONTACT_STAGE_LABELS,
  contactMailDraft,
  followUpDate,
  mailtoHref,
  type Contact,
  type ContactStage,
} from "@/lib/crm/contacts-model";

/**
 * Die Arbeit an einem Kontakt: Stufe, Wiedervorlage, Mail, Notiz.
 *
 * „Mail schreiben“ öffnet das eigene Mailprogramm mit einem Entwurf. Ob die
 * Mail tatsächlich rausging, weiß XPORTAL nicht; deshalb ist „Als
 * angeschrieben markieren“ ein eigener Klick, der die Wiedervorlage in einer
 * Woche gleich mitsetzt.
 */
export function ContactEditor({ contact }: { contact: Contact }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState(contact.nextFollowUpOn ?? "");
  const draft = contactMailDraft(contact);
  const blocked = contact.stage === "do_not_contact";

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(appPath(`/api/admin/contacts/${contact.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; contact?: Contact };
      if (!response.ok) {
        setError(payload.error ?? `Fehler ${response.status}.`);
        return false;
      }
      if (payload.contact) setFollowUp(payload.contact.nextFollowUpOn ?? "");
      setNotice(success);
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("Die Verbindung ist abgebrochen.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`${contact.contactName ?? contact.company} endgültig löschen? Der Verlauf geht mit.`)) return;
    setBusy(true);
    try {
      const response = await fetch(appPath(`/api/admin/contacts/${contact.id}`), {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? `Fehler ${response.status}.`);
        return;
      }
      router.push("/chat/admin/kontakte");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.cardBody} style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span className={styles.tileLabel} id="contact-stage">Stufe</span>
        <div className={styles.segmented} role="group" aria-labelledby="contact-stage">
          {CONTACT_STAGES.map((stage: ContactStage) => (
            <button
              key={stage}
              type="button"
              aria-pressed={contact.stage === stage}
              disabled={busy}
              onClick={() => contact.stage !== stage && patch({ stage }, `Stufe: ${CONTACT_STAGE_LABELS[stage]}.`)}
            >
              {CONTACT_STAGE_LABELS[stage]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span className={styles.tileLabel}>Ansprache</span>
        {blocked ? (
          <p className={styles.cardNote}>Dieser Kontakt hat widersprochen. Keine weitere Ansprache.</p>
        ) : contact.email ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <a className={styles.buttonPrimary} href={mailtoHref(contact.email, draft)}>
              Mail schreiben
            </a>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`Betreff: ${draft.subject}\n\n${draft.body}`);
                  setNotice("Entwurf kopiert.");
                } catch {
                  setError("Kopieren ist in diesem Browser nicht erlaubt.");
                }
              }}
            >
              Entwurf kopieren
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() =>
                patch(
                  { markContacted: true, nextFollowUpOn: followUpDate(new Date(), 7) },
                  "Als angeschrieben markiert, Wiedervorlage in einer Woche.",
                )
              }
            >
              Als angeschrieben markieren
            </button>
          </div>
        ) : (
          <p className={styles.cardNote}>
            Keine öffentliche E-Mail-Adresse.{" "}
            {contact.emailSourceUrl ? (
              <a className={styles.textLink} href={contact.emailSourceUrl} target="_blank" rel="noopener noreferrer">
                Kontaktseite öffnen ↗
              </a>
            ) : null}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 8 }}>
        <label className={styles.field}>
          Wiedervorlage
          <input
            className={styles.input}
            type="date"
            value={followUp}
            disabled={busy || blocked}
            onChange={(event) => setFollowUp(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={styles.button}
          disabled={busy || blocked || followUp === (contact.nextFollowUpOn ?? "")}
          onClick={() => patch({ nextFollowUpOn: followUp || null }, followUp ? "Wiedervorlage gesetzt." : "Wiedervorlage entfernt.")}
        >
          Speichern
        </button>
        {[3, 7, 14].map((days) => (
          <button
            key={days}
            type="button"
            className={styles.button}
            disabled={busy || blocked}
            onClick={() => patch({ nextFollowUpOn: followUpDate(new Date(), days) }, `Wiedervorlage in ${days} Tagen.`)}
          >
            +{days} Tage
          </button>
        ))}
      </div>

      <label className={styles.field}>
        Notiz zum Verlauf
        <textarea
          className={styles.textarea}
          style={{ minHeight: 80 }}
          value={note}
          maxLength={2000}
          onChange={(event) => setNote(event.target.value)}
          placeholder="z. B. Rückruf vereinbart, sucht ab November zwei AI Engineers"
        />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
        <button
          type="button"
          className={styles.button}
          disabled={busy || !note.trim()}
          onClick={async () => {
            if (await patch({ addNote: note }, "Notiz gespeichert.")) setNote("");
          }}
        >
          Notiz speichern
        </button>
        <button type="button" className={styles.buttonDanger} disabled={busy} onClick={remove}>
          Kontakt löschen
        </button>
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice && !error ? <p className={styles.success} role="status">{notice}</p> : null}
    </div>
  );
}
