/**
 * Die Bildmarke. Bewusst eine eigene Datei und kein Eintrag in `icons.tsx`:
 * die Interface-Icons dort zeichnen alle mit einer 1.75er Kontur auf 24x24,
 * die Marke ist dagegen eine gefüllte Form. Sie steht hier einmal, weil sie an
 * drei Stellen gebraucht wird — Sidebar, Browser-Tab und Startbildschirm-Icon.
 */
export const BRAND_MARK_PATHS = [
  "M4.1 1.9 22.8 19.2l-3.6 3.7L1.9 4.1Z",
  "M19.3 1.3l3.4 3.4L4.1 22.1l-2.2-2.2Z",
] as const;

export function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {BRAND_MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
