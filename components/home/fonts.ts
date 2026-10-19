import { Bricolage_Grotesque } from "next/font/google";

/**
 * Überschriften der Startseite (Entwurf „Klarsicht“, 19.10.2026): eine
 * kräftige Grotesk in zwei Schnitten. Nur die Startseite lädt sie; die
 * übrigen Seiten bleiben bei Sora (app/layout.tsx).
 */
export const startDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
  variable: "--font-start-display",
});
