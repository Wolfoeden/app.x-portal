import styles from "./start.module.css";

const MAILS = [
  { from: "Kunde GmbH", time: "09:14", subject: "Angebot für 3 Positionen", tag: "Entwurf fertig", tone: "done", active: true },
  { from: "Muster AG", time: "08:52", subject: "Wo bleibt unsere Lieferung?", tag: "Status aus ERP beantwortet", tone: "info", active: false },
  { from: "Beispiel KG", time: "08:31", subject: "Reklamation Auftrag 4711", tag: "an Sie weitergeleitet", tone: "open", active: false },
] as const;

/**
 * Das Bild im ersten Bildschirm (Entwurf „Klarsicht“, 19.10.2026): ein
 * Postfach, in dem ein KI-Agent Anfragen sortiert und eine Antwort zur
 * Freigabe vorbereitet. Ein ausgedachtes Beispiel, so beschriftet; Absender
 * und Auftrag sind keine Kunden.
 */
export function InboxPreview() {
  return (
    <figure className={styles.inbox} aria-label="Beispiel: Ein KI-Agent bereitet im Postfach eine Antwort zur Freigabe vor">
      <div className={styles.inboxBar}>
        <span>Postfach · Vertrieb</span>
        <span>Beispiel</span>
      </div>
      <div className={styles.inboxBody}>
        <ul className={styles.inboxList}>
          {MAILS.map((mail) => (
            <li key={mail.from} data-active={mail.active ? "true" : undefined}>
              <p><strong>{mail.from}</strong><span>{mail.time}</span></p>
              <p>{mail.subject}</p>
              <span className={styles.tag} data-tone={mail.tone}>{mail.tag}</span>
            </li>
          ))}
        </ul>
        <div className={styles.draft}>
          <ul className={styles.draftFacts}>
            <li>Anliegen: Angebotsanfrage</li>
            <li>Bestand: alle 3 lieferbar</li>
            <li>Preise: aus Ihrer Preisliste</li>
          </ul>
          <div className={styles.draftText}>
            <p>ENTWURF DER KI</p>
            <p>Guten Tag Frau Berger,</p>
            <p>vielen Dank für Ihre Anfrage. Alle drei Positionen sind ab Lager lieferbar. Ihr Angebot finden Sie im Anhang …</p>
          </div>
          <p className={styles.draftActions} aria-hidden="true">
            <span>Prüfen und senden</span>
            <span>Bearbeiten</span>
          </p>
        </div>
      </div>
    </figure>
  );
}
