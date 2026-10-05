import { contactInitials, SALES_CONTACT } from "@/lib/sales/sales-contact-model";

import styles from "./contact-person.module.css";

/**
 * Der Mensch hinter dem Gespräch. Die Initialen liegen immer darunter; das
 * Foto kommt als Hintergrundbild einer eigenen Ebene darüber. Lädt es nicht,
 * bleibt die Ebene durchsichtig und die Initialen sind zu sehen statt eines
 * kaputten Bildes.
 */
export function ContactPerson({
  photoUrl = null,
  note = "Führt das Gespräch persönlich.",
  className,
}: {
  photoUrl?: string | null;
  note?: string;
  className?: string;
}) {
  return (
    <figure className={className ? `${styles.card} ${className}` : styles.card}>
      <span
        className={styles.avatar}
        role={photoUrl ? "img" : undefined}
        aria-label={photoUrl ? `Foto von ${SALES_CONTACT.name}` : undefined}
        aria-hidden={photoUrl ? undefined : true}
      >
        <span aria-hidden="true">{contactInitials(SALES_CONTACT.name)}</span>
        {photoUrl ? (
          <span className={styles.photo} style={{ backgroundImage: `url(${JSON.stringify(photoUrl)})` }} aria-hidden="true" />
        ) : null}
      </span>
      <figcaption>
        <span className={styles.label}>Ihr Ansprechpartner</span>
        <strong>{SALES_CONTACT.name}</strong>
        <span>{SALES_CONTACT.role}</span>
        {note ? <span className={styles.note}>{note}</span> : null}
      </figcaption>
    </figure>
  );
}
