import styles from "./actions.module.css";

export type ActionVariant = "primary" | "secondary";

/**
 * Die Klassen eines Knopfs oder Links im Stil der öffentlichen Seiten.
 * `primary` ist der eine Hauptschritt einer Fläche, `secondary` alles daneben.
 */
export function actionClass(
  variant: ActionVariant = "primary",
  options: { pill?: boolean; block?: boolean; compact?: boolean; className?: string } = {},
): string {
  return [
    styles.action,
    styles[variant],
    options.pill ? styles.pill : null,
    options.block ? styles.block : null,
    options.compact ? styles.compact : null,
    options.className ?? null,
  ]
    .filter(Boolean)
    .join(" ");
}
