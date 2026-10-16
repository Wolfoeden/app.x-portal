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
export const MailIcon = () => <Svg><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>;
export const DocumentIcon = () => <Svg><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></Svg>;
export const BookIcon = () => <Svg><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M8 7h7" /></Svg>;
export const SparkIcon = ({ size = 22 }: { size?: number }) => (
  <Svg size={size}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Svg>
);
export const TeamCheckIcon = () => <Svg><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20c0-3.6 2.9-6.5 6.5-6.5" /><path d="m14 17 2.5 2.5L21 15" /></Svg>;
export const ShieldIcon = ({ size = 18 }: { size?: number }) => <Svg size={size}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></Svg>;
