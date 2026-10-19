import type { ButtonHTMLAttributes, ReactNode } from "react";

import { actionClass } from "./actions";
import styles from "./primitives.module.css";

export function Notice({
  title,
  children,
  tone = "info",
  role,
}: {
  title: string;
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "error";
  role?: "status" | "alert";
}) {
  return (
    <div className={styles.notice} data-tone={tone} role={role}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

/** Der Hauptknopf eines Formulars, im Stil der öffentlichen Seiten. */
export function ActionButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={actionClass("primary", { className: className || undefined })} />;
}

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
