import type { ReactNode } from "react";

import { CheckIcon } from "./icons";
import styles from "./home.module.css";

/**
 * Kleine Bilder davon, was ein KI-Agent im Unternehmen liefert: sortierte
 * Anfragen, ein vorbereitetes Angebot, eine Antwort mit Quelle. Sie stehen
 * in der Ablaufgrafik der Startseite und in den Beispielen der
 * Praxisseite. Beispieldaten, keine echten Kunden.
 */

export function Tag({ children, done = false }: { children: ReactNode; done?: boolean }) {
  return <span className={styles.tag} data-done={done ? "true" : undefined}>{done ? <CheckIcon size={12} /> : null}{children}</span>;
}

export function InboxVisual({ rows }: { rows: readonly { text: string; tag: string; done?: boolean }[] }) {
  return (
    <div className={styles.visual}>
      {rows.map((row) => (
        <div key={row.text} className={styles.visualRow}>
          <span>{row.text}</span>
          <Tag done={row.done}>{row.tag}</Tag>
        </div>
      ))}
    </div>
  );
}

export function OfferVisual({ fields, footnote }: { fields: readonly (readonly [string, string])[]; footnote: string }) {
  return (
    <div className={styles.visual}>
      <div className={styles.offer}>
        <p className={styles.offerHead}><strong>Angebot · Entwurf</strong><Tag done>fertig</Tag></p>
        <dl>
          {fields.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        <p className={styles.offerFoot}>{footnote}</p>
      </div>
    </div>
  );
}

export function AnswerVisual({ question, answer, source }: { question: string; answer: string; source: string }) {
  return (
    <div className={styles.visual}>
      <p className={styles.question}>{question}</p>
      <div className={styles.answer}>
        <p><strong>{answer}</strong></p>
        <p className={styles.answerSource}><span aria-hidden="true" />Quelle: {source}</p>
      </div>
    </div>
  );
}
