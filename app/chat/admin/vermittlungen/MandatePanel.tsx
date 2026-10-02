"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import styles from "@/components/admin/cockpit.module.css";
import { mailtoHref } from "@/lib/crm/contacts-model";
import { appPath } from "@/lib/app-path";
import type { MandateStatus } from "@/lib/placement/mandate-model";
import type { MandateCandidate, ProfileOption } from "@/lib/placement/mandates";

/**
 * Die Arbeit an einem Suchauftrag: Freelancer zuordnen, Stand setzen, dem
 * Kunden schreiben.
 *
 * „Zuordnen“ legt eine Anfrage an, die oben unter „Wartet auf Vorstellung“
 * erscheint und dort wie jede andere vorgestellt wird — erst das schreibt
 * beiden Seiten. Zuordnen allein verschickt nichts.
 */
export function MandatePanel({
  mandateId,
  status,
  candidates,
  profileOptions,
  contactEmail,
  draft,
}: {
  mandateId: string;
  status: MandateStatus;
  candidates: MandateCandidate[];
  profileOptions: ProfileOption[];
  contactEmail: string;
  draft: { subject: string; body: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const open = status === "open" || status === "in_progress";

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(appPath(`/api/admin/search-mandates/${mandateId}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? `Fehler ${response.status}.`);
        return;
      }
      setNotice(success);
      startTransition(() => router.refresh());
    } catch {
      setError("Die Verbindung ist abgebrochen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      {open ? (
        <>
          {candidates.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              <span className={styles.tileLabel}>Vorschläge aus dem Abgleich</span>
              <ul className={styles.list} style={{ border: "1px solid #eceee8", borderRadius: 10 }}>
                {candidates.map((candidate) => (
                  <li className={styles.listItem} key={candidate.profileId}>
                    <span>
                      <span className={styles.listTitle}>{candidate.displayName}</span>
                      <br />
                      <span className={styles.listMeta}>
                        {candidate.role}
                        {candidate.coverage !== null ? ` · ${candidate.coverage} % der Kernanforderungen` : ""}
                        {candidate.partial ? " · Teiltreffer" : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={styles.button}
                      disabled={busy}
                      onClick={() => patch({ assignProfileId: candidate.profileId }, `${candidate.displayName} zugeordnet. Die Anfrage steht oben zum Vorstellen bereit.`)}
                    >
                      Zuordnen
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className={styles.cardNote}>Der Abgleich findet im Bestand niemanden, der genug passt. Freelancer von Hand wählen oder extern suchen.</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 8 }}>
            <label className={styles.field}>
              Anderen Freelancer zuordnen
              <select className={styles.select} value={selected} onChange={(event) => setSelected(event.target.value)} disabled={busy}>
                <option value="">Profil wählen …</option>
                {profileOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.displayName} — {option.role}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.button}
              disabled={busy || !selected}
              onClick={() => {
                const option = profileOptions.find((entry) => entry.id === selected);
                void patch({ assignProfileId: selected }, `${option?.displayName ?? "Freelancer"} zugeordnet.`).then(() => setSelected(""));
              }}
            >
              Zuordnen
            </button>
          </div>
        </>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <a className={styles.buttonPrimary} href={mailtoHref(contactEmail, draft)}>
          Mail an den Kunden
        </a>
        {status === "open" ? (
          <button type="button" className={styles.button} disabled={busy} onClick={() => patch({ status: "in_progress" }, "In Bearbeitung.")}>
            In Bearbeitung
          </button>
        ) : null}
        {open ? (
          <>
            <button type="button" className={styles.button} disabled={busy} onClick={() => patch({ status: "introduced" }, "Als vorgestellt markiert.")}>
              Vorgestellt
            </button>
            <button type="button" className={styles.button} disabled={busy} onClick={() => patch({ status: "closed" }, "Abgeschlossen.")}>
              Abschließen
            </button>
            <button
              type="button"
              className={styles.buttonDanger}
              disabled={busy}
              onClick={() => {
                if (window.confirm("Suchauftrag ablehnen? Dem Kunden wird nichts geschickt; schreiben Sie ihm bei Bedarf selbst.")) {
                  void patch({ status: "declined" }, "Abgelehnt.");
                }
              }}
            >
              Ablehnen
            </button>
          </>
        ) : (
          <button type="button" className={styles.button} disabled={busy} onClick={() => patch({ status: "in_progress" }, "Wieder geöffnet.")}>
            Wieder öffnen
          </button>
        )}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice && !error ? <p className={styles.success} role="status">{notice}</p> : null}
    </div>
  );
}
