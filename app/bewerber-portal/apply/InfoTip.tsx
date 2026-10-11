import styles from "./apply.module.css";

export function InfoTip({ label, children }: { label: string; children: string }) {
  return (
    <span className={styles.infoTip} tabIndex={0} title={children} aria-label={`${label}: ${children}`}>i</span>
  );
}
