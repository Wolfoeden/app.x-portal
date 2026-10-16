import { PROOF_SOURCES } from "@/lib/marketing/proof-sources";

import styles from "./home.module.css";

/** IBM · LUFTHANSA · VODAFONE, jeder Name ein Link auf die Quelle. */
export function ProofLinks({ small = false }: { small?: boolean }) {
  return (
    <ul className={styles.proofLinks} data-small={small ? "true" : undefined}>
      {PROOF_SOURCES.map((source) => (
        <li key={source.name}>
          <a href={source.href} target="_blank" rel="noopener noreferrer" title={source.title}>{source.name.toUpperCase()}</a>
        </li>
      ))}
    </ul>
  );
}
