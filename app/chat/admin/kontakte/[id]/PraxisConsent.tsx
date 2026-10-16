"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "@/components/admin/cockpit.module.css";
import { appPath } from "@/lib/app-path";

/**
 * Das „Ja“ aus dem Telefonat festhalten, bevor die Mail mit dem Link
 * rausgeht: als Notiz im Verlauf, mit Datum und Uhrzeit. Ohne dieses Ja ist
 * die Mail Werbung ohne Einwilligung (§ 7 Abs. 2 Nr. 2 UWG).
 */
export function PraxisConsent({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function record() {
    setState("busy");
    const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date());
    try {
      const response = await fetch(appPath(`/api/admin/contacts/${contactId}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ addNote: `Einwilligung am Telefon (${when}): Praxisbeispiele per E-Mail schicken.` }),
      });
      setState(response.ok ? "done" : "error");
      if (response.ok) router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <button type="button" className={styles.button} onClick={record} disabled={state === "busy" || state === "done"}>
        {state === "done" ? "Ja notiert" : "Ja am Telefon notieren"}
      </button>
      {state === "error" ? <span className={styles.muted}>Nicht gespeichert, bitte noch einmal.</span> : null}
    </div>
  );
}
