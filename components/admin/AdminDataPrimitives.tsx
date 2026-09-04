import type { ReactNode } from "react";
import Link from "next/link";

import styles from "./admin-data-primitives.module.css";

type MetricTone = "default" | "accent" | "warning" | "danger" | "muted";

export type AdminMetric = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: MetricTone;
};

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  titleMeta,
  backHref = "/chat",
  backLabel = "Zurück zum Chat",
  actions,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  titleMeta?: ReactNode;
  backHref?: string | null;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <div className={styles.titleLine}>
          <h1>{title}</h1>
          {titleMeta ? <div className={styles.titleMeta}>{titleMeta}</div> : null}
        </div>
        <div className={styles.description}>{description}</div>
      </div>
      <div className={styles.actions}>
        {actions}
        {backHref ? (
          <Link href={backHref} className={styles.backLink}>
            {backLabel}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

export function AdminMetricStrip({
  items,
  label,
}: {
  items: readonly AdminMetric[];
  label: string;
}) {
  return (
    <dl className={styles.metricStrip} aria-label={label}>
      {items.map((item) => (
        <div className={styles.metric} data-tone={item.tone ?? "default"} key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.detail ? <small>{item.detail}</small> : null}
        </div>
      ))}
    </dl>
  );
}

export function AdminSectionHeader({
  title,
  description,
  aside,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {aside ? <div className={styles.sectionAside}>{aside}</div> : null}
    </div>
  );
}

export function AdminDisclosure({
  title,
  summary,
  children,
  tone = "default",
}: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <details className={styles.disclosure} data-tone={tone}>
      <summary>
        <span>
          <strong>{title}</strong>
          {summary ? <small>{summary}</small> : null}
        </span>
        <span className={styles.disclosureMark} aria-hidden="true">
          +
        </span>
      </summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}
