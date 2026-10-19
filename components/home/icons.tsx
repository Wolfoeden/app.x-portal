import type { ReactNode } from "react";

/**
 * Die Icons der Startseite und der Praxisseite: 24er Raster, Strich 1,7,
 * Farbe aus dem Text. Dekorativ, deshalb ohne eigene Beschriftung.
 */
function Svg({ size = 22, strokeWidth = 1.7, children }: { size?: number; strokeWidth?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const CheckIcon = ({ size = 14 }: { size?: number }) => <Svg size={size} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const ArrowIcon = ({ size = 14 }: { size?: number }) => <Svg size={size} strokeWidth={2}><path d="M4 12h15M13 6l6 6-6 6" /></Svg>;
export const PhoneIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}><path d="M5.5 3.5h3.5l1.7 4.4-2.3 1.6a12 12 0 0 0 5.6 5.6l1.6-2.3 4.4 1.7v3.5a1.5 1.5 0 0 1-1.5 1.5A16 16 0 0 1 4 5a1.5 1.5 0 0 1 1.5-1.5z" /></Svg>
);
