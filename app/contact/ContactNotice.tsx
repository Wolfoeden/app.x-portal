"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { Notice } from "@/components/ui/Primitives";
import { appPath } from "@/lib/app-path";
import { topicsFromQuery, type ContactTopicKey } from "@/lib/contact/topics";
import { IMPRINT_EMAIL } from "@/lib/legal/policy";
import { SALES_CALENDAR_PATH, SALES_CALL_VIEW_PATH } from "@/lib/sales/sales-call-model";
import { phoneHref, SALES_CONTACT } from "@/lib/sales/sales-contact-model";

const noSubscription = () => () => undefined;

/** Die Suchparameter der Adresse; beim Build (statische Seite) leer. */
function useSearch(): string {
  return useSyncExternalStore(noSubscription, () => window.location.search, () => "");
}

/**
 * Alte Links mit `?thema=` oder `?betreff=` (Mails, Lesezeichen): die
 * Adresse der Themenseite, mit den übrigen Parametern und dem Sprungziel.
 * Sonst `null`.
 */
export function legacyTopicPath(search: string, hash = ""): string | null {
  const query = new URLSearchParams(search);
  const topic = topicsFromQuery(query.getAll("thema"), query.getAll("betreff"))[0];
  if (!topic) return null;
  query.delete("thema");
  query.delete("betreff");
  const rest = query.toString();
  return `/contact/${topic}${rest ? `?${rest}` : ""}${hash}`;
}

/** Die Rückmeldung über dem Formular nach dem Absenden (`?status=`). */
export function ContactStatusNotice({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const status = params.get("status");
  const token = params.get("t");

  if (status === "sent") {
    // Mit Token füllt /contact/termin den Kalender mit Name und Adresse vor.
    const bookingHref = `${SALES_CALENDAR_PATH}?${token ? `t=${encodeURIComponent(token)}` : "von=contact"}`;
    return (
      <Notice title="Eingegangen" tone="success" role="status">
        <p>
          Danke, Ihre Anfrage ist angekommen. Eine Bestätigung geht an Ihre E-Mail-Adresse.
          {" "}Lieber gleich einen Termin? <a href={bookingHref} target="_blank" rel="noopener noreferrer nofollow">Termin wählen</a>
        </p>
      </Notice>
    );
  }
  if (status === "invalid") {
    return (
      <Notice title="Bitte prüfen" tone="warning" role="alert">
        <p>Bitte Thema, Name und eine gültige E-Mail-Adresse angeben. Die Telefonnummer darf nur Ziffern, Leerzeichen und + ( ) / - enthalten.</p>
      </Notice>
    );
  }
  if (status === "error") {
    return (
      <Notice title="Nicht gespeichert" tone="error" role="alert">
        <p>
          Die Anfrage konnte gerade nicht entgegengenommen werden. Rufen Sie an unter{" "}
          <a href={phoneHref(SALES_CONTACT.phone)}>{SALES_CONTACT.phone}</a> oder schreiben Sie an{" "}
          <a href={`mailto:${IMPRINT_EMAIL}`}>{IMPRINT_EMAIL}</a>.
        </p>
      </Notice>
    );
  }
  return null;
}

/**
 * Was auf der statischen Kontaktseite von der Adresse abhängt:
 *
 * - `?status=` nach dem Absenden (/api/contact leitet zurück): die
 *   Rückmeldung über dem Formular.
 * - Sonst zählt der Aufruf im Umsatzweg als „Kontaktseite aufgerufen“, mit
 *   `?von=` als Herkunft und dem Thema der Seite.
 * - Alte Links mit `?thema=` oder `?betreff=` gehen auf die Seite des
 *   Themas; gezählt wird dort.
 */
export function ContactNotice({ topic }: { topic?: ContactTopicKey }) {
  const router = useRouter();
  const search = useSearch();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("status")) return;
    const legacy = topic ? null : legacyTopicPath(window.location.search, window.location.hash);
    if (legacy) {
      router.replace(legacy);
      return;
    }
    void fetch(appPath(SALES_CALL_VIEW_PATH), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({ von: query.get("von"), thema: topic ?? null }),
    }).catch(() => undefined);
  }, [router, topic]);

  return <ContactStatusNotice search={search} />;
}
