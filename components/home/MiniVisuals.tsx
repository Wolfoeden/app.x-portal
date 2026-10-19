import type { ReactNode } from "react";

import { CheckIcon } from "./icons";
import styles from "./home.module.css";

/**
 * Kleine Bilder davon, was ein KI-Agent im Unternehmen liefert: sortierte
 * Anfragen und eine Antwort mit Quelle, für die Beispiele der Praxisseite.
 * Beispieldaten, keine echten Kunden.
 */

function Tag({ children, done = false }: { children: ReactNode; done?: boolean }) {
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
